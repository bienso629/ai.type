const fs = require('fs');
const htmlFile = 'src/app/modules/admin/content/ai-tts/ai-tts.component.html';
let htmlContent = fs.readFileSync(htmlFile, 'utf8');

const oldDiv = `class="flex items-center min-w-[50px] cursor-grab active:cursor-grabbing border-r border-gray-100 dark:border-gray-600 pr-3"`;
const newDiv = `cdkDragHandle\n                                    class="flex items-center min-w-[50px] cursor-grab active:cursor-grabbing border-r border-gray-100 dark:border-gray-600 pr-3"`;

htmlContent = htmlContent.replace(oldDiv, newDiv);

fs.writeFileSync(htmlFile, htmlContent, 'utf8');
