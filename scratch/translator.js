const fs = require('fs');
const glob = require('glob');
const { translate } = require('@vitalets/google-translate-api');

const viRegex = /[áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴĐ]/;

async function run() {
    const files = glob.sync('/home/yenai/Documents/Projects/Typing/ai.type/src/app/**/*.html');
    const stringsToTranslate = new Set();
    
    // Pass 1: Extract all strings
    for (const file of files) {
        let content = fs.readFileSync(file, 'utf-8');
        
        // Match text nodes
        const textRegex = />([^<>{}]*)</g;
        let match;
        while ((match = textRegex.exec(content)) !== null) {
            let str = match[1].trim();
            if (viRegex.test(str) && !str.includes('transloco') && str.length > 1) {
                stringsToTranslate.add(str);
            }
        }
        
        // Match attributes
        const attrRegex = /\b(matTooltip|placeholder|title|label|matTooltipPosition|value)="([^"{}]*)"/g;
        while ((match = attrRegex.exec(content)) !== null) {
            let str = match[2].trim();
            if (viRegex.test(str) && !str.includes('transloco') && str.length > 1) {
                stringsToTranslate.add(str);
            }
        }
    }
    
    const uniqueStrings = Array.from(stringsToTranslate);
    console.log(`Found ${uniqueStrings.length} unique Vietnamese strings in HTML files.`);
    
    // Load existing i18n
    const enPath = '/home/yenai/Documents/Projects/Typing/ai.type/src/assets/i18n/en.json';
    const viPath = '/home/yenai/Documents/Projects/Typing/ai.type/src/assets/i18n/vi.json';
    let enJson = JSON.parse(fs.readFileSync(enPath, 'utf-8'));
    let viJson = JSON.parse(fs.readFileSync(viPath, 'utf-8'));
    
    let keyMap = {}; // mapping original string to key
    
    // Check if some strings are already translated in vi.json to avoid duplicates
    const viReversed = {};
    for (const [key, val] of Object.entries(viJson)) {
        viReversed[val] = key;
    }
    
    console.log("Translating...");
    let addedCount = 0;
    for (let i = 0; i < uniqueStrings.length; i++) {
        const viStr = uniqueStrings[i];
        
        if (viReversed[viStr]) {
            keyMap[viStr] = viReversed[viStr];
            continue;
        }
        
        try {
            const res = await translate(viStr, { to: 'en' });
            const enStr = res.text;
            
            // Create a safe key from english translation
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
            viReversed[viStr] = finalKey;
            addedCount++;
            
            if (i % 20 === 0) console.log(`Translated ${i}/${uniqueStrings.length}`);
        } catch (e) {
            console.error(`Failed to translate: ${viStr}`, e.message);
        }
    }
    
    // Save i18n
    fs.writeFileSync(enPath, JSON.stringify(enJson, null, 4));
    fs.writeFileSync(viPath, JSON.stringify(viJson, null, 4));
    console.log(`Added ${addedCount} new translations.`);
    
    // Pass 2: Replace in files
    let replacedFiles = 0;
    for (const file of files) {
        let content = fs.readFileSync(file, 'utf-8');
        let newContent = content;
        let changed = false;
        
        // We iterate through all keys and replace carefully
        // Because of HTML structure, it's safer to use a custom replacer
        for (const [viStr, key] of Object.entries(keyMap)) {
            // Escape special chars for regex
            const escapedStr = viStr.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            
            // 1. Replace text nodes: > string < -> > {{ 'key' | transloco }} <
            // Allow arbitrary whitespace
            const textRegex = new RegExp(`>(\\s*)${escapedStr}(\\s*)<`, 'g');
            if (textRegex.test(newContent)) {
                newContent = newContent.replace(textRegex, `>$1{{ '${key}' | transloco }}$2<`);
                changed = true;
            }
            
            // 2. Replace attributes: attr="string" -> [attr]="'key' | transloco"
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
}

run().catch(console.error);
