# -*- coding: utf-8 -*-
import io, sys

path = 'src/app/modules/admin/account/profile/sontinh-scene.service.ts'
src = io.open(path, encoding='utf-8').read()
orig_len = len(src)
fails = []

def rep(old, new, tag):
    global src
    n = src.count(old)
    if n != 1:
        fails.append('[%s] count=%d' % (tag, n))
        return
    src = src.replace(old, new, 1)
    print('OK [%s]' % tag)

# --- VA 2a: thuoc tinh vong doi hat luc spawn ---
old_spawn = """              ph: Math.random() * Math.PI * 2,
              settled: false,
              restY: 0
            };
            p.restY = restYAt(p.x, p.z);"""
new_spawn = """              ph: Math.random() * Math.PI * 2,
              settled: false,
              restY: 0,
              // Vong doi hat tuyet: Roi -> Dong -> Nam random -> Tan chy -> Tai sinh
              snowAge: 0,
              meltDelay: 0,
              melting: false,
              meltT: 0,
              gone: false,
              onProp: false,
              footR2: Math.pow(size * (0.55 + Math.random() * 0.25), 2)
            };
            p.restY = restYAt(p.x, p.z);"""
rep(old_spawn, new_spawn, 'V2a-spawn-lifecycle')

# --- VA 2b: bug trong V1 — footR2 ngoai pham vi, giu footR2 cua hat ---
rep("""                    p.onProp = false;
                    p.footR2 = footR2;
""", """                    p.onProp = false;
""", 'V2b-fix-footR2-scope')

# --- VA 2c: bug trong V1 — guard !p.onProp chan hat sa xuong khi do vat bi keo di ---
rep("""                  else if (surf < p.y - 0.02 && !p.onProp) { p.y = Math.max(surf, p.y - dt * 2.5); } // nền hạ: hạ nhẹ
""", """                  else if (surf < p.y - 0.02) { p.y = Math.max(surf, p.y - dt * 2.5); } // nền hạ/thay đổi: hạt sà theo bề mặt
""", 'V2c-fix-descend-guard')

if fails:
    print('THAT BAI:', fails)
    sys.exit(1)

io.open(path, 'w', encoding='utf-8').write(src)
print('len %d -> %d' % (orig_len, len(src)))
