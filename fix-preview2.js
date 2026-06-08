const fs = require('fs');
const filePath = 'c:/Users/Wing386/ai.type/src/app/modules/admin/content/ai-tts/tools/video-timeline-dialog.component.html';
let data = fs.readFileSync(filePath, 'utf8');

const searchStr = `<div class="w-full flex-grow flex-shrink min-h-[20vh] bg-slate-900 p-4 flex flex-col items-center justify-center relative group">
            <div class="w-full h-full relative flex flex-col items-center justify-center bg-black rounded-xl overflow-hidden shadow-xl">`;

const replaceStr = `<div class="w-full flex-grow flex-shrink min-h-[20vh] bg-black p-4 md:p-6 flex flex-col items-center justify-center relative group">
            <div class="w-full h-full relative flex flex-col items-center justify-center bg-black rounded-2xl overflow-hidden">`;

if (data.indexOf(searchStr) !== -1) {
    data = data.replace(searchStr, replaceStr);
    fs.writeFileSync(filePath, data, 'utf8');
    console.log('Fixed preview styling successfully.');
} else {
    console.log('Start tag not found!');
}
