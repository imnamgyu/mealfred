const crypto = require('crypto');
const https = require('https');

function makeSignature(method, url, timestamp, accessKey, secretKey) {
  const space = ' ';
  const newLine = '\n';
  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(method + space + url + newLine + timestamp + newLine + accessKey);
  return hmac.digest('base64');
}

async function sendAlimtalk({ phone, referralCode, referralLink, course }) {
  const accessKey = process.env.NCP_ACCESS_KEY;
  const secretKey = process.env.NCP_SECRET_KEY;
  const serviceId = process.env.NCP_SENS_PROJECT_ID;
  const pfId = process.env.NCP_KAKAO_PF_ID;

  if (!accessKey || !secretKey || !serviceId || !pfId) {
    console.error('Missing NCP environment variables');
    return { success: false, error: 'Missing config' };
  }

  const timestamp = Date.now().toString();
  const urlPath = `/alimtalk/v2/services/${serviceId}/messages`;
  const signature = makeSignature('POST', urlPath, timestamp, accessKey, secretKey);

  // Format phone: add +82 country code
  const intlPhone = '82' + phone.replace(/^0/, '');

  const body = JSON.stringify({
    plusFriendId: pfId,
    templateCode: process.env.NCP_ALIMTALK_TEMPLATE_CODE || 'earlybird_register',
    messages: [
      {
        countryCode: '82',
        to: phone,
        content: `밀프레드 편식극복키트 얼리버드 등록이 완료되었습니다.

출시 시 이 번호로 알림을 보내드리겠습니다.

나만의 개인 링크가 발급되었습니다.
아래 링크를 주변에 공유해보세요!

${referralLink}

이 링크를 통해 방문한 수에 따라 추가 할인 혜택을 드립니다.

10명 이상 방문 → 5% 할인 쿠폰
50명 이상 방문 → 10% 할인 쿠폰
100명 이상 방문 → 15% 할인 쿠폰`
      }
    ]
  });

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'sens.apigw.ntruss.com',
        path: urlPath,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'x-ncp-apigw-timestamp': timestamp,
          'x-ncp-iam-access-key': accessKey,
          'x-ncp-apigw-signature-v2': signature
        }
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            console.log('Alimtalk response:', parsed);
            resolve({ success: res.statusCode === 202, data: parsed });
          } catch (e) {
            console.error('Alimtalk parse error:', data);
            resolve({ success: false, error: data });
          }
        });
      }
    );
    req.on('error', (e) => {
      console.error('Alimtalk request error:', e);
      resolve({ success: false, error: e.message });
    });
    req.write(body);
    req.end();
  });
}

module.exports = { sendAlimtalk };
