const fs = require('fs');
const scssFile = 'src/styles/styles.scss';
let scssContent = fs.readFileSync(scssFile, 'utf8');

const oldBlock = `.mat-mdc-dialog-container .mdc-dialog__surface {
    border-radius: 6px !important;
}`;

const newBlock = `.mat-mdc-dialog-container .mdc-dialog__surface,
.mat-dialog-container .mdc-dialog__surface {
    border-radius: 6px !important;
    border: none !important;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.1), 0 11px 15px -7px rgba(0, 0, 0, 0.2), 0 24px 38px 3px rgba(0, 0, 0, 0.14), 0 9px 46px 8px rgba(0, 0, 0, 0.12) !important;
}

.dark .mat-mdc-dialog-container .mdc-dialog__surface,
.dark .mat-dialog-container .mdc-dialog__surface {
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.1), 0 11px 15px -7px rgba(0, 0, 0, 0.4), 0 24px 38px 3px rgba(0, 0, 0, 0.28), 0 9px 46px 8px rgba(0, 0, 0, 0.24) !important;
}`;

scssContent = scssContent.replace(oldBlock, newBlock);

fs.writeFileSync(scssFile, scssContent, 'utf8');
