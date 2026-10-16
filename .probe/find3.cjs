const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');
for (const db of ['/home/yenai/Documents/ai.type/data/articles.sqlite', '/home/yenai/Documents/ai.type/data/articles_admin.sqlite']) {
  const conn = new DatabaseSync(db);
  const rows = conn.prepare("SELECT * FROM local_articles WHERE uuid='RRfKhBTPpv' OR title LIKE '%Phong Vị%' OR title LIKE '%Tiếu Ngạo%'").all();
  console.log('===', db, '| matched:', rows.length);
  for (const r of rows) {
    console.log('--- uuid:', r.uuid, '| title:', (r.title||'').slice(0,60), '| is_encrypted:', r.is_encrypted, '| format:', r.format, '| is_local:', r.is_local);
    const payloadRaw = r.encrypted_payload;
    let payload = payloadRaw;
    if (typeof payload === 'string') { try { payload = JSON.parse(payload); } catch(e){ payload=null; } }
    if (payload && payload.salt && payload.iv && payload.data) {
      console.log('  payload: salt_len', payload.salt.length, 'iv', payload.iv, 'data_len', payload.data.length);
      try {
        const salt = Buffer.from(payload.salt, 'hex');
        const iv = Buffer.from(payload.iv, 'hex');
        const key = crypto.pbkdf2Sync('123123', salt, 100000, 32, 'sha256');
        const d = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let out = d.update(payload.data, 'hex', 'utf8'); out += d.final('utf8');
        console.log('  DECRYPT 123123 => OK, len', out.length, ':', out.slice(0,120).replace(/\s+/g,' '));
      } catch(e) { console.log('  DECRYPT 123123 => FAIL:', e.message); }
    } else {
      console.log('  content(200):', String(r.content||'').slice(0,200).replace(/\s+/g,' '));
      console.log('  source_json(300):', String(r.source_json||'').slice(0,300));
    }
  }
  conn.close();
}
console.log('FIND3 DONE');
