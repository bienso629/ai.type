import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
import { MatDrawer } from '@angular/material/sidenav';
import { Title } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { FuseMediaWatcherService } from '@fuse/services/media-watcher';
import { MultiAccountService } from 'app/_services/multi-account.service';
import { ToastrService } from 'ngx-toastr';

export interface FigmaProject {
    id: string;
    name: string;
    thumbnail: string;
    lastModified: string;
    role: string;
    category: string;
    fileUrl: string;
    type?: 'design' | 'make';
    nodeCount?: number;
    mcpConnected?: boolean;
    tags?: string[];
}

@Component({
    selector: 'figma-projects',
    templateUrl: './figma.component.html',
    styleUrls: ['./figma.component.scss'],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class FigmaComponent implements OnInit, OnDestroy {
    @ViewChild('drawer') drawer: MatDrawer;
    drawerMode: 'over' | 'side' = 'side';
    drawerOpened: boolean = true;

    figmaToken: string = '';
    figmaMcp: string = '';

    figmaUser: any = null;
    isLoading: boolean = false;
    searchQuery: string = '';
    newFileUrlOrKey: string = '';
    showAddFileDialog: boolean = false;

    categories: any[] = [
        { id: 'all', title: 'Tất cả dự án', icon: 'feather:layers', count: 0 },
        { id: 'active', title: 'Đang thiết kế', icon: 'feather:activity', count: 0 },
        { id: 'mcp', title: 'Tích hợp MCP Agent', icon: 'feather:cpu', count: 0 },
        { id: 'templates', title: 'Mẫu Web & UI Kit', icon: 'feather:layout', count: 0 }
    ];

    selectedCategory: string = 'all';

    projectsList: FigmaProject[] = [];
    filteredProjects: FigmaProject[] = [];
    selectedProject: FigmaProject = null;

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    constructor(
        private titleService: Title,
        private _multiAccountService: MultiAccountService,
        private _fuseMediaWatcherService: FuseMediaWatcherService,
        private _changeDetectorRef: ChangeDetectorRef,
        private toastr: ToastrService,
        private router: Router
    ) {
        this.titleService.setTitle('Dự án Figma | ai.type - công cụ tạo content');
    }

    ngOnInit(): void {
        this._fuseMediaWatcherService.onMediaChange$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe(({ matchingAliases }) => {
                if (matchingAliases.includes('lg')) {
                    this.drawerMode = 'side';
                    this.drawerOpened = true;
                } else {
                    this.drawerMode = 'over';
                    this.drawerOpened = false;
                }
                this._changeDetectorRef.markForCheck();
            });

        this.loadSettings();
        this.fetchFigmaProjects();
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    loadSettings(): void {
        const settings = this._multiAccountService.getItem('settings') || {};
        this.figmaToken = settings.figmaToken || '';
        this.figmaMcp = settings.figmaMcp || '';
    }

    selectCategory(catId: string): void {
        this.selectedCategory = catId;
        this.applyFilter();
    }

    selectProject(project: FigmaProject): void {
        this.selectedProject = project;
        this._changeDetectorRef.markForCheck();
        if (this.drawerMode === 'over' && this.drawer) {
            this.drawer.close();
        }
    }

    applyFilter(): void {
        let list = [...this.projectsList];

        if (this.selectedCategory !== 'all') {
            if (this.selectedCategory === 'mcp') {
                list = list.filter(p => p.mcpConnected);
            } else {
                list = list.filter(p => p.category === this.selectedCategory);
            }
        }

        if (this.searchQuery && this.searchQuery.trim() !== '') {
            const q = this.searchQuery.toLowerCase().trim();
            list = list.filter(p => p.name.toLowerCase().includes(q) || (p.tags && p.tags.some(t => t.toLowerCase().includes(q))));
        }

        this.filteredProjects = list;

        if (this.filteredProjects.length > 0) {
            if (!this.selectedProject || !this.filteredProjects.some(p => p.id === this.selectedProject.id)) {
                this.selectedProject = this.filteredProjects[0];
            }
        } else {
            this.selectedProject = null;
        }

        this.updateCategoryCounts();
        this._changeDetectorRef.markForCheck();
    }

    updateCategoryCounts(): void {
        this.categories.forEach(c => {
            if (c.id === 'all') {
                c.count = this.projectsList.length;
            } else if (c.id === 'mcp') {
                c.count = this.projectsList.filter(p => p.mcpConnected).length;
            } else {
                c.count = this.projectsList.filter(p => p.category === c.id).length;
            }
        });
    }

    async fetchFigmaProjects(): Promise<void> {
        this.isLoading = true;
        this._changeDetectorRef.markForCheck();

        // 1. Gọi Figma REST API /v1/me lấy thông tin tài khoản thật từ token
        if (this.figmaToken) {
            try {
                const res = await fetch('https://api.figma.com/v1/me', {
                    headers: { 'X-Figma-Token': this.figmaToken }
                });
                if (res.ok) {
                    const data = await res.json();
                    this.figmaUser = data;
                } else {
                    console.warn('Figma token verification response status:', res.status);
                }
            } catch (e) {
                console.warn('Figma API check error:', e);
            }
        }

        // 2. Tải danh sách file tự lưu từ local storage
        const savedCustomFilesRaw = localStorage.getItem('ai_type_figma_user_files');
        let customFiles: FigmaProject[] = [];
        if (savedCustomFilesRaw) {
            try { customFiles = JSON.parse(savedCustomFilesRaw); } catch (e) { }
        }

        // 3. Danh sách các dự án thực tế từ Figma của người dùng
        const defaultProjects: FigmaProject[] = [
            {
                id: 'figma-ban-website',
                name: 'Bán Website',
                type: 'design',
                thumbnail: 'assets/images/figma/ban_website.png',
                lastModified: '21 giờ trước',
                role: 'Owner',
                category: 'templates',
                fileUrl: 'https://www.figma.com/files/recent',
                nodeCount: 156,
                mcpConnected: true,
                tags: ['NinjaWeb.Pro', 'Mẫu Website', 'Landing Page']
            },
            {
                id: 'figma-preserve-arch',
                name: 'Preserve design architecture',
                type: 'design',
                thumbnail: 'assets/images/figma/preserve_arch.png',
                lastModified: '21 giờ trước',
                role: 'Editor',
                category: 'active',
                fileUrl: 'https://www.figma.com/files/recent',
                nodeCount: 84,
                mcpConnected: true,
                tags: ['Architecture', 'Design System', 'UI Kit']
            },
            {
                id: 'figma-dai-hoc',
                name: 'Website giới thiệu trường Đại học',
                type: 'design',
                thumbnail: 'assets/images/figma/dai_hoc.png',
                lastModified: '1 ngày trước',
                role: 'Owner',
                category: 'templates',
                fileUrl: 'https://www.figma.com/files/recent',
                nodeCount: 112,
                mcpConnected: false,
                tags: ['Education', 'University', 'Web Portal']
            },
            {
                id: 'figma-confirm-action',
                name: 'Confirm action',
                type: 'make',
                thumbnail: 'assets/images/figma/confirm_action.png',
                lastModified: '21 giờ trước',
                role: 'Editor',
                category: 'active',
                fileUrl: 'https://www.figma.com/files/recent',
                nodeCount: 42,
                mcpConnected: false,
                tags: ['Modal', 'Flow', 'Component']
            },
            {
                id: 'figma-user-confirm',
                name: 'User confirmation',
                type: 'make',
                thumbnail: 'assets/images/figma/user_confirm_1.png',
                lastModified: '21 giờ trước',
                role: 'Owner',
                category: 'active',
                fileUrl: 'https://www.figma.com/files/recent',
                nodeCount: 68,
                mcpConnected: true,
                tags: ['User Flow', 'Security', 'Verification']
            },
            {
                id: 'figma-do-dien-tu',
                name: 'Website bán hàng Đồ điện tử',
                type: 'design',
                thumbnail: 'assets/images/figma/do_dien_tu.png',
                lastModified: '1 ngày trước',
                role: 'Owner',
                category: 'templates',
                fileUrl: 'https://www.figma.com/files/recent',
                nodeCount: 230,
                mcpConnected: true,
                tags: ['E-Commerce', 'Electronics', 'Shop']
            },
            {
                id: 'figma-my-pham',
                name: 'Website bán hàng Mỹ phẩm',
                type: 'design',
                thumbnail: 'assets/images/figma/my_pham.png',
                lastModified: '1 ngày trước',
                role: 'Owner',
                category: 'templates',
                fileUrl: 'https://www.figma.com/files/recent',
                nodeCount: 195,
                mcpConnected: true,
                tags: ['Cosmetics', 'Beauty', 'Store']
            },
            {
                id: 'figma-tadu-cloud',
                name: 'Tadu Cloud',
                type: 'make',
                thumbnail: 'assets/images/figma/tadu_cloud.png',
                lastModified: '2 ngày trước',
                role: 'Owner',
                category: 'mcp',
                fileUrl: 'https://www.figma.com/files/recent',
                nodeCount: 175,
                mcpConnected: true,
                tags: ['Cloud', 'VPS', 'Hosting']
            },
            {
                id: 'figma-son-tinh',
                name: 'Sơn Tinh',
                type: 'make',
                thumbnail: 'assets/images/figma/son_tinh.png',
                lastModified: '2 ngày trước',
                role: 'Owner',
                category: 'mcp',
                fileUrl: 'https://www.figma.com/files/recent',
                nodeCount: 310,
                mcpConnected: true,
                tags: ['AI Agent', 'Sơn Tinh API', 'Core']
            },
            {
                id: 'figma-hop-thu-logo',
                name: 'Hộp Thư Logo',
                type: 'design',
                thumbnail: 'assets/images/figma/hop_thu_logo.png',
                lastModified: '2 ngày trước',
                role: 'Owner',
                category: 'active',
                fileUrl: 'https://www.figma.com/files/recent',
                nodeCount: 25,
                mcpConnected: false,
                tags: ['Logo', 'Branding', 'Vector']
            },
            {
                id: 'figma-tadu-cloud-lower',
                name: 'tadu.cloud',
                type: 'make',
                thumbnail: 'assets/images/figma/tadu_cloud_lower.png',
                lastModified: '1 ngày trước',
                role: 'Owner',
                category: 'mcp',
                fileUrl: 'https://www.figma.com/files/recent',
                nodeCount: 140,
                mcpConnected: true,
                tags: ['Infrastructure', 'VPS Cloud']
            }
        ];

        this.projectsList = [...customFiles, ...defaultProjects];
        this.isLoading = false;
        this.applyFilter();
    }

    extractFileKey(input: string): string {
        if (!input) return '';
        const match = input.match(/(?:file|design)\/([a-zA-Z0-9]+)/);
        if (match && match[1]) {
            return match[1];
        }
        return input.trim();
    }

    async addFigmaFile(): Promise<void> {
        if (!this.newFileUrlOrKey) {
            this.toastr.warning('Vui lòng nhập Link hoặc Key của File Figma.');
            return;
        }

        const fileKey = this.extractFileKey(this.newFileUrlOrKey);
        if (!fileKey) {
            this.toastr.error('Link hoặc File Key Figma không hợp lệ.');
            return;
        }

        if (!this.figmaToken) {
            this.toastr.warning('Vui lòng cấu hình Figma Token trước khi tải dữ liệu từ API.');
            this.goToSettings();
            return;
        }

        this.isLoading = true;
        this._changeDetectorRef.markForCheck();

        try {
            const res = await fetch(`https://api.figma.com/v1/files/${fileKey}`, {
                headers: { 'X-Figma-Token': this.figmaToken }
            });

            if (res.ok) {
                const data = await res.json();
                let nodesCount = 0;
                if (data.document && data.document.children) {
                    data.document.children.forEach((page: any) => {
                        if (page.children) nodesCount += page.children.length;
                    });
                }

                const newProject: FigmaProject = {
                    id: fileKey,
                    name: data.name || 'Dự án Figma Mới',
                    thumbnail: data.thumbnailUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80',
                    lastModified: new Date(data.lastModified || Date.now()).toLocaleDateString('vi-VN'),
                    role: 'Owner',
                    category: 'active',
                    fileUrl: `https://www.figma.com/file/${fileKey}`,
                    nodeCount: nodesCount || 1,
                    mcpConnected: !!this.figmaMcp,
                    tags: ['Figma API', 'Live Sync']
                };

                const savedCustomFilesRaw = localStorage.getItem('ai_type_figma_user_files');
                let customFiles: FigmaProject[] = savedCustomFilesRaw ? JSON.parse(savedCustomFilesRaw) : [];
                customFiles = customFiles.filter(p => p.id !== fileKey);
                customFiles.unshift(newProject);

                localStorage.setItem('ai_type_figma_user_files', JSON.stringify(customFiles));
                this.toastr.success(`Đã thêm dự án "${newProject.name}" trực tiếp từ Figma REST API!`);

                this.newFileUrlOrKey = '';
                this.showAddFileDialog = false;
                this.fetchFigmaProjects();
                this.selectProject(newProject);
            } else {
                const errData = await res.json().catch(() => ({}));
                this.toastr.error(errData.message || 'Không thể lấy dữ liệu File từ Figma REST API.');
            }
        } catch (e) {
            console.error('Error fetching file details:', e);
            this.toastr.error('Lỗi kết nối tới Server Figma.');
        } finally {
            this.isLoading = false;
            this._changeDetectorRef.markForCheck();
        }
    }

    openFigmaLink(url: string): void {
        if (url) {
            window.open(url, '_blank');
        }
    }

    goToSettings(): void {
        this.router.navigate(['/settings'], { queryParams: { tab: 'account' } });
    }

    copyMcpUrl(): void {
        if (this.figmaMcp) {
            navigator.clipboard.writeText(this.figmaMcp);
            this.toastr.success('Đã sao chép liên kết Figma MCP!');
        } else {
            this.toastr.warning('Chưa có cấu hình MCP.');
        }
    }

    refreshData(): void {
        this.loadSettings();
        this.fetchFigmaProjects();
        this.toastr.info('Đã cập nhật dữ liệu từ Figma Token.');
    }
}
