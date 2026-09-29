const fs = require('fs');
const scssFile = 'src/styles/styles.scss';
let scssContent = fs.readFileSync(scssFile, 'utf8');

const oldOverflowBlock = `/* Global Dialog Layout: 90vh Max Height, Fixed Header/Footer, Body-Only Scroll */
.cdk-overlay-pane:has(.mat-mdc-dialog-container),
.cdk-overlay-pane:has(.mat-dialog-container),
.mat-mdc-dialog-container,
.mat-dialog-container,
.mdc-dialog__container,
.mat-mdc-dialog-surface {
    max-height: 90vh !important;
    overflow: hidden !important;
}`;

const newOverflowBlock = `/* Global Dialog Layout: 90vh Max Height, Fixed Header/Footer, Body-Only Scroll */
.cdk-overlay-pane:has(.mat-mdc-dialog-container),
.cdk-overlay-pane:has(.mat-dialog-container),
.mat-mdc-dialog-container,
.mat-dialog-container,
.mdc-dialog__container,
.mat-mdc-dialog-surface {
    max-height: 90vh !important;
}

/* Chỉ ẩn overflow ở surface để không bị cắt mất shadow của dialog */
.mat-mdc-dialog-surface {
    overflow: hidden !important;
}`;

scssContent = scssContent.replace(oldOverflowBlock, newOverflowBlock);
fs.writeFileSync(scssFile, scssContent, 'utf8');
