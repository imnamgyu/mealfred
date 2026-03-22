const { supabase } = require('./_lib/supabase');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { referralCode, pageUrl } = req.body || {};
  if (!referralCode) return res.status(400).json({ success: false });

  // Verify referral code exists and get current state
  const { data: reg } = await supabase
    .from('earlybird_registrations')
    .select('id, phone, referral_visit_count, coupon_tier')
    .eq('referral_code', referralCode)
    .single();

  if (!reg) return res.status(404).json({ success: false, message: 'Invalid referral code' });

  const prevTier = reg.coupon_tier;
  const prevCount = reg.referral_visit_count;

  // Create visitor fingerprint from IP + User-Agent
  const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
  const ua = req.headers['user-agent'] || 'unknown';
  const fingerprint = crypto.createHash('sha256').update(ip + ua).digest('hex').slice(0, 16);

  // Insert visit (ON CONFLICT DO NOTHING for dedup)
  const { error } = await supabase
    .from('referral_visits')
    .upsert(
      {
        referral_code: referralCode,
        visitor_fingerprint: fingerprint,
        visitor_ip: ip.split(',')[0].trim(),
        user_agent: ua.slice(0, 500),
        page_url: pageUrl || null
      },
      { onConflict: 'referral_code,visitor_fingerprint', ignoreDuplicates: true }
    );

  // Check if tier upgraded (DB trigger already updated the count/tier)
  const { data: updated } = await supabase
    .from('earlybird_registrations')
    .select('referral_visit_count, coupon_tier')
    .eq('referral_code', referralCode)
    .single();

  if (updated && updated.coupon_tier !== prevTier && updated.coupon_tier !== 'NONE') {
    try {
      const { sendCouponAlimtalk } = require('./_lib/ncloud-alimtalk');
      const tierInfo = {
        BRONZE: { discount: '5%', next: '50명 방문 시 10% 할인 쿠폰을 받을 수 있어요!' },
        SILVER: { discount: '10%', next: '100명 방문 시 15% 할인 쿠폰을 받을 수 있어요!' },
        GOLD: { discount: '15%', next: '최고 혜택 달성! 축하합니다!' }
      };
      const info = tierInfo[updated.coupon_tier];
      const refLink = `https://mealfred.com/?ref=${referralCode}`;
      await sendCouponAlimtalk({
        phone: reg.phone,
        visitCount: updated.referral_visit_count,
        discount: info.discount,
        nextMessage: info.next,
        referralLink: refLink
      });
    } catch (e) {
      console.error('Coupon notification error:', e);
    }
  }

  return res.status(200).json({ success: true, tracked: !error });
};
