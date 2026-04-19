import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

// Khai báo để dùng môi trường Electron
declare global {
  interface Window {
    require: any;
  }
}

export interface SyncDataParams {
  collection: string;
  data: any[];
}

@Injectable({
  providedIn: 'root'
})
export class LocalDbService {
  private ipcRenderer: any;
  private syncInterval: any;

  constructor() {
    if (window && window.require) {
      try {
        this.ipcRenderer = window.require('electron').ipcRenderer;
      } catch (e) {
        console.warn('[LocalDbService] Lỗi kết nối ipcRenderer.', e);
      }
    } else {
      console.warn('[LocalDbService] Cảnh báo: Không chạy trong ứng dụng Desktop (Electron).');
    }
  }

  /**
   * Lấy toàn bộ mảng dữ liệu match với Query
   */
  async dbAll(query: string, params: any[] = []): Promise<any[]> {
    if (!this.ipcRenderer) return [];
    try {
      const res = await this.ipcRenderer.invoke('db-all', { query, params });
      if (!res.success) throw new Error(res.error);
      return res.data;
    } catch (err) {
      console.error('[dbAll Error]:', err);
      throw err;
    }
  }

  /**
   * Lấy duy nhất 1 bản ghi
   */
  async dbGet(query: string, params: any[] = []): Promise<any> {
    if (!this.ipcRenderer) return null;
    try {
      const res = await this.ipcRenderer.invoke('db-get', { query, params });
      if (!res.success) throw new Error(res.error);
      return res.data;
    } catch (err) {
      console.error('[dbGet Error]:', err);
      throw err;
    }
  }

  /**
   * Thực thi thêm/sửa/xóa
   */
  async dbRun(query: string, params: any[] = []): Promise<{ changes: number, lastInsertRowid: number }> {
    if (!this.ipcRenderer) return { changes: 0, lastInsertRowid: 0 };
    try {
      const res = await this.ipcRenderer.invoke('db-run', { query, params });
      if (!res.success) throw new Error(res.error);
      return res.info;
    } catch (err) {
      console.error('[dbRun Error]:', err);
      throw err;
    }
  }

}
