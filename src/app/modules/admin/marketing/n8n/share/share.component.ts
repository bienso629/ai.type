import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, ViewEncapsulation } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { RemoveHTMLPipe } from "app/app.pipe";

@Component({
    selector: 'amxh-share',
    templateUrl: './share.component.html',
    styleUrls: ['./share.component.scss'],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AMXHShareAppComponent implements OnInit, OnDestroy, OnChanges {
    @Input() data: any;
    shareForm: UntypedFormGroup;
    private removeHTML: RemoveHTMLPipe = new RemoveHTMLPipe();

    constructor(
        private _formBuilder: UntypedFormBuilder,
        private _changeDetectorRef: ChangeDetectorRef,
        private toastr: ToastrService
    ) {}

    ngOnInit(): void {
        this.shareForm = this._formBuilder.group({
            title: ['', Validators.required],
            description: [''],
            thumbnail: ['']
        });
        this.updateFormFromData();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes.data && !changes.data.firstChange) {
            this.updateFormFromData();
        }
    }

    private updateFormFromData() {
        if (!this.data || !this.shareForm) return;

        let descriptionText = this.data.description || '';
        
        // Nếu bài viết có mảng content (done), nối lại thành text sạch
        if (this.data.done && Array.isArray(this.data.done)) {
            const cleanParagraphs = this.data.done.map((p: string) => this.removeHTML.transform(p));
            descriptionText = cleanParagraphs.join('\n\n');
        }

        this.shareForm.patchValue({
            title: this.data.title || '',
            description: descriptionText,
            thumbnail: this.data.thumbnail || ''
        });
        
        this._changeDetectorRef.markForCheck();
    }

    ngOnDestroy(): void {}

    get thumbnailsList(): string[] {
        if (!this.shareForm) return [];
        const val = this.shareForm.get('thumbnail').value;
        return val ? val.split('\n').filter((p: string) => p.trim() !== '') : [];
    }

    removeThumbnail(index: number) {
        const list = this.thumbnailsList;
        if (index >= 0 && index < list.length) {
            list.splice(index, 1);
            this.shareForm.get('thumbnail').setValue(list.join('\n'));
            this._changeDetectorRef.markForCheck();
        }
    }

    onThumbnailSelected(event: any) {
        if (event.target.files && event.target.files.length > 0) {
            const files = Array.from(event.target.files);
            const paths = files.map((file: any) => file.path || file.name);
            const existingValue = this.shareForm.get('thumbnail').value || '';
            
            const newValue = existingValue.trim() ? existingValue.trim() + '\n' + paths.join('\n') : paths.join('\n');
            
            this.shareForm.get('thumbnail').setValue(newValue);
            this.toastr.success(`Đã đính kèm ${files.length} tệp phương tiện local!`);
            this._changeDetectorRef.markForCheck();
            
            event.target.value = '';
        }
    }

    submitShare() {
        if (this.shareForm.invalid) {
            this.toastr.warning('Vui lòng điền đủ thông tin bài viết!');
            return;
        }
        
        const data = this.shareForm.value;
        console.log('Sending to n8n webhook:', data);
        this.toastr.success('Bắt đầu quy trình chia sẻ đa kênh lên n8n!');
        // Tích hợp API webhook n8n ở đây
    }
}
