function generateReferralCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'MLFD';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function getTier(visitCount) {
  if (visitCount >= 50) return { tier: 'GOLD', discount: '50%' };
  if (visitCount >= 20) return { tier: 'SILVER', discount: '25%' };
  if (visitCount >= 5) return { tier: 'BRONZE', discount: '10%' };
  return { tier: 'NONE', discount: '0%' };
}

function getNextTier(visitCount) {
  if (visitCount >= 50) return null;
  if (visitCount >= 20) return { tier: 'GOLD', at: 50, remaining: 50 - visitCount };
  if (visitCount >= 5) return { tier: 'SILVER', at: 20, remaining: 20 - visitCount };
  return { tier: 'BRONZE', at: 5, remaining: 5 - visitCount };
}

module.exports = { generateReferralCode, getTier, getNextTier };
