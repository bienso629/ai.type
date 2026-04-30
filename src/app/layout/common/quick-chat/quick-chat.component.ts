import { AfterViewInit, Component, ElementRef, HostBinding, HostListener, Inject, NgZone, OnDestroy, OnInit, Renderer2, ViewEncapsulation, ViewChild } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { ScrollStrategy, ScrollStrategyOptions } from '@angular/cdk/overlay';
import { Subject } from 'rxjs';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';

export interface ToolItem {
    id: string;
    name: string;
    url: string;
    icon?: string;
}

@Component({
    selector: 'quick-chat',
    templateUrl: './quick-chat.component.html',
    styleUrls: ['./quick-chat.component.scss'],
    encapsulation: ViewEncapsulation.None,
    exportAs: 'quickChat'
})
export class QuickChatComponent implements OnInit, AfterViewInit, OnDestroy {
    tools: ToolItem[] = [];
    selectedTool: ToolItem | null = null;
    opened: boolean = false;

    @ViewChild('addDialogTemplate') addDialogTemplate: any;
    private dialogRef: MatDialogRef<any>;

    // Form data
    newToolName: string = '';
    newToolUrl: string = '';

    private _mutationObserver: MutationObserver;
    private _scrollStrategy: ScrollStrategy = this._scrollStrategyOptions.block();
    private _overlay: HTMLElement;
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    constructor(
        @Inject(DOCUMENT) private _document: Document,
        private _elementRef: ElementRef,
        private _renderer2: Renderer2,
        private _ngZone: NgZone,
        private _scrollStrategyOptions: ScrollStrategyOptions,
        private multiAccountService: MultiAccountService,
        private _matDialog: MatDialog
    ) { }

    @HostBinding('class') get classList(): any {
        return {
            'quick-chat-opened': this.opened
        };
    }

    ngOnInit(): void {
        this.loadTools();
    }

    loadTools(): void {
        let savedTools = this.multiAccountService.getItem('tools_urls');
        if (!savedTools || savedTools.length === 0) {
            savedTools = [
                { id: '1', name: 'Gemini', url: 'https://gemini.google.com/app?hl=vi' },
                { id: '2', name: 'Google Labs', url: 'https://labs.google/fx/vi/tools/flow' },
                { id: '3', name: 'Facebook', url: 'https://facebook.com' },
                { id: '4', name: 'Tiktok', url: 'https://www.tiktok.com' },
                { id: '5', name: 'Instagram', url: 'https://instagram.com' },
                { id: '6', name: 'X', url: 'https://x.com' }
            ];
            this.multiAccountService.setItem('tools_urls', savedTools);
        }
        this.tools = savedTools;
    }

    saveTool(): void {
        if (!this.newToolName || !this.newToolUrl) return;

        const newTool: ToolItem = {
            id: Date.now().toString(),
            name: this.newToolName,
            url: this.newToolUrl
        };

        this.tools.push(newTool);
        this.multiAccountService.setItem('tools_urls', this.tools);

        // Reset form
        this.newToolName = '';
        this.newToolUrl = '';
        if (this.dialogRef) {
            this.dialogRef.close();
        }
    }

    openAddDialog(): void {
        this.dialogRef = this._matDialog.open(this.addDialogTemplate, {
            width: '400px',
            disableClose: false
        });
    }

    removeTool(id: string): void {
        this.tools = this.tools.filter(t => t.id !== id);
        this.multiAccountService.setItem('tools_urls', this.tools);
        if (this.selectedTool && this.selectedTool.id === id) {
            this.selectedTool = null;
        }

        // Remove the associated webview from DOM if it exists
        const container = document.getElementById('webview-container-div');
        if (container) {
            const webview = container.querySelector(`webview[data-tool-id="${id}"]`);
            if (webview) {
                container.removeChild(webview);
            }
        }
    }

    openTool(tool: ToolItem): void {
        this.selectedTool = tool;
        const container = document.getElementById('webview-container-div');
        if (container) {
            // Find all webviews
            const webviews = container.querySelectorAll('webview');
            // Hide all webviews
            webviews.forEach((wv: any) => {
                wv.style.display = 'none';
            });

            // Check if webview for this tool exists
            let webview = container.querySelector(`webview[data-tool-id="${tool.id}"]`) as any;
            if (webview) {
                // Show it
                webview.style.display = 'flex';
            } else {
                // Create it
                webview = document.createElement('webview');
                webview.setAttribute('data-tool-id', tool.id);
                // Share the same persist partition so logins carry over if applicable
                webview.setAttribute('partition', 'persist:gemini-webview');
                webview.setAttribute('src', tool.url);
                webview.setAttribute('allowpopups', 'true');
                webview.style.width = '100%';
                webview.style.height = '100%';
                webview.style.border = 'none';
                webview.style.display = 'flex';
                webview.style.flex = '1';

                container.appendChild(webview);
            }
        }
        
        // Cập nhật isWebviewVisible (phát sự kiện toggle)
        window.dispatchEvent(new CustomEvent('toggle-gemini', { detail: { forceOpen: true } }));
        // Đóng panel sau khi chọn
        this.close();
    }

    getFavicon(url: string): string {
        try {
            const domain = new URL(url).hostname;
            return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
        } catch (e) {
            return './assets/images/logo/favicon.svg';
        }
    }

    ngAfterViewInit(): void {
        this._mutationObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                const mutationTarget = mutation.target as HTMLElement;
                if (mutation.attributeName === 'class') {
                    if (mutationTarget.classList.contains('cdk-global-scrollblock')) {
                        const top = parseInt(mutationTarget.style.top, 10);
                        this._renderer2.setStyle(this._elementRef.nativeElement, 'margin-top', `${Math.abs(top)}px`);
                    } else {
                        this._renderer2.setStyle(this._elementRef.nativeElement, 'margin-top', null);
                    }
                }
            });
        });
        this._mutationObserver.observe(this._document.documentElement, {
            attributes: true,
            attributeFilter: ['class']
        });
    }

    ngOnDestroy(): void {
        this._mutationObserver.disconnect();
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    open(): void {
        if (this.opened) return;
        this._toggleOpened(true);
    }

    close(): void {
        if (!this.opened) return;
        this._toggleOpened(false);
    }

    toggle(): void {
        if (this.opened) this.close();
        else this.open();
    }

    trackByFn(index: number, item: any): any {
        return item.id || index;
    }

    private _showOverlay(): void {
        this._hideOverlay();
        this._overlay = this._renderer2.createElement('div');
        if (!this._overlay) return;

        this._overlay.classList.add('quick-chat-overlay');
        this._renderer2.appendChild(this._elementRef.nativeElement.parentElement, this._overlay);
        this._scrollStrategy.enable();

        this._overlay.addEventListener('click', () => {
            this.close();
        });
    }

    private _hideOverlay(): void {
        if (this._overlay) {
            this._overlay.parentNode.removeChild(this._overlay);
            this._overlay = null;
        }
        this._scrollStrategy.disable();
    }

    private _toggleOpened(open: boolean): void {
        this.opened = open;
        if (open) this._showOverlay();
        else this._hideOverlay();
    }
}
