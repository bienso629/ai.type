const https = require('https');
const options = {
  hostname: 'apiv1.type.vn',
  port: 443,
  path: '/v1/crawl/node/collection/node/remove',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
};
const req = https.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.on('data', (d) => process.stdout.write(d));
});
req.on('error', (e) => console.error(e));
req.write(JSON.stringify({ uuids: ["fake-uuid"] }));
req.end();
