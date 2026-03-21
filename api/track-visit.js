const { supabase } = require('./_lib/supabase');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { referralCode, pageUrl } = req.body || {};
  if (!referralCode) return res.status(400).json({ success: false });

  // Verify referral code exists
  const { data: reg } = await supabase
    .from('earlybird_registrations')
    .select('id')
    .eq('referral_code', referralCode)
    .single();

  if (!reg) return res.status(404).json({ success: false, message: 'Invalid referral code' });

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

  return res.status(200).json({ success: true, tracked: !error });
};
