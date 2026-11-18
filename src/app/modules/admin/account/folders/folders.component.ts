import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { FuseConfirmationService } from '@fuse/services/confirmation';

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
    editableTextContent = '';
    isTextDirty = false;
    isSavingText = false;

    // Form tạo mới / đổi tên inline
    inlineActionMode: 'none' | 'create-folder' | 'create-file' | 'rename' = 'none';
    inlineActionTargetNode: WorkspaceTreeNode | null = null;
    inlineInputName = '';
    isSubmittingInline = false;

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
        private _confirmationService: FuseConfirmationService
    ) {}

    private get _electron(): any {
        return typeof window !== 'undefined' ? (window as any).electron : null;
    }

    ngOnInit(): void {
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
        this.selectedNode = node;
        this.cancelInlineAction();

        if (node.isDirectory) {
            this.previewData = null;
            if (!node.loaded) {
                await this.loadNodeChildren(node);
            }
            this.currentDirItems = node.children || [];
            this._cdr.markForCheck();
        } else {
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
        this.isTextDirty = false;
        this._cdr.markForCheck();

        try {
            const res = await this._electron.invoke('workspace:preview-item', { itemPath: node.path });
            if (res?.success) {
                this.previewData = res;
                if (res.type === 'text') {
                    this.editableTextContent = res.content || '';
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
}
