const fs = require('fs');
let data = fs.readFileSync('c:/Users/Wing386/ai.type/src/app/modules/admin/content/ai-tts/tools/video-timeline-dialog.component.html', 'utf8');

const startStr = '<ng-container *ngIf="scene.videos && scene.videos.length > tIdx">';
const endStr = '</ng-container>\r\n                            </ng-container>\r\n                        </ng-container>';

const startIndex = data.indexOf(startStr);
const endIndex = data.indexOf(endStr, startIndex);

if (startIndex === -1 || endIndex === -1) {
    console.log('Not found!');
    process.exit(1);
}

let block = data.substring(startIndex, endIndex);

// First, replace the ng-container opening
const oldOpen = '<ng-container *ngIf="scene.videos && scene.videos.length > tIdx">\r\n                                <ng-container *ngIf="scene.videos[tIdx] as video">';
let newOpen = `<ng-container *ngIf="scene.videos">\r\n                                <ng-container *ngFor="let video of scene.videos; let vIdx = index">\r\n                                    <ng-container *ngIf="(tIdx === 0 && vIdx === 0) || (tIdx === 1 && vIdx > 0)">`;
if (block.indexOf(oldOpen) === -1) {
    // maybe line endings are different
    console.log("Could not find exact block opening to replace");
} else {
    block = block.replace(oldOpen, newOpen);
}

// Then replace tIdx with vIdx
block = block.replace(/tIdx/g, 'vIdx');

// But put tIdx back in our new expression!
block = block.replace('(vIdx === 0 && vIdx === 0) || (vIdx === 1 && vIdx > 0)', '(tIdx === 0 && vIdx === 0) || (tIdx === 1 && vIdx > 0)');

// Put back block
block += '</ng-container>\r\n'; // because we opened one more

const newData = data.substring(0, startIndex) + block + data.substring(endIndex);
fs.writeFileSync('c:/Users/Wing386/ai.type/src/app/modules/admin/content/ai-tts/tools/video-timeline-dialog.component.html', newData, 'utf8');
console.log('Done replacement in HTML');
