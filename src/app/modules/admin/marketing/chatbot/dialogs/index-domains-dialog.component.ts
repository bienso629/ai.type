import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

@Component({
    selector: 'app-index-domains-dialog',
    templateUrl: './index-domains-dialog.component.html'
})
export class IndexDomainsDialogComponent implements OnInit {
    domainOptions: any[] = [];
    selectedDomain: string | null = null;
    sitemapsText: string = '';

    constructor(
        public dialogRef: MatDialogRef<IndexDomainsDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: any
    ) {
        this.domainOptions = data.domainOptions || [];
        this.selectedDomain = data.selectedDomain || null;
    }

    ngOnInit(): void {
        if (!this.selectedDomain && this.domainOptions?.length) {
            this.selectedDomain = this.domainOptions[0]['domain'];
        }
        this.getSitemap();
    }

    getSitemap() {
        if (this.selectedDomain) {
            this.sitemapsText =
                `${this.selectedDomain.replace(/\/$/, '')}/post-sitemap.xml\n` +
                `${this.selectedDomain.replace(/\/$/, '')}/page-sitemap.xml\n` +
                `${this.selectedDomain.replace(/\/$/, '')}/category-sitemap.xml\n` +
                `${this.selectedDomain.replace(/\/$/, '')}/author-sitemap.xml\n`;
        }
    }

    onClose(): void {
        this.dialogRef.close();
    }

    normalizeDomainUrl(domain: string): string {
        if (!domain) return '';
        return domain.replace(/^https?:\/\//i, '').replace(/\/$/, '');
    }

    onConfirm(): void {
        this.dialogRef.close({
            selectedDomain: this.selectedDomain,
            sitemapsText: this.sitemapsText
        });
    }
}
