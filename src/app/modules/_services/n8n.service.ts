import { Injectable, isDevMode } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class N8nService {
    // URL API quản lý (Create/Delete/Activate Workflow)
    private get API_BASE_URL(): string {
        return isDevMode() ? 'http://localhost:5678/api/v1' : 'https://n8n.type.vn/api/v1';
    }
    
    // URL Webhook để kích hoạt luồng chạy (Trigger)
    private get WEBHOOK_BASE_URL(): string {
        return isDevMode() ? 'http://localhost:5678/webhook' : 'https://n8n.type.vn/webhook';
    }

    private get N8N_TOKEN(): string {
        return isDevMode() 
            ? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4N2UwOTgyYy05ZTJlLTQwZGUtYjQxMy1jNzFkMTIzODhlNDIiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiN2QxMDQ0M2ItZGFiNC00ZDlhLWI1MGMtYWJlZGRhNjMwZjhmIiwiaWF0IjoxNzc3ODk3NTU2fQ.CUOicULV-KeWTxpiTSq9cG-xfMazR1Xzxd2xUqzvA-s' // Local Token
            : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI3Y2Y3OWVhZC04OGIwLTQxNzQtYjBkYi1lODhkODUyYjBmNzUiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzY4MDkyNzY5fQ.AdTT-g032JrVFlQPs0mX8TqbXt9M1NaPhe5E19TB9iE'; // Production Token
    }

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
        return this.http.post(this.getWebhookUrl(path), payload);
    }
    
    // --- HELPER: Lấy URL Webhook đầy đủ ---
    getWebhookUrl(path: string): string {
        return `${this.WEBHOOK_BASE_URL}/${path}`;
    }

    // --- 3. AUTO-SETUP WORKFLOWS ---
    setupFacebookWorkflow(): Observable<any> {
        return new Observable(observer => {
            this.getWorkflows().subscribe({
                next: (res) => {
                    const workflows = res.data || res || [];
                    const exists = workflows.find((w: any) => w.name === 'Auto-Generated: Đăng bài Facebook');
                    
                    if (exists) {
                        observer.next({ status: 'exists', workflow: exists });
                        observer.complete();
                    } else {
                        const template = {
                            name: "Auto-Generated: Đăng bài Facebook",
                            settings: {},
                            nodes: [
                                {
                                    parameters: { httpMethod: "POST", path: "share-facebook", responseMode: "onReceived" },
                                    name: "Webhook",
                                    type: "n8n-nodes-base.webhook",
                                    typeVersion: 1.1,
                                    position: [200, 300],
                                    webhookId: "share-facebook"
                                },
                                {
                                    parameters: {
                                        mode: "runOnceForEachItem",
                                        jsCode: "const data = $input.item.json.body;\nconst items = [];\nif (data.thumbnail && data.thumbnail.length > 0) {\n  data.thumbnail.forEach((path, index) => {\n    items.push({ json: { title: data.title, description: data.description, filePath: path } });\n  });\n} else {\n  items.push({ json: { title: data.title, description: data.description, filePath: null } });\n}\nreturn items;"
                                    },
                                    name: "Split Images",
                                    type: "n8n-nodes-base.code",
                                    typeVersion: 2,
                                    position: [400, 300]
                                },
                                {
                                    parameters: { fileSelector: "={{ $json.filePath }}" },
                                    name: "Read Local File",
                                    type: "n8n-nodes-base.readWriteFile",
                                    typeVersion: 1,
                                    position: [600, 300]
                                },
                                {
                                    parameters: {
                                        node: "Facebook Graph API",
                                        operation: "create",
                                        resource: "post",
                                        message: "={{ $json.description }}",
                                        attachments: "data"
                                    },
                                    name: "Facebook Post",
                                    type: "n8n-nodes-base.facebookGraphApi",
                                    typeVersion: 1,
                                    position: [800, 300]
                                }
                            ],
                            connections: {
                                "Webhook": { main: [ [ { node: "Split Images", type: "main", index: 0 } ] ] },
                                "Split Images": { main: [ [ { node: "Read Local File", type: "main", index: 0 } ] ] },
                                "Read Local File": { main: [ [ { node: "Facebook Post", type: "main", index: 0 } ] ] }
                            }
                        };
                        
                        this.createWorkflow(template).subscribe({
                            next: (created) => {
                                // Sau khi tạo xong, phải kích hoạt workflow
                                if (created && created.id) {
                                    this.activateWorkflow(created.id).subscribe();
                                }
                                observer.next({ status: 'created', workflow: created });
                                observer.complete();
                            },
                            error: (err) => observer.error(err)
                        });
                    }
                },
                error: (err) => observer.error(err)
            });
        });
    }
}