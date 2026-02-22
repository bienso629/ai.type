import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class N8nService {
    // URL API quản lý (Create/Delete/Activate Workflow)
    private readonly API_BASE_URL = 'https://n8n.type.vn/api/v1';
    
    // URL Webhook để kích hoạt luồng chạy (Trigger)
    // Lưu ý: Webhook thường nằm ở root /webhook/ chứ không phải /api/v1/
    private readonly WEBHOOK_BASE_URL = 'https://n8n.type.vn/webhook';

    private readonly N8N_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI3Y2Y3OWVhZC04OGIwLTQxNzQtYjBkYi1lODhkODUyYjBmNzUiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzY4MDkyNzY5fQ.AdTT-g032JrVFlQPs0mX8TqbXt9M1NaPhe5E19TB9iE';

    constructor(private http: HttpClient) { }

    // --- HELPER: Lấy headers xác thực cho API quản lý ---
    private getHeaders(): HttpHeaders {
        return new HttpHeaders({
            'Content-Type': 'application/json',
            'X-N8N-API-KEY': this.N8N_TOKEN
        });
    }

    // --- 1. QUẢN LÝ WORKFLOWS ---

    // Lấy danh sách workflows
    getWorkflows(): Observable<any> {
        return this.http.get(`${this.API_BASE_URL}/workflows`, { headers: this.getHeaders() });
    }

    // Tạo mới một workflow
    createWorkflow(workflowJson: any): Observable<any> {
        return this.http.post(`${this.API_BASE_URL}/workflows`, workflowJson, { headers: this.getHeaders() });
    }

    // Kích hoạt workflow (Chuyển sang trạng thái Active)
    activateWorkflow(id: string): Observable<any> {
        // Body rỗng vì chỉ cần gọi vào endpoint activate là đủ
        return this.http.post(`${this.API_BASE_URL}/workflows/${id}/activate`, {}, { headers: this.getHeaders() });
    }

    // Xóa một workflow cụ thể
    deleteWorkflow(id: string): Observable<any> {
        return this.http.delete(`${this.API_BASE_URL}/workflows/${id}`, { headers: this.getHeaders() });
    }

    // --- 2. TRIGGER WEBHOOK ---

    /**
     * Gọi vào Webhook để bắt đầu chạy quy trình
     * @param path Đường dẫn webhook (ví dụ: "auto-comment-123456")
     * @param payload Dữ liệu gửi kèm (tùy chọn)
     */
    triggerWebhook(path: string, payload: any = {}): Observable<any> {
        // Lưu ý: Gọi Webhook thường KHÔNG cần header X-N8N-API-KEY 
        // (trừ khi bạn cấu hình Webhook node yêu cầu Auth, nhưng ở đây ta để 'none')
        return this.http.post(`${this.WEBHOOK_BASE_URL}/${path}`, payload);
    }
}