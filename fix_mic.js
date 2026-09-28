const fs = require('fs');
const files = [
  'src/app/layout/layouts/vertical/compact/compact.component.html',
  'src/app/layout/layouts/vertical/thin/thin.component.html'
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  
  // Remove animate-pulse from button
  content = content.replace(/\[class\.animate-pulse\]="isRecording"/g, '');
  
  // Add animate-pulse to the mic icon if not already there
  content = content.replace(/<mat-icon([^>]*)svgIcon="feather:mic"/g, (match, p1) => {
    if (!p1.includes('[class.animate-pulse]')) {
      return `<mat-icon [class.animate-pulse]="isRecording"` + p1 + `svgIcon="feather:mic"`;
    }
    return match;
  });
  
  fs.writeFileSync(file, content, 'utf8');
  console.log('Fixed', file);
});
