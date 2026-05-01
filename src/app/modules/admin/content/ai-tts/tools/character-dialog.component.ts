import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { TextFieldModule } from '@angular/cdk/text-field';

@Component({
    selector: 'app-character-dialog',
    standalone: true,
    imports: [CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatInputModule, TextFieldModule],
    templateUrl: './character-dialog.component.html'
})
export class CharacterDialogComponent {
    editingChar: any;
    isEditMode: boolean = false;

    constructor(
        public dialogRef: MatDialogRef<CharacterDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: any
    ) {
        this.isEditMode = data.index >= 0;
        this.editingChar = data.char ? { ...data.char } : { name: '', role: '', appearance: '', personality: '', prompt: '' };
    }

    save() {
        this.dialogRef.close(this.editingChar);
    }
}
