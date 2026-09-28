const fs = require('fs');
let file = 'src/app/modules/admin/content/ai-tts/ai-tts.component.ts';
let content = fs.readFileSync(file, 'utf8');

const target = `            // Kiểm tra thêm qua auth accounts nếu chưa active
            if (!pluginActive && (window as any).electronAPI && (window as any).electronAPI.getColabAuthStatus) {
                try {
                    const authRes = await (window as any).electronAPI.getColabAuthStatus();
                    if (authRes && ((Array.isArray(authRes.accounts) && authRes.accounts.length > 0) || authRes.authenticated)) {
                        pluginActive = true;
                    }
                } catch (e) {}
            }

            if (!pluginActive && sstUrl) {
                pluginActive = true;
            }`;

content = content.replace(target, '');
fs.writeFileSync(file, content, 'utf8');
