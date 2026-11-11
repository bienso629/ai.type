import {
    Component,
    OnDestroy,
    OnInit,
    ViewEncapsulation,
    ChangeDetectionStrategy,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { MultiAccountService } from 'app/_services/multi-account.service';
import { ProjectStoreService } from 'app/_services/project-store.service';
import { Subject, takeUntil } from 'rxjs';

import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { ArticlePasswordDialog } from '../../../content/ai-writer/tools/article-password-dialog';
import * as CryptoJS from 'crypto-js';
import {
    tryDecryptWithMasterFallback,
    isMasterKey,
} from 'app/core/auth/crypto.helper';

@Component({
    selector: 'app-video-projects',
    templateUrl: './video-projects.component.html',
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false,
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
        private projectStore: ProjectStoreService,
        private _matDialog: MatDialog,
        private toastr: ToastrService,
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
        // Nguồn sự thật giờ là đĩa (project-store) thay vì session IndexedDB
        this.projectStore
            .list(this.user?.name || null)
            .then((projects) => {
                this.videoProjects = projects
                    .filter((p) => p.uuid && p.title)
                    .map((p) => {
                        // Tính trạng thái động từ danh sách clip
                        const st = this.projectStore.computeStatus(p);
                        let statusLabel = 'Bản nháp';
                        let statusClass = 'bg-blue-100 text-blue-600';
                        if (st.statusLabel === 'app.empty') {
                            statusLabel = 'Trống';
                            statusClass = 'bg-gray-100 text-gray-600';
                        } else if (st.statusLabel === 'app.ready') {
                            statusLabel = 'Sẵn sàng';
                            statusClass = 'bg-green-100 text-green-600';
                        } else if (st.statusLabel === 'app.working') {
                            statusLabel = 'Đang làm';
                            statusClass = 'bg-amber-100 text-amber-600';
                        }
                        return { ...p, ...st, statusLabel, statusClass };
                    });
            })
            .catch((e) => console.error('[video-projects] Lỗi load dự án:', e));
    }

    deleteVideoProject(project: any, event: MouseEvent) {
        event.stopPropagation();

        const dialogRef = this._fuseConfirmationService.open({
            title: 'Xóa kịch bản video',
            message: `Bạn có chắc chắn muốn xóa kịch bản "<b>${project.title || 'Dự án mới'}</b>"?<br>Hành động này không thể hoàn tác và sẽ xóa toàn bộ dữ liệu âm thanh, hình ảnh liên quan.`,
            icon: {
                show: true,
                name: 'heroicons_outline:question-mark-circle',
                color: 'warn',
            },
            actions: {
                confirm: {
                    show: true,
                    label: 'Xóa',
                    color: 'warn',
                },
                cancel: {
                    show: true,
                    label: 'Hủy',
                },
            },
            dismissible: true,
        });

        dialogRef.afterClosed().subscribe(async (result) => {
            if (result === 'confirmed') {
                // Xóa dữ liệu cấu trúc (meta/timeline/casting) trên đĩa + registry
                await this.projectStore.remove(this.user?.name || null, project.uuid);

                this.videoProjects = this.videoProjects.filter(
                    (p) => p.uuid !== project.uuid,
                );

                if ((window as any).electron) {
                    try {
                        await (window as any).electron.invoke(
                            'delete-project',
                            {
                                targetUuid: project.uuid,
                                username: this.user.name,
                            },
                        );
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
                const res = await (window as any).electron.invoke(
                    'import-project',
                    {
                        currentUuid: '',
                        username: this.user?.name || 'admin',
                    },
                );

                if (res && res.success) {
                    const data = res.projectData;
                    const targetUuid = res.targetUuid;

                    // Ki?m tra v luu d? li?u
                    if (data) {
                        // Lưu cấu trúc dự án xuống đĩa qua project-store
                        await this.projectStore.save(
                            this.user?.name || null,
                            targetUuid,
                            {
                                meta: data,
                                casting: data.videoProject?.characters || null,
                            },
                        );
                    }

                    // Chuy?n sang trang ch?nh s?a k?ch b?n m?i
                    const routeName = this.user?.name || 'admin';
                    this.router.navigate([
                        '/voice2video',
                        routeName,
                        targetUuid,
                    ]);
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
        this.router.navigate(['/voice2video', username, targetUuid]);
    }
}
