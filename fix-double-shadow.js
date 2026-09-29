const fs = require('fs');
const scssFile = 'src/styles/styles.scss';
let scssContent = fs.readFileSync(scssFile, 'utf8');

const oldLight = 'box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.1), 0 11px 15px -7px rgba(0, 0, 0, 0.2), 0 24px 38px 3px rgba(0, 0, 0, 0.14), 0 9px 46px 8px rgba(0, 0, 0, 0.12) !important;';
const newLight = 'box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.1), 0 0 0 4px rgba(0, 0, 0, 0.04), 0 11px 15px -7px rgba(0, 0, 0, 0.2), 0 24px 38px 3px rgba(0, 0, 0, 0.14), 0 9px 46px 8px rgba(0, 0, 0, 0.12) !important;';

const oldDark = 'box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.1), 0 11px 15px -7px rgba(0, 0, 0, 0.4), 0 24px 38px 3px rgba(0, 0, 0, 0.28), 0 9px 46px 8px rgba(0, 0, 0, 0.24) !important;';
const newDark = 'box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.1), 0 0 0 4px rgba(255, 255, 255, 0.04), 0 11px 15px -7px rgba(0, 0, 0, 0.4), 0 24px 38px 3px rgba(0, 0, 0, 0.28), 0 9px 46px 8px rgba(0, 0, 0, 0.24) !important;';

scssContent = scssContent.replace(oldLight, newLight);
scssContent = scssContent.replace(oldDark, newDark);

fs.writeFileSync(scssFile, scssContent, 'utf8');
