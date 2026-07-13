import { Component, Inject, OnInit } from "@angular/core";
import { MatDialogRef, MAT_DIALOG_DATA } from "@angular/material/dialog";
import { Clipboard } from '@angular/cdk/clipboard';
import { ToastrService } from 'ngx-toastr';

interface ScreenplayLine {
    type: string;
    text: string;
}

@Component({
    selector: 'script-dialog',
    template: `
    <div class="flex items-center justify-between mb-4 border-b pb-3">
        <div class="text-2xl font-bold text-gray-800 tracking-tight flex items-center">
            <mat-icon class="mr-2 text-primary icon-size-6" svgIcon="heroicons_outline:document-text"></mat-icon>
            Kịch Bản Tập Phim
        </div>
        <button mat-icon-button mat-dialog-close type="button">
            <mat-icon [svgIcon]="'heroicons_outline:x'"></mat-icon>
        </button>
    </div>

    <div mat-dialog-content class="mt-4 p-0 max-h-160 overflow-y-auto">
        <div class="bg-gray-50 border border-gray-200 rounded-lg p-6 font-mono text-sm leading-relaxed text-gray-900 screenplay-container shadow-inner">
            <div class="screenplay-content">
                <ng-container *ngFor="let item of parsedLines">
                    <div *ngIf="item.type === 'slugline'" class="screenplay-slugline">
                        {{ item.text }}
                    </div>
                    <div *ngIf="item.type === 'action'" class="screenplay-action">
                        {{ item.text }}
                    </div>
                    <div *ngIf="item.type === 'character'" class="screenplay-character">
                        {{ item.text }}
                    </div>
                    <div *ngIf="item.type === 'parenthetical'" class="screenplay-parenthetical">
                        {{ item.text }}
                    </div>
                    <div *ngIf="item.type === 'dialogue'" class="screenplay-dialogue">
                        {{ item.text }}
                    </div>
                    <div *ngIf="item.type === 'empty'" class="screenplay-empty"></div>
                </ng-container>
            </div>
        </div>
    </div>

    <div mat-dialog-actions class="p-0 mt-6 flex justify-between items-center border-t pt-3">
        <span class="text-xs text-gray-400 italic">Đã lưu trữ thành công vào database (admin_scripts_2023)</span>
        <div class="flex gap-2">
            <button mat-stroked-button (click)="copyToClipboard()" color="primary">
                <mat-icon class="icon-size-4 mr-2" svgIcon="heroicons_outline:clipboard-copy"></mat-icon>
                Copy kịch bản
            </button>
            <button mat-flat-button mat-dialog-close color="warn">
                Đóng
            </button>
        </div>
    </div>
    `,
    styles: [`
        .screenplay-container {
            max-width: 100%;
            background-color: #fbfbfb;
            box-shadow: inset 0 2px 4px 0 rgba(0,0,0,0.06);
        }
        .screenplay-content {
            font-family: 'Courier New', Courier, monospace;
            color: #111;
            font-size: 14px;
            line-height: 1.5;
        }
        .screenplay-slugline {
            font-weight: bold;
            text-transform: uppercase;
            margin-top: 1.2rem;
            margin-bottom: 0.4rem;
            text-align: left !important;
        }
        .screenplay-action {
            text-align: left !important;
            margin-top: 0.4rem;
            margin-bottom: 0.4rem;
        }
        .screenplay-character {
            font-weight: bold;
            text-transform: uppercase;
            text-align: left !important;
            margin-left: 35%;
            margin-top: 0.8rem;
            margin-bottom: 0.1rem;
        }
        .screenplay-parenthetical {
            text-align: left !important;
            margin-left: 28%;
            margin-right: 20%;
            margin-top: 0.1rem;
            margin-bottom: 0.1rem;
            color: #555;
        }
        .screenplay-dialogue {
            text-align: left !important;
            margin-left: 20%;
            margin-right: 20%;
            margin-top: 0.1rem;
            margin-bottom: 0.6rem;
        }
        .screenplay-empty {
            height: 0.8rem;
        }
    `]
})
export class ScriptDialog implements OnInit {
    parsedLines: ScreenplayLine[] = [];

