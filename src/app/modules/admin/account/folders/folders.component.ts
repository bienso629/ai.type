import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { N8nService } from 'app/_services/n8n.service';
import { MultiAccountService } from 'app/_services/multi-account.service';
import { HelperService } from 'app/helper.service';

export interface WorkspaceRootInfo {
    id: string;
    name: string;
    badge: string;
    description: string;
    path: string;
    exists: boolean;
    isCustom: boolean;
    folderCount: number;
    fileCount: number;
    directSize: number;
}

export interface WorkspaceTreeNode {
    id: string;
    name: string;
    path: string;
    isDirectory: boolean;
    isRoot?: boolean;
    isCustomRoot?: boolean;
    badge?: string;
    description?: string;
    exists?: boolean;
    size: number;
    mtimeMs: number;
    ext: string;
    category: string;
    childCount: number;
    depth: number;
    expanded?: boolean;
    loading?: boolean;
    loaded?: boolean;
    children?: WorkspaceTreeNode[];
    parentPath?: string;
}

export interface FilePreviewData {
    type: 'directory' | 'text' | 'image' | 'video' | 'audio' | 'binary';
    category?: string;
    ext?: string;
    size?: number;
    mtimeMs?: number;
    truncated?: boolean;
    content?: string;
    dataUrl?: string;
    mediaUrl?: string;
}

export interface WorkspaceBreadcrumbItem {
    name: string;
    path: string;
    isRoot: boolean;
    isCurrent: boolean;
}

