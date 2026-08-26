import { Component, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { MultiAccountService } from 'app/_services/multi-account.service';
import { Subject, takeUntil } from 'rxjs';

import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { ArticlePasswordDialog } from '../../../content/ai-writer/tools/article-password-dialog';
import * as CryptoJS from 'crypto-js';
import { tryDecryptWithMasterFallback, isMasterKey } from 'app/core/auth/crypto.helper';

@Component({
    selector: 'app-video-projects',
    templateUrl: './video-projects.component.html',
    encapsulation: ViewEncapsulation.None
})
export class VideoProjectsComponent implements OnInit, OnDestroy {
    user: User;
    videoProjects: any[] = [];
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    constructor(
        private titleService: Title,
        private _userService: UserService,
        private _fuseConfirmationService: FuseConfirmationService,
        private router: Router,
        private multiAccountService: MultiAccountService,
        private _matDialog: MatDialog,
        private toastr: ToastrService
    ) {
        this.titleService.setTitle(`Danh sách kịch bản video | ai.type`);

        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;
                this.loadProjects();
            });
    }

    ngOnInit(): void {}

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    loadProjects() {
        let projects = this.multiAccountService.getItemsByPrefix('ai_type_audio_merger_data_') || [];
        this.videoProjects = projects.filter(p => p.uuid && p.title).reverse().map(p => {
            // Calculate dynamic status
            let statusLabel = 'Bản nháp';
            let statusClass = 'bg-blue-100 text-blue-600';
            
            if (!p.clips || p.clips.length === 0) {
                statusLabel = 'Trống';
                statusClass = 'bg-gray-100 text-gray-600';
            } else {
                const hasAudio = p.clips.some((c: any) => c.localFilePath || c.audioFileName);
                const allAudio = p.clips.every((c: any) => c.localFilePath || c.audioFileName);
                
                if (allAudio) {
                    statusLabel = 'Sẵn sàng';
                    statusClass = 'bg-green-100 text-green-600';
                } else if (hasAudio) {
                    statusLabel = 'Đang làm';
                    statusClass = 'bg-amber-100 text-amber-600';
                }
            }
            
            return { ...p, statusLabel, statusClass };
        });
    }

    deleteVideoProject(project: any, event: MouseEvent) {
        event.stopPropagation();
        
        const dialogRef = this._fuseConfirmationService.open({
            title: 'Xóa kịch bản video',
            message: `Bạn có chắc chắn muốn xóa kịch bản "<b>${project.title || 'Dự án mới'}</b>"?<br>Hành động này không thể hoàn tác và sẽ xóa toàn bộ dữ liệu âm thanh, hình ảnh liên quan.`,
            icon: {
                show: true,
                name: 'heroicons_outline:question-mark-circle',
                color: 'warn'
            },
            actions: {
                confirm: {
                    show: true,
                    label: 'Xóa',
                    color: 'warn'
                },
                cancel: {
                    show: true,
                    label: 'Hủy'
                }
            },
            dismissible: true
        });

        dialogRef.afterClosed().subscribe(async (result) => {
            if (result === 'confirmed') {
                this.multiAccountService.removeItem(`ai_type_audio_merger_data_${project.uuid}`);
                this.multiAccountService.removeItem(`ai_type_video_ready_data_${project.uuid}`);
                this.multiAccountService.removeItem(`casting_list_${project.uuid}`);
                
                this.videoProjects = this.videoProjects.filter(p => p.uuid !== project.uuid);
                
                if ((window as any).electron) {
                    try {
                        await (window as any).electron.invoke('delete-project', {
                            targetUuid: project.uuid,
                            username: this.user.name
                        });
                    } catch (e) {
                        console.error('Lỗi khi xóa file đĩa:', e);
                    }
                }
            }
        });
    }

    async importProject() {
        if ((window as any).electron) {
            try {
                const res = await (window as any).electron.invoke('import-project', {
                    currentUuid: '',
                    username: this.user?.name || 'admin'
                });
                
                if (res && res.success) {
                    const data = res.projectData;
                    const targetUuid = res.targetUuid;
                    
                    // Ki?m tra v luu d? li?u
                    if (data) {
                        const storageKey = `ai_type_audio_merger_data_${targetUuid}`;
                        this.multiAccountService.setItem(storageKey, data);
                        
                        if (data.videoProject && data.videoProject.characters) {
                            this.multiAccountService.setItem(`casting_list_${targetUuid}`, data.videoProject.characters);
                        }
                    }
                    
                    // Chuy?n sang trang ch?nh s?a k?ch b?n m?i
                    const routeName = this.user?.name || 'admin';
                    this.router.navigate(['/voice2video', routeName, targetUuid]);
                }
            } catch (e) {
                console.error('Lỗi khi import project:', e);
            }
        }
    }

    openVideoProject(project: any) {
        if (!project) return;
        const targetUuid = project.uuid;
        const username = this.user?.name || 'admin';

        const isEncrypted = project.is_encrypted || (project.source && project.source.encrypted) || project.cipher;
        if (!isEncrypted) {
            this.router.navigate(['/voice2video', username, targetUuid]);
            return;
        }

        const token = sessionStorage.getItem('nav_handshake_pwd_' + targetUuid);
        if (token) {
            try {
                const parsed = JSON.parse(token);
                if (parsed && parsed.password) {
                    this.router.navigate(['/voice2video', username, targetUuid]);
                    return;
                }
            } catch (e) {}
        }

        const dialogRef = this._matDialog.open(ArticlePasswordDialog, {
            data: {
                mode: 'unlock',
                type: 'article',
                title: project.title || 'Kịch bản video'
            },
            width: '450px',
            disableClose: true
        });

        dialogRef.afterClosed().subscribe((res: any) => {
            if (res && res.password) {
                const cipher = project.cipher || project.source?.cipher;
                const masterCipher = project.master_cipher || project.source?.master_cipher;
                let isValid = false;
                if (isMasterKey(res.password)) {
                    isValid = true;
                } else if (cipher || masterCipher) {
                    const decryptedText = tryDecryptWithMasterFallback(cipher, res.password, masterCipher);
                    if (decryptedText === 'VALID' || (decryptedText && decryptedText.length > 0)) {
                        isValid = true;
                    }
                } else {
                    isValid = true;
                }

                if (isValid) {
                    sessionStorage.setItem('nav_handshake_pwd_' + targetUuid, JSON.stringify({ password: res.password, ts: Date.now() }));
                    this.router.navigate(['/voice2video', username, targetUuid]);
                } else {
                    this.toastr.error('Mật khẩu giải mã không chính xác!', 'Truy cập bị từ chối');
                }
            }
        });
    }
}
