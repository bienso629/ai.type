const fs = require('fs');
const file = 'src/app/modules/admin/content/ai-image/ai-image.component.ts';
let content = fs.readFileSync(file, 'utf8');

// Fix 1: fetch logic
const fetchTarget = `                next: async (result) => {
                    if (result) this.imageUrls = result.files;
                },`;
const fetchReplacement = `                next: async (result) => {
                    if (result && result.files) {
                        this.imageUrls = result.files;
                    } else {
                        if (!this.imageUrls) this.imageUrls = [];
                    }
                },`;

// Fix 2: processAndUploadImage fallback
const unshiftTarget = `            const base64Url = \`data:\${finalMime || 'image/png'};base64,\${finalBase64}\`;
            this.imageUrls.unshift(base64Url);`;
const unshiftReplacement = `            const base64Url = \`data:\${finalMime || 'image/png'};base64,\${finalBase64}\`;
            if (!this.imageUrls) this.imageUrls = [];
            this.imageUrls.unshift(base64Url);`;

if (content.includes(fetchTarget)) {
    content = content.replace(fetchTarget, fetchReplacement);
}
if (content.includes(unshiftTarget)) {
    content = content.replace(unshiftTarget, unshiftReplacement);
}

fs.writeFileSync(file, content, 'utf8');
console.log("Success");
