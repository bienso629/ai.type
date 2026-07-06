import { COMMA, ENTER } from "@angular/cdk/keycodes";
import { Component, Inject, ViewChild } from "@angular/core";
import { MatChipInputEvent } from "@angular/material/chips";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { MatSelectionList } from "@angular/material/list";

import * as uuid from 'uuid';

export interface DialogWordData {
    word: string;
    data: any;
}

@Component({
    selector: 'word-data-dialog',
    template: `<div class="flex items-center justify-between mb-4">
        <div class="text-2xl font-bold text-gray-800 tracking-tight">Giải nghĩa "{{data.word}}"</div>
        <button mat-icon-button mat-dialog-close type="button">
            <mat-icon [svgIcon]="'heroicons_outline:x'"></mat-icon>
        </button>
    </div>

    <div mat-dialog-content class="mt-4 p-0">
        <ng-container>
            <h2 class="font-semibold">Đồng nghĩa:</h2>
            <p>Chọn từ đồng nghĩa để thay đổi</p>
            <!-- <p class="hover:bg-grey-50 p-2 rounded" *ngFor="let item of data.data['dn']">{{item}}</p> -->
            <!-- <mat-chip-listbox aria-label="Fish selection">
                <mat-chip-option (click)="word = item;" *ngFor="let item of data.data['dn']">{{item}}</mat-chip-option>
            </mat-chip-listbox> -->

            <mat-form-field class="w-full fuse-mat-dense fuse-mat-emphasized-affix mt-3" appearance="fill" [subscriptSizing]="'dynamic'">
                <mat-chip-grid #chipGrid aria-label="Enter fruits">
                    <mat-chip-row matTooltipPosition="above" matTooltip="Chọn " *ngFor="let fruit of data.data['dn']" (click)="word = fruit;">
                        {{fruit}}
                    </mat-chip-row>

                    <input placeholder="Hoặc tạo từ đồng nghĩa khác của bạn."
                        [matChipInputFor]="chipGrid"
                        [matChipInputSeparatorKeyCodes]="separatorKeysCodes"
                        [matChipInputAddOnBlur]="addOnBlur"
                        (matChipInputTokenEnd)="add($event)"/>
                </mat-chip-grid>
            </mat-form-field>
        </ng-container>

        <ng-container *ngIf="data.data['span'].length === 0 && data.data['dd'].length === 0">
            <p class="text-base">Từ này chưa được giải nghĩa</p>
        </ng-container>

        <ng-container *ngIf="data.data['span'].length > 0">
            <h2 class="mt-2 font-semibold">Giải nghĩa:</h2>
            <!-- <p class="hover:bg-grey-50 my-2 border p-2 rounded cursor-pointer" matTooltipPosition="right" matTooltip="Chọn kết quả vào Nguồn" *ngFor="let item of data.data['span']">{{item}}</p> -->
            <mat-selection-list class="m-0 p-0" #span>
                <mat-list-option [disableRipple]="true" class="hover:bg-grey-50 mt-2 border p-2 rounded cursor-pointer" matTooltipPosition="above" matTooltip="Chọn kết quả vào Nguồn" *ngFor="let item of data.data['span']" [value]="item">{{item}}</mat-list-option>
            </mat-selection-list>
        </ng-container>
        
        <ng-container *ngIf="data.data['dd'].length > 0">
            <h2 class="mt-4 font-semibold">Ví dụ:</h2>
            <!-- <p class="hover:bg-grey-50 my-2 border p-2 rounded" matTooltipPosition="right" matTooltip="Chọn kết quả vào Nguồn" *ngFor="let item of data.data['dd']">{{item}}</p> -->
            <mat-selection-list class="m-0 p-0" #dd>
                <mat-list-option [disableRipple]="true" class="hover:bg-grey-50 mt-2 border p-2 rounded cursor-pointer" matTooltipPosition="above" matTooltip="Chọn kết quả vào Nguồn" *ngFor="let item of data.data['dd']" [value]="item">{{item}}</mat-list-option>
            </mat-selection-list>
        </ng-container>
    </div>

    <div mat-dialog-actions class="p-0 mt-6 flex justify-end gap-2">
    <button mat-flat-button color="primary" class="" (click)="get()">
            <mat-label *ngIf="data.data['dn'].length > 0 && word">Hoán đổi "{{data.word}}" -> "{{word}}"</mat-label>
            <mat-label *ngIf="data.data['dn'].length === 0 || !word">Sử dụng kết quả</mat-label>
        </button>
</div>`,
})
export class WordDataDialog {
    addOnBlur = true;
    readonly separatorKeysCodes = [ENTER, COMMA] as const;

    @ViewChild('span') span: MatSelectionList;
    @ViewChild('dd') dd: MatSelectionList;

    word: string;

    constructor(
        public dialogRef: MatDialogRef<WordDataDialog>,
        @Inject(MAT_DIALOG_DATA) public data: DialogWordData,
    ) { }

    add(event: MatChipInputEvent): void {
        const value = (event.value || '').trim();

        if (value) {
            this.data.data['dn'].push(value);
        }

        // Clear the input value
        event.chipInput!.clear();
    }

    getSelected() {
        let result = [];

        if (this.span && this.data.data['span'].length > 0) {
            result.push(this.span.selectedOptions.selected.map(s => `<p id="source-word-${uuid.v4()}">${s.value}</p>`));
        }

        if (this.dd && this.data.data['dd'].length > 0) {
            result.push(this.dd.selectedOptions.selected.map(s => `<p id="source-word-${uuid.v4()}">${s.value}</p>`));
        }

        return result;
    }

    get(): void {
        this.dialogRef.close({
            result: this.getSelected(),
            word: this.word
        });
    }
}