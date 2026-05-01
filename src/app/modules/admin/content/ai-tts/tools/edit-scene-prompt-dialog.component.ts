import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TextFieldModule } from '@angular/cdk/text-field';
import { ToastrService } from 'ngx-toastr';
import { DirectorModeComponent } from './director-mode.component';

@Component({
    selector: 'app-edit-scene-prompt-dialog',
    standalone: true,
    imports: [CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatIconModule, MatInputModule, TextFieldModule],
    templateUrl: './edit-scene-prompt-dialog.component.html'
})
export class EditScenePromptDialogComponent {
    editingScenePrompt: any;
    editingSceneIndex: number;
    characters: any[] = [];
    masterPrompt: string = '';

    constructor(
        public dialogRef: MatDialogRef<EditScenePromptDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: any,
        private dialog: MatDialog,
        private toastr: ToastrService
    ) {
        this.editingSceneIndex = data.index;
        this.editingScenePrompt = { ...data.scene };
        this.characters = data.characters || [];
        this.masterPrompt = data.masterPrompt ? data.masterPrompt.trim() : '';

        if (this.masterPrompt) {
            const hasCinematography = this.editingScenePrompt.prompt.includes('[Cinematography:');
            const coreMaster = this.masterPrompt.replace(/\[(?:Director|Cinematography):.*?\]/g, '').trim();
            const hasCoreMaster = coreMaster ? this.editingScenePrompt.prompt.includes(coreMaster) : false;

            if (!hasCinematography && !hasCoreMaster) {
                if (this.editingScenePrompt.prompt && this.editingScenePrompt.prompt.trim() !== '') {
                    this.editingScenePrompt.prompt = this.masterPrompt + '\n\n' + this.editingScenePrompt.prompt;
                } else {
                    this.editingScenePrompt.prompt = this.masterPrompt;
                }
            }
        }
    }

    addCharToScenePrompt(char: any) {
        if (!this.editingScenePrompt) return;
        
        const currentPrompt = this.editingScenePrompt.prompt ? this.editingScenePrompt.prompt.trim() : '';
        let charDesc = char.appearance ? char.appearance : char.prompt;
        if (!charDesc) return;
        
        if (charDesc.toLowerCase().startsWith('mặc ') || charDesc.toLowerCase().startsWith('đang mặc ')) {
            charDesc = charDesc.charAt(0).toLowerCase() + charDesc.slice(1);
        }

        const textToInsert = `${char.name || char.role}: ${charDesc}`;

        if (currentPrompt) {
            if (currentPrompt.includes(charDesc) || currentPrompt.includes(textToInsert)) {
                this.toastr.info('Nhân vật này đã có trong phân cảnh rồi.');
                return;
            }
            
            let insertIndex = currentPrompt.length;
            const constraintsMatch = currentPrompt.match(/\n*(\(Constraints:|\[BẮT BUỘC:)/i);
            if (constraintsMatch && constraintsMatch.index !== undefined) {
                insertIndex = constraintsMatch.index;
            }

            if (insertIndex < currentPrompt.length) {
                const firstPart = currentPrompt.substring(0, insertIndex).trim();
                const lastPart = currentPrompt.substring(insertIndex).trim();
                const separator = firstPart.endsWith(',') || firstPart.endsWith('.') ? '\n\n' : '.\n\n';
                this.editingScenePrompt.prompt = firstPart + separator + textToInsert + '\n\n' + lastPart;
            } else {
                const separator = currentPrompt.endsWith(',') || currentPrompt.endsWith('.') ? '\n\n' : '.\n\n';
                this.editingScenePrompt.prompt = currentPrompt + separator + textToInsert;
            }
        } else {
            this.editingScenePrompt.prompt = textToInsert;
        }
        
        this.toastr.success(`Đã thêm nhân vật "${char.name || char.role}" vào phân cảnh!`);
    }

    openDirectorModeForScene() {
        const dialogRef = this.dialog.open(DirectorModeComponent, {
            width: '900px',
            maxWidth: '95vw',
            panelClass: 'dark-theme-dialog',
            data: { prompt: this.editingScenePrompt?.prompt || '', targetName: 'Apply to Scene Prompt' }
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result) {
                let currentPrompt = this.editingScenePrompt.prompt ? this.editingScenePrompt.prompt.trim() : '';
                currentPrompt = currentPrompt.replace(/\[(?:Director|Cinematography):.*?\]/g, '').replace(/\n{3,}/g, '\n\n').trim();
                
                if (currentPrompt) {
                    this.editingScenePrompt.prompt = '[Cinematography: ' + result + ']\n\n' + currentPrompt;
                } else {
                    this.editingScenePrompt.prompt = '[Cinematography: ' + result + ']';
                }
                this.toastr.success('Đã áp dụng các thông số Director Mode vào Phân cảnh!');
            }
        });
    }

    save() {
        this.dialogRef.close(this.editingScenePrompt);
    }
}
