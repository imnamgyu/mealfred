const { supabase } = require('./_lib/supabase');
const { getTier, getNextTier } = require('./_lib/referral');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const code = req.query.code;
  if (!code) return res.status(400).json({ success: false, message: 'Missing code' });

  const { data, error } = await supabase
    .from('earlybird_registrations')
    .select('referral_code, referral_visit_count, coupon_tier, course, created_at')
    .eq('referral_code', code)
    .single();

  if (error || !data) return res.status(404).json({ success: false, message: 'Not found' });

  const tier = getTier(data.referral_visit_count);
  const next = getNextTier(data.referral_visit_count);

  return res.status(200).json({
    success: true,
    referralCode: data.referral_code,
    visitCount: data.referral_visit_count,
    currentTier: tier.tier,
    currentDiscount: tier.discount,
    nextTier: next ? next.tier : null,
    nextTierAt: next ? next.at : null,
    remaining: next ? next.remaining : 0
  });
};
