const fs = require('fs');

function extract(file) {
    const text = fs.readFileSync(file, 'utf8');
    const matches = [...text.matchAll(/self\.__next_f\.push\(\[(.*?)\]\)/g)];
    let fullData = '';
    matches.forEach(m => {
        try {
            const parsed = JSON.parse('[' + m[1] + ']');
            fullData += parsed[1];
        } catch(e) {
            console.log(e.message);
        }
    });
    
    // clean up HTML tags
    let clean = fullData.replace(/<[^>]+>/g, '');
    clean = clean.replace(/\\n/g, '\n').replace(/\\"/g, '"');
    
    console.log("=== " + file + " ===");
    
    const relevant = clean.split('\n').filter(line => 
        line.toLowerCase().includes('first_frame') || 
        line.toLowerCase().includes('character') || 
        line.toLowerCase().includes('image_list') ||
        line.toLowerCase().includes('control_image')
    );
    console.log(relevant.join('\n'));
}

['C:/Users/Wing386/.gemini/antigravity-ide/brain/a5b26e04-ec79-40c5-a461-d9ef452c8da8/.system_generated/steps/4363/content.md',
 'C:/Users/Wing386/.gemini/antigravity-ide/brain/a5b26e04-ec79-40c5-a461-d9ef452c8da8/.system_generated/steps/4364/content.md',
 'C:/Users/Wing386/.gemini/antigravity-ide/brain/a5b26e04-ec79-40c5-a461-d9ef452c8da8/.system_generated/steps/4365/content.md',
 'C:/Users/Wing386/.gemini/antigravity-ide/brain/a5b26e04-ec79-40c5-a461-d9ef452c8da8/.system_generated/steps/4366/content.md'].forEach(extract);