@Component({
    selector: 'app-workspace-folders',
    standalone: false,
    templateUrl: './folders.component.html',
    styleUrls: ['./folders.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkspaceFoldersComponent implements OnInit {
    isLoadingRoots = false;
    treeRoots: WorkspaceTreeNode[] = [];
    selectedNode: WorkspaceTreeNode | null = null;
    currentDirItems: WorkspaceTreeNode[] = [];

    searchQuery = '';
    activeCategoryFilter: string = 'all';

    // Xem trước & chỉnh sửa tệp
    isLoadingPreview = false;
    previewData: FilePreviewData | null = null;
    safeMediaUrl: SafeUrl | string = '';
    private _cachedRawMediaUrl = '';
    editableTextContent = '';
    isTextDirty = false;
    isSavingText = false;

    // Form tạo mới / đổi tên inline
    inlineActionMode: 'none' | 'create-folder' | 'create-file' | 'rename' = 'none';
    inlineActionTargetNode: WorkspaceTreeNode | null = null;
    inlineInputName = '';
    isSubmittingInline = false;

    // Công cụ chia sẻ Video (Facebook, TikTok, YouTube)
    activeShareTab: 'facebook' | 'tiktok' | 'youtube' = 'facebook';
    videoShareTitle = '';
    videoShareDescription = '';
    videoShareScheduleTime = '';
    isSharingVideo = false;

    // Facebook Fanpage state (đồng bộ với AMXHShareAppComponent)
    fbPages: any[] = [];
    selectedFbPageIds: string[] = [];
    searchPageTerm = '';
    showTokenInput = false;
    fbTokenInput = '';
    isFetchingPages = false;

    // TikTok & YouTube options
    tiktokPrivacy: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'SELF_ONLY' = 'PUBLIC_TO_EVERYONE';
    youtubePrivacy: 'public' | 'unlisted' | 'private' = 'public';
    youtubeIsShorts = true;

    readonly suggestedHashtags = [
        '#xuhuong',
        '#fyp',
        '#reels',
        '#shorts',
        '#tiktok',
        '#viral',
        '#aitype'
    ];

    readonly categoryFilters = [
        { id: 'all', label: 'Tất cả' },
        { id: 'folder', label: 'Thư mục' },
        { id: 'video', label: 'Video' },
        { id: 'audio', label: 'Âm thanh' },
        { id: 'image', label: 'Hình ảnh' },
        { id: 'model3d', label: '3D (.GLB)' },
        { id: 'document', label: 'Tài liệu' },
        { id: 'code', label: 'Mã nguồn' }
    ];

    constructor(
        private _cdr: ChangeDetectorRef,
        private _toastr: ToastrService,
        private _confirmationService: FuseConfirmationService,
        private _http: HttpClient,
        private _sanitizer: DomSanitizer,
        private _n8nService: N8nService,
        private _multiAccountService: MultiAccountService,
        private _helperService: HelperService
    ) {}

    private get _electron(): any {
        return typeof window !== 'undefined' ? (window as any).electron : null;
    }

    ngOnInit(): void {
        this.loadSavedFacebookPages();
        this.loadWorkspaceRoots(true);
    }

    async loadWorkspaceRoots(selectFirst = false): Promise<void> {
        if (!this._electron?.invoke) {
            this._toastr.warning('Tính năng Quản lý Thư mục yêu cầu chạy trên ứng dụng Desktop.', 'Thư mục làm việc');
            return;
        }
        this.isLoadingRoots = true;
        this._cdr.markForCheck();

        try {
            const res = await this._electron.invoke('workspace:get-roots');
            if (res?.success && Array.isArray(res.roots)) {
                const prevExpandedPaths = new Set<string>();
                this._collectExpandedPaths(this.treeRoots, prevExpandedPaths);

                this.treeRoots = res.roots.map((r: WorkspaceRootInfo) => ({
                    id: r.id,
                    name: r.name,
                    path: r.path,
                    isDirectory: true,
                    isRoot: true,
                    isCustomRoot: r.isCustom,
                    badge: r.badge,
                    description: r.description,
                    exists: r.exists,
                    size: r.directSize || 0,
                    mtimeMs: 0,
                    ext: '',
                    category: 'folder',
                    childCount: (r.folderCount || 0) + (r.fileCount || 0),
                    depth: 0,
                    expanded: false,
                    loaded: false,
                    children: []
                }));

                // Tự động mở rộng thư mục gốc đầu tiên hoặc các nhánh đã mở trước đó
                for (let i = 0; i < this.treeRoots.length; i++) {
                    const root = this.treeRoots[i];
                    if (prevExpandedPaths.has(root.path) || (selectFirst && i === 0 && root.exists)) {
                        await this.toggleNodeExpand(root, true);
                    }
                }

                if (selectFirst && this.treeRoots.length > 0) {
                    await this.selectNode(this.treeRoots[0]);
                } else if (this.selectedNode) {
                    const matched = this._findNodeByPath(this.treeRoots, this.selectedNode.path);
                    if (matched) {
                        await this.selectNode(matched);
                    }
                }
            }
        } catch (err: any) {
            this._toastr.error('Không thể tải danh sách thư mục làm việc: ' + (err?.message || err), 'Lỗi');
        } finally {
            this.isLoadingRoots = false;
            this._cdr.markForCheck();
        }
    }

    private _collectExpandedPaths(nodes: WorkspaceTreeNode[], out: Set<string>): void {
        for (const n of nodes || []) {
            if (n.expanded) out.add(n.path);
            if (n.children?.length) this._collectExpandedPaths(n.children, out);
        }
    }

    private _findNodeByPath(nodes: WorkspaceTreeNode[], targetPath: string): WorkspaceTreeNode | null {
        for (const n of nodes || []) {
            if (n.path === targetPath) return n;
            if (n.children?.length) {
                const found = this._findNodeByPath(n.children, targetPath);
                if (found) return found;
            }
        }
        return null;
    }

    /** Làm phẳng cây thư mục để hiển thị danh sách Tree View có thụt lề mượt mà */
    get flattenedTreeNodes(): WorkspaceTreeNode[] {
        const result: WorkspaceTreeNode[] = [];
        const q = (this.searchQuery || '').trim().toLowerCase();
        const cat = this.activeCategoryFilter;

        const walk = (nodes: WorkspaceTreeNode[]) => {
            for (const node of nodes) {
                const matchesQuery = !q || node.name.toLowerCase().includes(q) || node.path.toLowerCase().includes(q);
                const matchesCat = cat === 'all' || node.isRoot || node.isDirectory || node.category === cat;

                if (node.isRoot || (matchesQuery && matchesCat) || this._hasMatchingDescendant(node, q, cat)) {
                    result.push(node);
                }

                if (node.isDirectory && node.expanded && node.children?.length) {
                    walk(node.children);
                }
            }
        };

        walk(this.treeRoots);
        return result;
    }

    private _hasMatchingDescendant(node: WorkspaceTreeNode, q: string, cat: string): boolean {
        if (!node.children || node.children.length === 0) return false;
        for (const child of node.children) {
            const mQuery = !q || child.name.toLowerCase().includes(q) || child.path.toLowerCase().includes(q);
            const mCat = cat === 'all' || child.category === cat;
            if (mQuery && mCat) return true;
            if (this._hasMatchingDescendant(child, q, cat)) return true;
        }
        return false;
    }

    /** Danh sách phân đoạn Breadcrumb từ thư mục gốc đến mục đang chọn */
    get selectedNodeBreadcrumbs(): WorkspaceBreadcrumbItem[] {
        if (!this.selectedNode) return [];
        const normPath = (p: string) => (p || '').replace(/\\/g, '/').replace(/\/+$/, '');
        const selNorm = normPath(this.selectedNode.path);

        const root = (this.treeRoots || []).find(r => {
            const rNorm = normPath(r.path);
            return selNorm === rNorm || selNorm.startsWith(rNorm + '/');
        });

        if (!root) {
            return [
                {
                    name: this.selectedNode.name,
                    path: this.selectedNode.path,
                    isRoot: !!this.selectedNode.isRoot,
                    isCurrent: true
                }
            ];
        }

        const rootNorm = normPath(root.path);
        const shortRootName = (root.name || '').replace(/\s*\(.*?\)\s*$/, '').trim() || root.name;
        const crumbs: WorkspaceBreadcrumbItem[] = [
            {
                name: shortRootName,
                path: root.path,
                isRoot: true,
                isCurrent: selNorm === rootNorm
            }
        ];

        if (selNorm.length > rootNorm.length) {
            const sep = root.path.includes('\\') ? '\\' : '/';
            const rel = selNorm.slice(rootNorm.length).replace(/^\/+/, '');
            const parts = rel.split('/').filter(Boolean);
            let accPath = root.path.replace(/[/\\]+$/, '');

            for (let i = 0; i < parts.length; i++) {
                accPath = accPath + sep + parts[i];
                crumbs.push({
                    name: parts[i],
                    path: accPath,
                    isRoot: false,
                    isCurrent: i === parts.length - 1
                });
            }
        }

        return crumbs;
    }

    async navigateToBreadcrumb(crumb: WorkspaceBreadcrumbItem, event?: Event): Promise<void> {
        if (event) {
            event.stopPropagation();
        }
        if (!crumb || this.selectedNode?.path === crumb.path) return;

        // Thử tìm nhanh nếu node đã có sẵn trong cây
        const existing = this._findNodeByPath(this.treeRoots, crumb.path);
        if (existing) {
            if (existing.isDirectory) {
                existing.expanded = true;
            }
            await this.selectNode(existing);
            return;
        }

        // Nếu chưa mở nhánh cha, duyệt từ gốc xuống từng cấp
        const crumbs = this.selectedNodeBreadcrumbs;
        if (!crumbs.length) return;
        let current = this._findNodeByPath(this.treeRoots, crumbs[0].path);
        if (!current) return;

        for (let i = 0; i < crumbs.length; i++) {
            const step = crumbs[i];
            if (i > 0) {
                if (!current.loaded) {
                    await this.loadNodeChildren(current);
                }
                current.expanded = true;
                const nextNode = (current.children || []).find(c => c.path === step.path);
                if (!nextNode) break;
                current = nextNode;
            }
            if (step.path === crumb.path) {
                if (current.isDirectory) {
                    current.expanded = true;
                }
                await this.selectNode(current);
                return;
            }
        }
    }

    /** Danh sách mục con hiển thị ở bảng chi tiết bên phải khi đang chọn 1 thư mục (sắp xếp mới nhất lên đầu) */
    get filteredCurrentDirItems(): WorkspaceTreeNode[] {
        const q = (this.searchQuery || '').trim().toLowerCase();
        const cat = this.activeCategoryFilter;
        return (this.currentDirItems || [])
            .filter(item => {
                const matchQ = !q || item.name.toLowerCase().includes(q);
                const matchCat = cat === 'all' || item.category === cat;
                return matchQ && matchCat;
            })
            .slice()
            .sort((a, b) => {
                if (a.isDirectory !== b.isDirectory) {
                    return a.isDirectory ? -1 : 1;
                }
                if ((b.mtimeMs || 0) !== (a.mtimeMs || 0)) {
                    return (b.mtimeMs || 0) - (a.mtimeMs || 0);
                }
                return a.name.localeCompare(b.name, 'vi', { numeric: true, sensitivity: 'base' });
            });
    }

    async toggleNodeExpand(node: WorkspaceTreeNode, forceExpand?: boolean, event?: Event): Promise<void> {
        if (event) {
            event.stopPropagation();
        }
        if (!node.isDirectory) {
            await this.selectNode(node);
            return;
        }

        if (node.isRoot && node.exists === false) {
            await this.ensureRootExists(node);
        }

        const nextState = forceExpand !== undefined ? forceExpand : !node.expanded;
        if (!nextState) {
            node.expanded = false;
            this._cdr.markForCheck();
            return;
        }

        node.expanded = true;
        await this.loadNodeChildren(node);
    }

    async loadNodeChildren(node: WorkspaceTreeNode): Promise<void> {
        if (!this._electron?.invoke || !node.isDirectory) return;
        node.loading = true;
        this._cdr.markForCheck();

        try {
            const res = await this._electron.invoke('workspace:list-dir', { dirPath: node.path });
            if (res?.success && Array.isArray(res.items)) {
                const existingMap = new Map<string, WorkspaceTreeNode>();
                for (const oldChild of node.children || []) {
                    existingMap.set(oldChild.path, oldChild);
                }

                node.children = res.items.map((item: any) => {
                    const prev = existingMap.get(item.path);
                    return {
                        id: item.path,
                        name: item.name,
                        path: item.path,
                        isDirectory: item.isDirectory,
                        size: item.size || 0,
                        mtimeMs: item.mtimeMs || 0,
                        ext: item.ext || '',
                        category: item.category || (item.isDirectory ? 'folder' : 'other'),
                        childCount: item.childCount || 0,
                        depth: node.depth + 1,
                        expanded: prev ? prev.expanded : false,
                        loaded: prev ? prev.loaded : false,
                        children: prev ? prev.children : [],
                        parentPath: node.path
                    } as WorkspaceTreeNode;
                });
                node.childCount = node.children.length;
                node.loaded = true;
                node.exists = true;
            }
        } catch (err: any) {
            this._toastr.error('Lỗi đọc thư mục: ' + (err?.message || err), 'Thư mục làm việc');
        } finally {
            node.loading = false;
            this._cdr.markForCheck();
        }
    }

    async selectNode(node: WorkspaceTreeNode, event?: Event): Promise<void> {
        if (event) {
            event.stopPropagation();
        }
        const isSameFile = !node.isDirectory && this.selectedNode?.path === node.path && !!this.previewData;
        this.selectedNode = node;
        this.cancelInlineAction();

        if (node.isDirectory) {
            this.previewData = null;
            this.safeMediaUrl = '';
            this._cachedRawMediaUrl = '';
            if (!node.loaded) {
                await this.loadNodeChildren(node);
            }
            this.currentDirItems = node.children || [];
            this._cdr.markForCheck();
        } else if (!isSameFile) {
            await this.loadFilePreview(node);
        }
    }

    async onNodeRowClick(node: WorkspaceTreeNode, event?: Event): Promise<void> {
        if (event) {
            event.stopPropagation();
        }
        if (node.isDirectory) {
            if (this.selectedNode?.path === node.path) {
                await this.toggleNodeExpand(node);
            } else {
                await this.toggleNodeExpand(node, true);
                await this.selectNode(node);
            }
        } else {
            await this.selectNode(node);
        }
    }

    async openChildFromTable(item: WorkspaceTreeNode): Promise<void> {
        if (item.isDirectory && this.selectedNode) {
            this.selectedNode.expanded = true;
            await this.toggleNodeExpand(item, true);
            await this.selectNode(item);
        } else {
            await this.selectNode(item);
        }
    }

    async loadFilePreview(node: WorkspaceTreeNode): Promise<void> {
        if (!this._electron?.invoke) return;
        this.isLoadingPreview = true;
        this.previewData = null;
        this.safeMediaUrl = '';
        this._cachedRawMediaUrl = '';
        this.isTextDirty = false;
        this._cdr.markForCheck();

        try {
            const res = await this._electron.invoke('workspace:preview-item', { itemPath: node.path });
            if (res?.success) {
                this.previewData = res;
                if (res.mediaUrl) {
                    this._cachedRawMediaUrl = res.mediaUrl;
                    this.safeMediaUrl = this._sanitizer.bypassSecurityTrustUrl(res.mediaUrl);
                }
                if (res.type === 'text') {
                    this.editableTextContent = res.content || '';
                } else if (res.type === 'video') {
                    const cleanName = (node.name || '')
                        .replace(/\.[^.]+$/, '')
                        .replace(/[_-]+/g, ' ')
                        .trim();
                    this.videoShareTitle = cleanName || node.name;
                    if (!this.videoShareDescription) {
                        this.videoShareDescription = `${this.videoShareTitle}\n\n#xuhuong #fyp #reels #shorts #tiktok`;
                    }
                }
            } else {
                this._toastr.warning(res?.error || 'Không thể xem trước tệp này.');
            }
        } catch (err: any) {
            this._toastr.error('Lỗi xem trước tệp: ' + (err?.message || err));
        } finally {
            this.isLoadingPreview = false;
            this._cdr.markForCheck();
        }
    }

    onEditableTextChange(): void {
        this.isTextDirty = true;
    }

    async saveCurrentTextFile(): Promise<void> {
        if (!this.selectedNode || this.selectedNode.isDirectory || !this._electron?.invoke) return;
        this.isSavingText = true;
        this._cdr.markForCheck();

        try {
            const res = await this._electron.invoke('workspace:save-text-file', {
                itemPath: this.selectedNode.path,
                content: this.editableTextContent
            });
            if (res?.success) {
                this.isTextDirty = false;
                this._toastr.success(`Đã lưu tệp "${this.selectedNode.name}".`, 'Lưu thành công');
                await this.refreshSelectedBranch();
            } else {
                this._toastr.error(res?.error || 'Không thể lưu tệp.');
            }
        } catch (err: any) {
            this._toastr.error('Lỗi lưu tệp: ' + (err?.message || err));
        } finally {
            this.isSavingText = false;
            this._cdr.markForCheck();
        }
    }

    async ensureRootExists(node: WorkspaceTreeNode, event?: Event): Promise<void> {
        if (event) event.stopPropagation();
        if (!this._electron?.invoke) return;
        const res = await this._electron.invoke('workspace:ensure-root', { path: node.path });
        if (res?.success) {
            node.exists = true;
            await this.loadNodeChildren(node);
            this._toastr.success(`Đã khởi tạo thư mục: ${node.path}`, 'Thư mục làm việc');
            this._cdr.markForCheck();
        } else {
            this._toastr.error(res?.error || 'Không thể tạo thư mục.');
        }
    }

    collapseAllNodes(): void {
        const collapseRec = (nodes: WorkspaceTreeNode[]) => {
            for (const n of nodes || []) {
                n.expanded = false;
                if (n.children?.length) collapseRec(n.children);
            }
        };
        collapseRec(this.treeRoots);
        this._cdr.markForCheck();
    }

    async refreshSelectedBranch(): Promise<void> {
        if (!this.selectedNode) {
            await this.loadWorkspaceRoots(false);
            return;
        }
        if (this.selectedNode.isDirectory) {
            await this.loadNodeChildren(this.selectedNode);
            this.currentDirItems = this.selectedNode.children || [];
        } else if (this.selectedNode.parentPath) {
            const parent = this._findNodeByPath(this.treeRoots, this.selectedNode.parentPath);
            if (parent) {
                await this.loadNodeChildren(parent);
            }
            await this.loadFilePreview(this.selectedNode);
        }
        this._cdr.markForCheck();
    }

    startCreateFolder(targetNode?: WorkspaceTreeNode, event?: Event): void {
        if (event) event.stopPropagation();
        const baseNode = targetNode || this.selectedNode || this.treeRoots[0];
        if (!baseNode) return;
        const folderNode = baseNode.isDirectory
            ? baseNode
            : (baseNode.parentPath ? this._findNodeByPath(this.treeRoots, baseNode.parentPath) : this.treeRoots[0]);
        if (!folderNode) return;

        this.inlineActionMode = 'create-folder';
        this.inlineActionTargetNode = folderNode;
        this.inlineInputName = '';
        this._cdr.markForCheck();
    }

    startCreateFile(targetNode?: WorkspaceTreeNode, event?: Event): void {
        if (event) event.stopPropagation();
        const baseNode = targetNode || this.selectedNode || this.treeRoots[0];
        if (!baseNode) return;
        const folderNode = baseNode.isDirectory
            ? baseNode
            : (baseNode.parentPath ? this._findNodeByPath(this.treeRoots, baseNode.parentPath) : this.treeRoots[0]);
        if (!folderNode) return;

        this.inlineActionMode = 'create-file';
        this.inlineActionTargetNode = folderNode;
        this.inlineInputName = 'ghi-chu-moi.md';
        this._cdr.markForCheck();
    }

    startRenameNode(node: WorkspaceTreeNode, event?: Event): void {
        if (event) event.stopPropagation();
        if (!node || node.isRoot) return;
        this.inlineActionMode = 'rename';
        this.inlineActionTargetNode = node;
        this.inlineInputName = node.name;
        this._cdr.markForCheck();
    }

    cancelInlineAction(): void {
        this.inlineActionMode = 'none';
        this.inlineActionTargetNode = null;
        this.inlineInputName = '';
        this.isSubmittingInline = false;
        this._cdr.markForCheck();
    }

    async confirmInlineAction(): Promise<void> {
        if (!this._electron?.invoke || !this.inlineActionTargetNode) return;
        const name = (this.inlineInputName || '').trim();
        if (!name) {
            this._toastr.warning('Vui lòng nhập tên hợp lệ.');
            return;
        }

        this.isSubmittingInline = true;
        this._cdr.markForCheck();

        try {
            const target = this.inlineActionTargetNode;
            if (this.inlineActionMode === 'create-folder') {
                const res = await this._electron.invoke('workspace:create-folder', {
                    parentPath: target.path,
                    folderName: name
                });
                if (res?.success) {
                    this._toastr.success(`Đã tạo thư mục "${name}".`);
                    target.expanded = true;
                    await this.loadNodeChildren(target);
                    if (this.selectedNode?.path === target.path) {
                        this.currentDirItems = target.children || [];
                    }
                    this.cancelInlineAction();
                } else {
                    this._toastr.error(res?.error || 'Không thể tạo thư mục.');
                }
            } else if (this.inlineActionMode === 'create-file') {
                const res = await this._electron.invoke('workspace:create-file', {
                    parentPath: target.path,
                    fileName: name,
                    content: ''
                });
                if (res?.success) {
                    this._toastr.success(`Đã tạo tệp "${name}".`);
                    target.expanded = true;
                    await this.loadNodeChildren(target);
                    if (this.selectedNode?.path === target.path) {
                        this.currentDirItems = target.children || [];
                    }
                    const createdNode = (target.children || []).find(c => c.path === res.path);
                    this.cancelInlineAction();
                    if (createdNode) {
                        await this.selectNode(createdNode);
                    }
                } else {
                    this._toastr.error(res?.error || 'Không thể tạo tệp.');
                }
            } else if (this.inlineActionMode === 'rename') {
                const res = await this._electron.invoke('workspace:rename-item', {
                    itemPath: target.path,
                    newName: name
                });
                if (res?.success) {
                    this._toastr.success(`Đã đổi tên thành "${name}".`);
                    const parent = target.parentPath ? this._findNodeByPath(this.treeRoots, target.parentPath) : null;
                    this.cancelInlineAction();
                    if (parent) {
                        await this.loadNodeChildren(parent);
                        if (this.selectedNode?.path === parent.path) {
                            this.currentDirItems = parent.children || [];
                        } else if (this.selectedNode?.path === target.path) {
                            const updated = (parent.children || []).find(c => c.path === res.newPath);
                            if (updated) await this.selectNode(updated);
                        }
                    } else {
                        await this.loadWorkspaceRoots(false);
                    }
                } else {
                    this._toastr.error(res?.error || 'Không thể đổi tên.');
                }
            }
        } finally {
            this.isSubmittingInline = false;
            this._cdr.markForCheck();
        }
    }

    deleteNode(node: WorkspaceTreeNode, event?: Event): void {
        if (event) event.stopPropagation();
        if (!node || node.isRoot || !this._electron?.invoke) return;

        const confirmRef = this._confirmationService.open({
            title: node.isDirectory ? 'Xóa thư mục' : 'Xóa tệp tin',
            message: `Bạn có chắc chắn muốn chuyển "${node.name}" vào thùng rác không?`,
            icon: { name: 'delete_outline', color: 'warn' },
            actions: {
                confirm: { label: 'Xóa' },
                cancel: { label: 'Hủy' }
            },
            dismissible: true
        });

        confirmRef.afterClosed().subscribe(async (result) => {
            if (result !== 'confirmed') return;
            const res = await this._electron.invoke('workspace:delete-item', { itemPath: node.path });
            if (res?.success) {
                this._toastr.success(`Đã xóa "${node.name}".`);
                const parent = node.parentPath ? this._findNodeByPath(this.treeRoots, node.parentPath) : null;
                if (parent) {
                    await this.loadNodeChildren(parent);
                    if (this.selectedNode?.path === node.path) {
                        await this.selectNode(parent);
                    } else if (this.selectedNode?.path === parent.path) {
                        this.currentDirItems = parent.children || [];
                    }
                } else {
                    await this.loadWorkspaceRoots(false);
                }
                this._cdr.markForCheck();
            } else {
                this._toastr.error(res?.error || 'Không thể xóa mục này.');
            }
        });
    }

    async openInOs(node: WorkspaceTreeNode | null, mode: 'open' | 'reveal' = 'open', event?: Event): Promise<void> {
        if (event) event.stopPropagation();
        if (!node || !this._electron?.invoke) return;
        const res = await this._electron.invoke('workspace:open-item', {
            itemPath: node.path,
            mode
        });
        if (!res?.success) {
            this._toastr.warning(res?.error || 'Không thể mở đường dẫn này trên hệ điều hành.');
        }
    }

    async copyPath(pathStr?: string, event?: Event): Promise<void> {
        if (event) event.stopPropagation();
        const target = pathStr || this.selectedNode?.path;
        if (!target) return;
        try {
            await navigator.clipboard.writeText(target);
            this._toastr.info('Đã sao chép đường dẫn vào bộ nhớ tạm.');
        } catch (_) {}
    }

    async addCustomWorkspaceRoot(): Promise<void> {
        if (!this._electron?.invoke) return;
        const res = await this._electron.invoke('workspace:add-custom-root');
        if (res?.success) {
            this._toastr.success('Đã thêm thư mục làm việc vào danh sách quản lý.');
            await this.loadWorkspaceRoots(false);
        }
    }

    async removeCustomWorkspaceRoot(node: WorkspaceTreeNode, event?: Event): Promise<void> {
        if (event) event.stopPropagation();
        if (!node?.isCustomRoot || !this._electron?.invoke) return;
        const res = await this._electron.invoke('workspace:remove-custom-root', { path: node.path });
        if (res?.success) {
            this._toastr.info('Đã gỡ thư mục tùy chỉnh khỏi danh sách (không xóa dữ liệu trên đĩa).');
            await this.loadWorkspaceRoots(true);
        }
    }

    cleanTempFolders(): void {
        if (!this._electron?.invoke) return;
        const confirmRef = this._confirmationService.open({
            title: 'Dọn dẹp thư mục tạm (_temp_*)',
            message: 'Hệ thống sẽ xóa các thư mục phân tích tạm thời (_temp_*) trong Downloads/AI.TYPING để giải phóng dung lượng ổ cứng. Các video chính vẫn được giữ nguyên.',
            icon: { name: 'cleaning_services', color: 'primary' },
            actions: {
                confirm: { label: 'Dọn ngay' },
                cancel: { label: 'Hủy' }
            },
            dismissible: true
        });

        confirmRef.afterClosed().subscribe(async (result) => {
            if (result !== 'confirmed') return;
            const res = await this._electron.invoke('workspace:clean-temp-dirs');
            if (res?.success) {
                this._toastr.success(
                    `Đã dọn ${res.removedCount || 0} thư mục tạm, giải phóng ${this.formatBytes(res.freedBytes || 0)}.`,
                    'Dọn dẹp hoàn tất'
                );
                await this.loadWorkspaceRoots(false);
            } else {
                this._toastr.error(res?.error || 'Lỗi khi dọn thư mục tạm.');
            }
        });
    }

    getNodeIcon(node: WorkspaceTreeNode): string {
        if (node.isRoot) return 'folder_special';
        if (node.isDirectory) return node.expanded ? 'folder_open' : 'folder';
        switch (node.category) {
            case 'video': return 'movie';
            case 'audio': return 'audiotrack';
            case 'image': return 'image';
            case 'model3d': return 'view_in_ar';
            case 'code': return 'code';
            case 'document': return 'description';
            case 'database': return 'storage';
            case 'archive': return 'inventory_2';
            default: return 'insert_drive_file';
        }
    }

    getCategoryLabel(category: string): string {
        switch (category) {
            case 'folder': return 'Thư mục';
            case 'video': return 'Video';
            case 'audio': return 'Âm thanh';
            case 'image': return 'Hình ảnh';
            case 'model3d': return 'Mô hình 3D';
            case 'code': return 'Mã nguồn';
            case 'document': return 'Tài liệu';
            case 'database': return 'Cơ sở dữ liệu';
            case 'archive': return 'Tệp nén';
            default: return 'Tệp tin';
        }
    }

    formatBytes(bytes: number): string {
        if (!bytes || bytes <= 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
        const val = bytes / Math.pow(1024, i);
        return `${val >= 10 || i === 0 ? Math.round(val) : val.toFixed(1)} ${units[i]}`;
    }

    formatTimeAgo(mtimeMs: number): string {
        if (!mtimeMs || mtimeMs <= 0) return '—';
        const diffSec = Math.max(0, Math.floor((Date.now() - mtimeMs) / 1000));
        if (diffSec < 60) return 'Vừa xong';
        const diffMin = Math.floor(diffSec / 60);
        if (diffMin < 60) return `${diffMin} phút trước`;
        const diffHour = Math.floor(diffMin / 60);
        if (diffHour < 24) return `${diffHour} giờ trước`;
        const diffDay = Math.floor(diffHour / 24);
        if (diffDay < 30) return `${diffDay} ngày trước`;
        const diffMonth = Math.floor(diffDay / 30);
        if (diffMonth < 12) return `${diffMonth} tháng trước`;
        const diffYear = Math.floor(diffDay / 365);
        return `${diffYear} năm trước`;
    }

    trackByPath(_index: number, item: WorkspaceTreeNode): string {
        return item.path;
    }

    // -------------------------------------------------------------------------
    // CÔNG CỤ CHIA SẺ VIDEO (FACEBOOK, TIKTOK, YOUTUBE)
    // -------------------------------------------------------------------------

    getSafeMediaUrl(url?: string): SafeUrl | string {
        if (!url) return '';
        if (this._cachedRawMediaUrl === url && this.safeMediaUrl) {
            return this.safeMediaUrl;
        }
        this._cachedRawMediaUrl = url;
        this.safeMediaUrl = this._sanitizer.bypassSecurityTrustUrl(url);
        return this.safeMediaUrl;
    }

    loadSavedFacebookPages(): void {
        try {
            const savedPages = this._multiAccountService.getItem('fb_pages');
            if (savedPages) {
                this.fbPages = typeof savedPages === 'string' ? JSON.parse(savedPages) : savedPages;
            }
            const savedSelected = this._multiAccountService.getItem('fb_selected_pages');
            if (savedSelected && Array.isArray(this.fbPages) && this.fbPages.length > 0) {
                const parsed = typeof savedSelected === 'string' ? JSON.parse(savedSelected) : savedSelected;
                if (Array.isArray(parsed)) {
                    const validIds = parsed.filter((id: string) => this.fbPages.some(p => p.id === id));
                    this.selectedFbPageIds = validIds.length > 0 ? validIds : [this.fbPages[0].id];
                }
            } else if (Array.isArray(this.fbPages) && this.fbPages.length > 0) {
                this.selectedFbPageIds = [this.fbPages[0].id];
            }
        } catch (_) {}
    }

    get filteredFbPages(): any[] {
        if (!this.searchPageTerm) return this.fbPages || [];
        const term = this.searchPageTerm.toLowerCase();
        return (this.fbPages || []).filter(
            p => (p.name || '').toLowerCase().includes(term) || String(p.id || '').includes(term)
        );
    }

    onSelectedFbPagesChange(ids: string[]): void {
        this.selectedFbPageIds = ids || [];
        if (this.selectedFbPageIds.length > 0) {
            this._multiAccountService.setItem('fb_selected_pages', this.selectedFbPageIds);
        }
        this._cdr.markForCheck();
    }

    getSelectedPageNames(): string {
        if (!this.selectedFbPageIds?.length) return '';
        const selected = (this.fbPages || []).filter(p => this.selectedFbPageIds.includes(p.id));
        return selected.map(p => p.name).join(', ');
    }

    toggleTokenInput(): void {
        this.showTokenInput = !this.showTokenInput;
        this._cdr.markForCheck();
    }

    fetchFacebookPages(): void {
        if (!this.fbTokenInput?.trim()) {
            this._toastr.warning('Vui lòng nhập Access Token Facebook trước khi đồng bộ.');
            return;
        }
        this.isFetchingPages = true;
        this._cdr.markForCheck();

        this._http
            .get(
                `https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token,category,picture{url}&access_token=${encodeURIComponent(this.fbTokenInput.trim())}`
            )
            .subscribe({
                next: (res: any) => {
                    if (res?.data?.length > 0) {
                        this.fbPages = res.data;
                        this._multiAccountService.setItem('fb_pages', this.fbPages);
                        if (!this.selectedFbPageIds?.length) {
                            this.selectedFbPageIds = [this.fbPages[0].id];
                            this._multiAccountService.setItem('fb_selected_pages', this.selectedFbPageIds);
                        }
                        this.showTokenInput = false;
                        this._toastr.success(`Đã đồng bộ ${this.fbPages.length} Fanpage thành công.`);
                    } else {
                        this._toastr.warning('Không tìm thấy Fanpage nào hoặc Token không có quyền.');
                    }
                    this.isFetchingPages = false;
                    this._cdr.markForCheck();
                },
                error: () => {
                    this._toastr.error('Lỗi khi lấy danh sách Fanpage. Vui lòng kiểm tra lại Token.');
                    this.isFetchingPages = false;
                    this._cdr.markForCheck();
                }
            });
    }

    insertHashtag(tag: string): void {
        const cur = (this.videoShareDescription || '').trim();
        if (cur.includes(tag)) return;
        this.videoShareDescription = cur ? `${cur} ${tag}` : tag;
        this._cdr.markForCheck();
    }

    async copyShareCaption(): Promise<void> {
        const title = (this.videoShareTitle || '').trim();
        const desc = (this.videoShareDescription || '').trim();
        const fullText = [title, desc].filter(Boolean).join('\n\n');
        if (!fullText) {
            this._toastr.warning('Chưa có tiêu đề hoặc nội dung để sao chép.');
            return;
        }
        try {
            await navigator.clipboard.writeText(fullText);
            this._toastr.info('Đã sao chép tiêu đề và nội dung vào bộ nhớ tạm.');
        } catch (_) {}
    }

    private async _readSelectedVideoBlob(): Promise<{ blob: Blob; fileName: string } | null> {
        if (!this.selectedNode || this.selectedNode.isDirectory) return null;
        let safePath = this.selectedNode.path.replace(/\\/g, '/');
        if (!safePath.startsWith('/')) safePath = '/' + safePath;
        const fileName = this.selectedNode.name || safePath.split('/').pop() || 'video.mp4';

        const candidateUrls = [
            `mediacors://${safePath.replace(/^\/+/, '')}`,
            this.previewData?.mediaUrl || '',
            `file://${safePath}`
        ].filter(Boolean);

        for (const url of candidateUrls) {
            try {
                const response = await fetch(url);
                if (response.ok) {
                    const blob = await response.blob();
                    return { blob, fileName };
                }
            } catch (_) {}
        }
        return null;
    }

    async sendVideoToAiAssistant(): Promise<void> {
        if (!this.selectedNode) return;
        try {
            const fileData = await this._readSelectedVideoBlob();
            if (!fileData) {
                this._toastr.error('Không thể đọc tệp video để gửi sang Trợ lý AI.');
                return;
            }
            const base64Data = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const result = String(reader.result || '');
                    resolve(result.includes(',') ? result.split(',')[1] : result);
                };
                reader.onerror = reject;
                reader.readAsDataURL(fileData.blob);
            });

            this._helperService.openChatGPTWithSEO$.next({
                goiy: `Hãy viết tiêu đề thu hút, mô tả chuẩn SEO và bộ hashtag xu hướng để đăng video "${this.selectedNode.name}" lên Facebook Reels, TikTok và YouTube Shorts.`,
                attachedFile: {
                    name: fileData.fileName,
                    type: fileData.blob.type || 'video/mp4',
                    path: this.selectedNode.path,
                    base64: base64Data
                }
            });
            this._toastr.info('Đã đính kèm video sang khung Trợ lý AI.');
        } catch (_) {
            this._toastr.error('Không thể đính kèm video sang Trợ lý AI.');
        }
    }

    async openPlatformStudio(platform: 'facebook' | 'tiktok' | 'youtube', revealFile = true): Promise<void> {
        const title = (this.videoShareTitle || '').trim();
        let desc = (this.videoShareDescription || '').trim();
        if (platform === 'youtube' && this.youtubeIsShorts && !/#shorts/i.test(title) && !/#shorts/i.test(desc)) {
            desc = desc ? `${desc} #Shorts` : '#Shorts';
        }
        const combined = [title, desc].filter(Boolean).join('\n\n');
        if (combined) {
            try {
                await navigator.clipboard.writeText(combined);
            } catch (_) {}
        }

        const studioConfig: Record<'facebook' | 'tiktok' | 'youtube', { name: string; url: string }> = {
            facebook: {
                name: 'Facebook',
                url: 'https://www.facebook.com/reels/create'
            },
            tiktok: {
                name: 'Tiktok',
                url: 'https://www.tiktok.com/tiktokstudio/upload'
            },
            youtube: {
                name: 'YouTube Studio',
                url: 'https://studio.youtube.com'
            }
        };

        const target = studioConfig[platform];
        window.dispatchEvent(
            new CustomEvent('open-web-tool', {
                detail: {
                    name: target.name,
                    url: target.url
                }
            })
        );

        if (revealFile && this.selectedNode) {
            await this.openInOs(this.selectedNode, 'reveal');
        }

        this._toastr.success(
            `Đã mở ${target.name}, sao chép sẵn nội dung bài đăng và hiển thị vị trí tệp video để kéo thả.`,
            'Sẵn sàng đăng Video'
        );
    }

    async submitVideoShare(platform: 'facebook' | 'tiktok' | 'youtube' = this.activeShareTab): Promise<void> {
        if (!this.selectedNode || this.selectedNode.isDirectory) return;

        const title = (this.videoShareTitle || '').trim();
        if (!title) {
            this._toastr.warning('Vui lòng nhập tiêu đề video trước khi đăng.');
            return;
        }

        if (platform === 'facebook' && (!this.selectedFbPageIds || this.selectedFbPageIds.length === 0)) {
            this._toastr.warning('Vui lòng chọn ít nhất 1 Fanpage Facebook hoặc bấm "Mở Facebook Reels" để đăng trực tiếp.');
            return;
        }

        this.isSharingVideo = true;
        this._cdr.markForCheck();

        try {
            const fileData = await this._readSelectedVideoBlob();
            if (!fileData) {
                this._toastr.error('Không thể đọc tệp video từ ổ đĩa.');
                return;
            }

            let delayMinutes = 0;
            if (this.videoShareScheduleTime) {
                const selectedTime = new Date(this.videoShareScheduleTime).getTime();
                delayMinutes = Math.max(0, Math.floor((selectedTime - Date.now()) / 60000));
            }

            const formData = new FormData();
            let finalTitle = title;
            let finalDesc = (this.videoShareDescription || '').trim();
            if (platform === 'youtube' && this.youtubeIsShorts && !/#shorts/i.test(finalTitle)) {
                finalTitle = `${finalTitle} #Shorts`;
            }

            formData.append('title', finalTitle);
            formData.append('description', finalDesc || finalTitle);
            formData.append('platform', platform);
            formData.append('delay_minutes', String(delayMinutes));
            if (this.videoShareScheduleTime) {
                formData.append('scheduleTime', this.videoShareScheduleTime);
            }
            formData.append('file_0', fileData.blob, fileData.fileName);

            let webhookPath = 'share-facebook';
            if (platform === 'facebook') {
                webhookPath = 'share-facebook';
                const selectedPages = (this.fbPages || [])
                    .filter(p => this.selectedFbPageIds.includes(p.id))
                    .map(p => ({
                        id: p.id,
                        name: p.name,
                        access_token: p.access_token
                    }));
                formData.append('pages', JSON.stringify(selectedPages));
            } else if (platform === 'tiktok') {
                webhookPath = 'share-tiktok';
                formData.append('privacy_level', this.tiktokPrivacy);
            } else if (platform === 'youtube') {
                webhookPath = 'share-youtube';
                formData.append('privacyStatus', this.youtubePrivacy);
                formData.append('isShorts', String(this.youtubeIsShorts));
            }

            const platformLabel =
                platform === 'facebook' ? 'Facebook Fanpage' : platform === 'tiktok' ? 'TikTok' : 'YouTube';
            this._toastr.info(
                delayMinutes > 0
                    ? `Đang gửi video lên ${platformLabel} (hẹn đăng sau ${delayMinutes} phút)...`
                    : `Đang tải video lên ${platformLabel} qua n8n...`
            );

            await firstValueFrom(this._n8nService.triggerWebhook(webhookPath, formData));
            this._toastr.success(
                delayMinutes > 0
                    ? `Đã lên lịch đăng video lên ${platformLabel} sau ${delayMinutes} phút.`
                    : `Đã gửi lệnh đăng video lên ${platformLabel} thành công.`
            );
        } catch (err: any) {
            console.error('[submitVideoShare] Error:', err);
            this._toastr.warning(
                'Không thể gửi qua n8n Webhook. Bạn có thể bấm nút "Mở Studio & Kéo thả nhanh" bên cạnh để đăng trực tiếp.',
                'Thông báo'
            );
        } finally {
            this.isSharingVideo = false;
            this._cdr.markForCheck();
        }
    }
}