    constructor(
        public dialogRef: MatDialogRef<ScriptDialog>,
        @Inject(MAT_DIALOG_DATA) public data: { scriptText: string, title: string },
        private clipboard: Clipboard,
        private toastr: ToastrService
    ) { }

    ngOnInit(): void {
        this.parseScriptText();
    }

    parseScriptText() {
        if (!this.data.scriptText) {
            this.parsedLines = [];
            return;
        }

        // Normalize HTML tags to newlines and plain text
        let processedText = this.data.scriptText || '';
        
        // 1. Replace br tags with newlines
        processedText = processedText.replace(/<br\s*\/?>/gi, '\n');
        
        // 2. Replace closing block tags with newlines
        processedText = processedText.replace(/<\/p>|<\/div>|<\/h[1-6]>/gi, '\n');
        
        // 3. Strip all other remaining HTML tags
        processedText = processedText.replace(/<\/?[^>]+(>|$)/g, '');
        
        // 4. Decode HTML entities (e.g. &nbsp; &amp; &lt; &gt; &quot;)
        const doc = new DOMParser().parseFromString(processedText, 'text/html');
        processedText = doc.documentElement.textContent || processedText;

        // 5. Replace all non-breaking spaces and special unicode spaces with normal space
        processedText = processedText.replace(/[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, ' ');

        // 6. Normalize multiple consecutive spaces and tabs to a single space (while keeping newlines)
        processedText = processedText.replace(/[ \t]+/g, ' ');

        const rawLines = processedText.split('\n');
        this.parsedLines = [];
        let lastType = '';

        for (let line of rawLines) {
            const trimmed = line.trim();
            if (!trimmed) {
                this.parsedLines.push({ type: 'empty', text: '' });
                lastType = ''; // Reset state on blank lines to separate paragraphs correctly
                continue;
            }

            // Remove markdown bold tags and normalize multiple spaces to a single space
            let clean = trimmed.replace(/^\*\*|\*\*$/g, '').replace(/\s+/g, ' ').trim();

            // Identify Sluglines
            const isSlugline = /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.|CẢNH\s+\d+|PHÂN\s+CẢNH\s+\d+)/i.test(clean) ||
                               /^(INT\s|EXT\s)/i.test(clean) ||
                               (clean.toUpperCase() === clean && (clean.includes(' - ') || clean.includes(' – ')));

            if (isSlugline) {
                this.parsedLines.push({ type: 'slugline', text: clean.toUpperCase() });
                lastType = 'slugline';
                continue;
            }

            // Identify Parentheticals
            const isParenthetical = clean.startsWith('(') && clean.endsWith(')');
            if (isParenthetical) {
                this.parsedLines.push({ type: 'parenthetical', text: clean });
                lastType = 'parenthetical';
                continue;
            }

            // Identify Character Names
            const isCharacter = clean.toUpperCase() === clean && 
                                !/[.?!:,]$/.test(clean) && 
                                clean.split(/\s+/).length <= 4;

            if (isCharacter && lastType !== 'character') {
                this.parsedLines.push({ type: 'character', text: clean });
                lastType = 'character';
                continue;
            }

            // Identify Dialogue continuation
            if (lastType === 'dialogue' && !isCharacter) {
                const lastItem = this.parsedLines[this.parsedLines.length - 1];
                if (lastItem && lastItem.type === 'dialogue') {
                    lastItem.text += ' ' + clean;
                } else {
                    this.parsedLines.push({ type: 'dialogue', text: clean });
                }
                lastType = 'dialogue';
                continue;
            }

            // Identify Dialogue
            if (lastType === 'character' || lastType === 'parenthetical') {
                this.parsedLines.push({ type: 'dialogue', text: clean });
                lastType = 'dialogue';
                continue;
            }

            // Default: Action
            const lastItem = this.parsedLines[this.parsedLines.length - 1];
            if (lastItem && lastItem.type === 'action') {
                lastItem.text += ' ' + clean;
            } else {
                this.parsedLines.push({ type: 'action', text: clean });
            }
            lastType = 'action';
        }
    }

    copyToClipboard() {
        if (this.data.scriptText) {
            this.clipboard.copy(this.data.scriptText);
            this.toastr.success('Đã copy kịch bản vào clipboard!');
        }
    }
}
