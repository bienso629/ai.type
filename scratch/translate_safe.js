const fs = require('fs');
const translate = require('translate-google');
const glob = require('glob');

async function run() {
    const untranslated = JSON.parse(fs.readFileSync('untranslated.json', 'utf-8'));
    console.log(`Need to translate: ${untranslated.length} strings`);
    
    let keyMap = {};
    const enPath = '/home/yenai/Documents/Projects/Typing/ai.type/src/assets/i18n/en.json';
    const viPath = '/home/yenai/Documents/Projects/Typing/ai.type/src/assets/i18n/vi.json';
    let enJson = JSON.parse(fs.readFileSync(enPath, 'utf-8'));
    let viJson = JSON.parse(fs.readFileSync(viPath, 'utf-8'));

    // Try batch translation
    // translate-google supports translating an array or object!
    const objToTranslate = {};
    for (let i = 0; i < untranslated.length; i++) {
        objToTranslate[`id_${i}`] = untranslated[i];
    }
    
    try {
        console.log("Sending batch request to Google Translate...");
        const res = await translate(objToTranslate, {from: 'vi', to: 'en'});
        console.log("Batch translation successful!");
        
        for (let i = 0; i < untranslated.length; i++) {
            const viStr = untranslated[i];
            const enStr = res[`id_${i}`];
            
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
        }
        
        fs.writeFileSync(enPath, JSON.stringify(enJson, null, 4));
        fs.writeFileSync(viPath, JSON.stringify(viJson, null, 4));
        console.log("Dictionaries updated.");
        
        // Replace in files
        const files = glob.sync('/home/yenai/Documents/Projects/Typing/ai.type/src/app/**/*.html');
        let replacedFiles = 0;
        for (const file of files) {
            let content = fs.readFileSync(file, 'utf-8');
            let newContent = content;
            let changed = false;
            
            for (const [viStr, key] of Object.entries(keyMap)) {
                const escapedStr = viStr.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                
                const textRegex = new RegExp(`>(\\s*)${escapedStr}(\\s*)<`, 'g');
                if (textRegex.test(newContent)) {
                    newContent = newContent.replace(textRegex, `>$1{{ '${key}' | transloco }}$2<`);
                    changed = true;
                }
                
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
        
    } catch (e) {
        console.error("Batch translation failed:", e);
    }
}

run().catch(console.error);
