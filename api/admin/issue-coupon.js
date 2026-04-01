const { supabase } = require('../_lib/supabase');
const { sendCouponAlimtalk } = require('../_lib/ncloud-alimtalk');

function generateCouponCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'FREE';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // Admin auth
  const password = req.headers['x-admin-password'];
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: '인증 실패' });
  }

  const { name, phone, blogUrl, product } = req.body;

  if (!name || !phone) {
    return res.status(400).json({ error: '이름과 전화번호를 입력하세요.' });
  }

  // Normalize phone
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  if (!/^01[0-9]{8,9}$/.test(cleanPhone)) {
    return res.status(400).json({ error: '올바른 전화번호를 입력하세요.' });
  }
  const formattedPhone = cleanPhone.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3');

  // Generate unique coupon code
  let couponCode;
  let attempts = 0;
  while (attempts < 5) {
    couponCode = generateCouponCode();
    const { data: existing } = await supabase
      .from('influencer_coupons')
      .select('id')
      .eq('coupon_code', couponCode)
      .single();
    if (!existing) break;
    attempts++;
  }

  // Insert coupon
  const { data, error } = await supabase
    .from('influencer_coupons')
    .insert({
      phone: formattedPhone,
      name,
      blog_url: blogUrl || null,
      product: product || '편식개선키트',
      coupon_code: couponCode,
      status: 'issued'
    })
    .select()
    .single();

  if (error) {
    console.error('Coupon insert error:', error);
    return res.status(500).json({ error: '쿠폰 생성 실패: ' + error.message });
  }

  // Send 알림톡 using existing couponUpgrade template
  let alimtalkSent = false;
  try {
    const result = await sendCouponAlimtalk({
      phone: formattedPhone,
      visitCount: 0,
      discount: '100%',
      referralLink: 'https://mealfred.com/foodbridge.html'
    });
    alimtalkSent = result.success;

    // Update alimtalk status
    await supabase
      .from('influencer_coupons')
      .update({
        alimtalk_sent: alimtalkSent,
        alimtalk_sent_at: alimtalkSent ? new Date().toISOString() : null
      })
      .eq('id', data.id);
  } catch (e) {
    console.error('Alimtalk error:', e);
  }

  return res.status(200).json({
    success: true,
    couponCode,
    alimtalkSent,
    coupon: data
  });
};
