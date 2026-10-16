const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
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
['/home/yenai/Documents/ai.type/data', '/home/yenai/.config/AI.Type'].forEach(walk);
for (const db of dbs) {
  let conn; try { conn = new DatabaseSync(db); } catch (e) { continue; }
  try {
    const tables = conn.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
    for (const tn of tables) {
      const cnt = conn.prepare(`SELECT COUNT(*) as c FROM "${tn}"`).get().c;
      if (cnt > 0 && /article|local|post|draft/i.test(tn)) console.log(db, '|', tn, '| rows:', cnt);
    }
  } catch (e) {} finally { try { conn.close(); } catch (e) {} }
}
console.log('LIST DONE');
