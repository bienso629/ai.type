const fs = require('fs');
const filePath = 'c:/Users/Wing386/ai.type/src/app/modules/admin/content/ai-tts/tools/video-timeline-dialog.component.html';
let data = fs.readFileSync(filePath, 'utf8');

const searchStr = `<div
            class="w-full flex-grow flex-shrink min-h-[20vh] bg-black flex flex-col items-center justify-center relative flex-shrink group">
            <video #mainVideoPlayer`;

const replaceStr = `<div
            class="w-full flex-grow flex-shrink min-h-[20vh] bg-slate-900 p-4 flex flex-col items-center justify-center relative flex-shrink group">
            <div class="w-full h-full relative flex flex-col items-center justify-center bg-black rounded-2xl overflow-hidden shadow-2xl flex-shrink">
            <video #mainVideoPlayer`;

if (data.indexOf(searchStr) !== -1) {
    data = data.replace(searchStr, replaceStr);

    // Now we need to close the extra div before the '<!-- Global Timeline Play/Pause Overlay Button -->'
    const endSearch = `</audio>

            <!-- Global Timeline Play/Pause Overlay Button -->`;
    const endReplace = `</audio>
            </div>

            <!-- Global Timeline Play/Pause Overlay Button -->`;
    
    if (data.indexOf(endSearch) !== -1) {
        data = data.replace(endSearch, endReplace);
        fs.writeFileSync(filePath, data, 'utf8');
        console.log('Fixed preview styling successfully.');
    } else {
        console.log('End tag not found!');
    }
} else {
    console.log('Start tag not found!');
}
