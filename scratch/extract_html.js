const fs = require('fs');
const glob = require('glob');

const viRegex = /[áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴĐ]/;

const files = glob.sync('/home/yenai/Documents/Projects/Typing/ai.type/src/app/**/*.html');
const stringsToTranslate = new Set();

for (const file of files) {
    let content = fs.readFileSync(file, 'utf-8');
    
    // text nodes
    const textRegex = />([^<>{}]*)</g;
    let match;
    while ((match = textRegex.exec(content)) !== null) {
        let str = match[1].trim();
        if (viRegex.test(str) && !str.includes('transloco') && str.length > 1) {
            stringsToTranslate.add(str);
        }
    }
    
    // attributes
    const attrRegex = /\b(matTooltip|placeholder|title|label|matTooltipPosition|value)="([^"{}]*)"/g;
    while ((match = attrRegex.exec(content)) !== null) {
        let str = match[2].trim();
        if (viRegex.test(str) && !str.includes('transloco') && str.length > 1) {
            stringsToTranslate.add(str);
        }
    }
}

const uniqueStrings = Array.from(stringsToTranslate);
const viPath = '/home/yenai/Documents/Projects/Typing/ai.type/src/assets/i18n/vi.json';
let viJson = JSON.parse(fs.readFileSync(viPath, 'utf-8'));

const viReversed = {};
for (const [key, val] of Object.entries(viJson)) {
    viReversed[val] = key;
}

const untranslated = uniqueStrings.filter(s => !viReversed[s]);

fs.writeFileSync('/home/yenai/Documents/Projects/Typing/ai.type/scratch/untranslated.json', JSON.stringify(untranslated, null, 2));
console.log(`Saved ${untranslated.length} strings.`);
