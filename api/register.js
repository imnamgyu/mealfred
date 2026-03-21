const { supabase } = require('./_lib/supabase');
const { generateReferralCode } = require('./_lib/referral');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { phone, course, referredBy } = req.body || {};

  // Validate phone
  const cleanPhone = (phone || '').replace(/[^0-9]/g, '');
  if (!/^01[016789]\d{7,8}$/.test(cleanPhone)) {
    return res.status(400).json({ success: false, message: '올바른 전화번호를 입력해주세요.' });
  }

  // Check if already registered
  const { data: existing } = await supabase
    .from('earlybird_registrations')
    .select('referral_code')
    .eq('phone', cleanPhone)
    .single();

  if (existing) {
    return res.status(200).json({
      success: true,
      referralCode: existing.referral_code,
      referralLink: `https://mealfred.com/?ref=${existing.referral_code}`,
      isExisting: true
    });
  }

  // Generate unique referral code (retry on collision)
  let referralCode;
  let attempts = 0;
  while (attempts < 5) {
    referralCode = generateReferralCode();
    const { data: collision } = await supabase
      .from('earlybird_registrations')
      .select('id')
      .eq('referral_code', referralCode)
      .single();
    if (!collision) break;
    attempts++;
  }

  // Insert registration
  const { error: insertError } = await supabase
    .from('earlybird_registrations')
    .insert({
      phone: cleanPhone,
      referral_code: referralCode,
      course: course || null,
      referred_by: referredBy || null
    });

  if (insertError) {
    console.error('Insert error:', insertError);
    return res.status(500).json({ success: false, message: '등록 중 오류가 발생했습니다.' });
  }

  // Send 알림톡 via Naver Cloud SENS
  const referralLink = `https://mealfred.com/?ref=${referralCode}`;
  try {
    const { sendAlimtalk } = require('./_lib/ncloud-alimtalk');
    const alimResult = await sendAlimtalk({ phone: cleanPhone, referralCode, referralLink, course: course || null });
    if (alimResult.success) {
      await supabase.from('earlybird_registrations').update({ alimtalk_sent: true, alimtalk_sent_at: new Date().toISOString() }).eq('referral_code', referralCode);
    }
  } catch (e) {
    console.error('Alimtalk error:', e);
    // 알림톡 실패해도 등록은 성공 처리
  }

  return res.status(200).json({
    success: true,
    referralCode,
    referralLink,
    isExisting: false
  });
};
