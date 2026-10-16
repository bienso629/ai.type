const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const roots = ['/home/yenai/Documents/ai.type/data', '/home/yenai/.config/AI.Type'];
const dbs = [];
function walk(d) {
  let entries; try { entries = fs.readdirSync(d); } catch (e) { return; }
  for (const f of entries) {
    const p = path.join(d, f);
    let st; try { st = fs.statSync(p); } catch (e) { continue; }
    if (st.isDirectory()) walk(p);
    else if (/\.(sqlite|sqlite3|db)$/.test(f) && st.size > 0) dbs.push(p);
  }
}
roots.forEach(walk);

for (const db of dbs) {
  let conn; try { conn = new DatabaseSync(db); } catch (e) { continue; }
  try {
    const tables = conn.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    for (const t of tables) {
      const tn = t.name;
      let cols; try { cols = conn.prepare(`PRAGMA table_info("${tn}")`).all().map(c => c.name); } catch (e) { continue; }
      if (!cols.includes('encrypted_payload')) continue;
      let rows; try { rows = conn.prepare(`SELECT * FROM "${tn}" WHERE id='RRfKhBTPpv' OR title LIKE '%Phong Vị%' OR title LIKE '%Tiếu Ngạo%' LIMIT 5`).all(); } catch (e) { continue; }
      for (const r of rows) {
        const payloadRaw = r.encrypted_payload;
        console.log('=== FOUND ===');
        console.log('DB:', db, '| TABLE:', tn, '| id:', r.id, '| title:', r.title, '| is_encrypted:', r.is_encrypted);
        let payload = payloadRaw;
        if (typeof payload === 'string') { try { payload = JSON.parse(payload); } catch (e) { payload = null; } }
        if (payload && payload.salt && payload.iv && payload.data) {
          console.log('payload.salt:', payload.salt.slice(0, 32), '| payload.iv:', payload.iv, '| data len:', payload.data.length);
          for (const pwd of ['123123']) {
            try {
              const salt = Buffer.from(payload.salt, 'hex');
              const iv = Buffer.from(payload.iv, 'hex');
              const key = crypto.pbkdf2Sync(pwd, salt, 100000, 32, 'sha256');
              const d = crypto.createDecipheriv('aes-256-cbc', key, iv);
              let out = d.update(payload.data, 'hex', 'utf8'); out += d.final('utf8');
              console.log('DECRYPT with', JSON.stringify(pwd), '=> OK:', out.slice(0, 150).replace(/\n/g, ' '));
            } catch (e) { console.log('DECRYPT with', JSON.stringify(pwd), '=> FAIL:', e.message); }
          }
        } else {
          console.log('payload raw (300):', String(payloadRaw).slice(0, 300));
        }
      }
    }
  } finally { try { conn.close(); } catch (e) {} }
}
console.log('SCAN DONE, dbs checked =', dbs.length);
