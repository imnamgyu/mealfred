function generateReferralCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'MLFD';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function getTier(visitCount) {
  if (visitCount >= 100) return { tier: 'GOLD', discount: '15%' };
  if (visitCount >= 50) return { tier: 'SILVER', discount: '10%' };
  if (visitCount >= 10) return { tier: 'BRONZE', discount: '5%' };
  return { tier: 'NONE', discount: '0%' };
}

function getNextTier(visitCount) {
  if (visitCount >= 100) return null;
  if (visitCount >= 50) return { tier: 'GOLD', at: 100, remaining: 100 - visitCount };
  if (visitCount >= 10) return { tier: 'SILVER', at: 50, remaining: 50 - visitCount };
  return { tier: 'BRONZE', at: 10, remaining: 10 - visitCount };
}

module.exports = { generateReferralCode, getTier, getNextTier };
