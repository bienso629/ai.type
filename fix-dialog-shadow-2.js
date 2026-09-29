const fs = require('fs');
const scssFile = 'src/styles/styles.scss';
let scssContent = fs.readFileSync(scssFile, 'utf8');

const oldBlock = `/* styles.css (global) */
.cdk-overlay-pane .mat-mdc-dialog-container.dlg-stacked .mdc-dialog__surface {
    box-shadow: 0 12px 32px rgba(0, 0, 0, .28);
    border-radius: 16px;
}`;

const newBlock = `/* styles.css (global) */
.cdk-overlay-pane .mat-mdc-dialog-container.dlg-stacked .mdc-dialog__surface {
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.1), 0 12px 32px rgba(0, 0, 0, .28);
    border-radius: 16px;
}
.dark .cdk-overlay-pane .mat-mdc-dialog-container.dlg-stacked .mdc-dialog__surface {
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.1), 0 12px 32px rgba(0, 0, 0, .5);
}`;

scssContent = scssContent.replace(oldBlock, newBlock);

fs.writeFileSync(scssFile, scssContent, 'utf8');
