const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');
for (const db of ['/home/yenai/Documents/ai.type/data/articles.sqlite', '/home/yenai/Documents/ai.type/data/articles_admin.sqlite']) {
  const conn = new DatabaseSync(db);
  const cols = conn.prepare("PRAGMA table_info('local_articles')").all().map(c => c.name);
  console.log('===', db, 'cols:', cols.join(','));
  const rows = conn.prepare("SELECT * FROM local_articles WHERE id='RRfKhBTPpv' OR title LIKE '%Phong Vị%' OR title LIKE '%Tiếu Ngạo%'").all();
  for (const r of rows) {
    console.log('--- ROW id:', r.id, '| title:', (r.title||'').slice(0,60), '| is_encrypted:', r.is_encrypted);
    for (const k of Object.keys(r)) {
      const v = r[k];
      if (v && typeof v === 'string' && (v.includes('"salt"') || v.includes('salt'))) console.log('  FIELD', k, '(has salt):', String(v).slice(0,200));
    }
    const payloadRaw = r.encrypted_payload || r.cipher || r.payload || null;
    let payload = payloadRaw;
    if (typeof payload === 'string') { try { payload = JSON.parse(payload); } catch(e){ payload=null; } }
    if (payload && payload.salt && payload.iv && payload.data) {
      console.log('  payload found: salt len', payload.salt.length, 'iv', payload.iv, 'data len', payload.data.length);
      try {
        const salt = Buffer.from(payload.salt, 'hex');
        const iv = Buffer.from(payload.iv, 'hex');
        const key = crypto.pbkdf2Sync('123123', salt, 100000, 32, 'sha256');
        const d = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let out = d.update(payload.data, 'hex', 'utf8'); out += d.final('utf8');
        console.log('  DECRYPT 123123 => OK:', out.slice(0,150).replace(/\n/g,' '));
      } catch(e) { console.log('  DECRYPT 123123 => FAIL:', e.message); }
    } else {
      console.log('  content field (200):', String(r.content||'').slice(0,200));
    }
  }
  conn.close();
}
console.log('FIND2 DONE');
