import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
    selector: 'ai-zalo-crm',
    templateUrl: './zalo.component.html',
    encapsulation: ViewEncapsulation.None
})
export class ZaloComponent implements OnInit, OnDestroy {
    contacts: any[] = [];
    messages: any[] = [];
    selectedContact: any = null;
    messageText: string = '';
    
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    constructor(
        private _http: HttpClient,
        private cd: ChangeDetectorRef,
        private toastr: ToastrService
    ) {}

    ngOnInit(): void {
        this.getContacts();

        // Định kỳ cập nhật danh sách hội thoại và tin nhắn mỗi 3 giây
        interval(3000)
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe(() => {
                this.getContacts();
                if (this.selectedContact) {
                    this.getMessages(this.selectedContact.name, false);
                }
            });
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    getContacts(): void {
        this._http.get<any>('http://127.0.0.1:54322/api/zalo/contacts')
            .subscribe({
                next: (res) => {
                    if (res && res.success) {
                        this.contacts = res.contacts || [];
                        this.cd.detectChanges();
                    }
                },
                error: () => {}
            });
    }

    selectContact(contact: any): void {
        this.selectedContact = contact;
        this.messages = [];
        this.getMessages(contact.name, true);
    }

    getMessages(contactName: string, scroll: boolean): void {
        this._http.get<any>(`http://127.0.0.1:54322/api/zalo/messages?contact_name=${encodeURIComponent(contactName)}`)
            .subscribe({
                next: (res) => {
                    if (res && res.success) {
                        this.messages = res.messages || [];
                        this.cd.detectChanges();
                        if (scroll) {
                            setTimeout(() => this.scrollToBottom(), 50);
                        }
                    }
                },
                error: () => {}
            });
    }

    sendMessage(): void {
        if (!this.messageText.trim() || !this.selectedContact) return;
        
        const payload = {
            contact_name: this.selectedContact.name,
            text: this.messageText
        };

        this._http.post<any>('http://127.0.0.1:54322/api/zalo/send', payload)
            .subscribe({
                next: (res) => {
                    if (res && res.success) {
                        // Thêm trực tiếp vào local chat bubble để tạo cảm giác phản hồi nhanh
                        this.messages.push({
                            sender: 'Me',
                            text: this.messageText,
                            is_mine: 1,
                            time: new Date().toISOString()
                        });
                        this.messageText = '';
                        this.cd.detectChanges();
                        setTimeout(() => this.scrollToBottom(), 50);
                    } else {
                        this.toastr.error('Lỗi khi gửi tin nhắn.');
                    }
                },
                error: () => {
                    this.toastr.error('Không thể kết nối đến server plugin Zalo.');
                }
            });
    }

    scrollToBottom(): void {
        const chatContainer = document.getElementById('chat-scroll-container');
        if (chatContainer) {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
    }

    openZaloTool(): void {
        window.dispatchEvent(new CustomEvent('open-web-tool', {
            detail: { id: 'zalo.me' }
        }));
    }
}
