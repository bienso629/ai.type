const fs = require('fs');
const { translate } = require('bing-translate-api');
const glob = require('glob');

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
    const untranslated = JSON.parse(fs.readFileSync('untranslated.json', 'utf-8'));
    console.log(`Need to translate: ${untranslated.length} strings`);
    
    let keyMap = {};
    const enPath = '/home/yenai/Documents/Projects/Typing/ai.type/src/assets/i18n/en.json';
    const viPath = '/home/yenai/Documents/Projects/Typing/ai.type/src/assets/i18n/vi.json';
    let enJson = JSON.parse(fs.readFileSync(enPath, 'utf-8'));
    let viJson = JSON.parse(fs.readFileSync(viPath, 'utf-8'));

    let addedCount = 0;
    
    for (let i = 0; i < untranslated.length; i++) {
        const viStr = untranslated[i];
        try {
            const res = await translate(viStr, 'vi', 'en');
            const enStr = res.translation;
            
            let safeKey = enStr.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').substring(0, 30);
            if (safeKey.endsWith('_')) safeKey = safeKey.slice(0, -1);
            if (safeKey.startsWith('_')) safeKey = safeKey.slice(1);
            if (!safeKey) safeKey = 'str_' + i;
            
            let finalKey = 'app.auto_' + safeKey;
            let counter = 1;
            while (enJson[finalKey]) {
                finalKey = 'app.auto_' + safeKey + '_' + counter;
                counter++;
            }
            
            enJson[finalKey] = enStr;
            viJson[finalKey] = viStr;
            keyMap[viStr] = finalKey;
            addedCount++;
            
            if (i % 50 === 0) {
                console.log(`Translated ${i}/${untranslated.length}`);
                await sleep(1000); // Sleep 1 second every 50 to avoid rate limits
            }
        } catch (e) {
            console.error(`Failed to translate at ${i}:`, e.message);
            // fallback to mock translation if bing fails
            const mockEn = '[EN] ' + viStr;
            let finalKey = 'app.auto_mock_' + i;
            enJson[finalKey] = mockEn;
            viJson[finalKey] = viStr;
            keyMap[viStr] = finalKey;
            addedCount++;
            await sleep(5000); // Sleep longer if failed
        }
    }
    
    fs.writeFileSync(enPath, JSON.stringify(enJson, null, 4));
    fs.writeFileSync(viPath, JSON.stringify(viJson, null, 4));
    console.log(`Dictionaries updated. Added ${addedCount} keys.`);
    
    // Replace in files
    const files = glob.sync('/home/yenai/Documents/Projects/Typing/ai.type/src/app/**/*.html');
    let replacedFiles = 0;
    for (const file of files) {
        let content = fs.readFileSync(file, 'utf-8');
        let newContent = content;
        let changed = false;
        
        for (const [viStr, key] of Object.entries(keyMap)) {
            const escapedStr = viStr.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            
            // Text nodes
            const textRegex = new RegExp(`>(\\s*)${escapedStr}(\\s*)<`, 'g');
            if (textRegex.test(newContent)) {
                newContent = newContent.replace(textRegex, `>$1{{ '${key}' | transloco }}$2<`);
                changed = true;
            }
            
            // Attributes
            const attrNames = ['matTooltip', 'placeholder', 'title', 'label'];
            for (const attr of attrNames) {
                const attrRegex = new RegExp(`\\b${attr}="${escapedStr}"`, 'g');
                if (attrRegex.test(newContent)) {
                    newContent = newContent.replace(attrRegex, `[${attr}]="'${key}' | transloco"`);
                    changed = true;
                }
            }
        }
        
        if (changed) {
            fs.writeFileSync(file, newContent, 'utf-8');
            replacedFiles++;
        }
    }
    console.log(`Modified ${replacedFiles} HTML files.`);
    
    // Pass 3: Process TS files for toastr, alert, confirm
    const tsFiles = glob.sync('/home/yenai/Documents/Projects/Typing/ai.type/src/app/**/*.ts');
    let replacedTs = 0;
    for (const file of tsFiles) {
        let content = fs.readFileSync(file, 'utf-8');
        let newContent = content;
        let changed = false;
        
        for (const [viStr, key] of Object.entries(keyMap)) {
            const escapedStr = viStr.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            
            // Check for toastr.xxx('...') or alert('...') or confirm('...')
            // We'll just replace the string literal if it's strictly matching and inside alert/toastr
            const methods = ['alert', 'confirm', 'success', 'error', 'warning', 'info'];
            for (const method of methods) {
                const regex1 = new RegExp(`\\b${method}\\s*\\(\\s*'${escapedStr}'\\s*\\)`, 'g');
                const regex2 = new RegExp(`\\b${method}\\s*\\(\\s*"${escapedStr}"\\s*\\)`, 'g');
                const regex3 = new RegExp(`\\b${method}\\s*\\(\\s*\`${escapedStr}\`\\s*\\)`, 'g');
                
                // For this we must ensure TranslocoService is available. 
                // Since injecting dynamically is hard, we can just replace the string with a transloco translation if possible, or just leave TS alone if it's too risky.
                // It's safer to only modify HTML for this automated pass.
            }
        }
    }
}

run().catch(console.error);
