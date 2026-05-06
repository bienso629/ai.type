import { Injectable, isDevMode } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class N8nService {
    // URL API quản lý (Create/Delete/Activate Workflow)
    private get API_BASE_URL(): string {
        return 'https://n8n.type.vn/api/v1';
    }

    // URL Webhook để kích hoạt luồng chạy (Trigger)
    private get WEBHOOK_BASE_URL(): string {
        return 'https://n8n.type.vn/webhook';
    }

    private get N8N_TOKEN(): string {
        return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYTEwNDEyZC00OGMxLTQ2ZjQtYTU0Yy0xODFjNzRhNjU2NWIiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNGVlNDRhNjktMTFhYS00ODk1LWE4MWItM2RiNDllMDczZmQzIiwiaWF0IjoxNzc4MDc3Mzg0fQ.TUAw1E5_KveZOdAj_NDpJgoOkNmaHQrA2hew-BpkdT4'; // Production Token
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

                    const createNew = () => {
                        const template = {
                            name: "Auto-Generated: Đăng bài Facebook",
                            settings: {},
                            nodes: [
                                {
                                    parameters: { httpMethod: "POST", path: "share-facebook", responseMode: "onReceived" },
                                    name: "Webhook",
                                    type: "n8n-nodes-base.webhook",
                                    typeVersion: 1.1,
                                    position: [0, 300],
                                    webhookId: "share-facebook"
                                },
                                {
                                    parameters: {
                                        mode: "runOnceForAllItems",
                                        jsCode: "const items = [];\nfor (const item of $input.all()) {\n  const data = item.json.body || item.json;\n  let pages = [];\n  if (data.pages) {\n    if (typeof data.pages === 'string') {\n      try { pages = JSON.parse(data.pages); } catch(e){}\n    } else {\n      pages = data.pages;\n    }\n  }\n  if (pages.length === 0) continue;\n\n  for (const page of pages) {\n    if (item.binary && Object.keys(item.binary).length > 0) {\n      for (const key of Object.keys(item.binary)) {\n        const binData = item.binary[key];\n        const isVideo = binData.mimeType ? binData.mimeType.startsWith('video/') : false;\n        items.push({\n          json: { title: data.title, description: data.description, hasFile: true, isVideo: isVideo, pageId: page.id, pageAccessToken: page.access_token },\n          binary: { source: binData }\n        });\n      }\n    } else {\n      items.push({ json: { title: data.title, description: data.description, hasFile: false, isVideo: false, pageId: page.id, pageAccessToken: page.access_token } });\n    }\n  }\n}\nreturn items;"
                                    },
                                    name: "Split Images",
                                    type: "n8n-nodes-base.code",
                                    typeVersion: 2,
                                    position: [200, 300]
                                },
                                {
                                    parameters: {
                                        conditions: { boolean: [{ value1: "={{ $json.hasFile }}", value2: true }] }
                                    },
                                    name: "Has File?",
                                    type: "n8n-nodes-base.if",
                                    typeVersion: 1,
                                    position: [400, 300]
                                },
                                {
                                    parameters: {
                                        authentication: "none",
                                        method: "POST",
                                        url: "={{ $json.isVideo ? 'https://graph.facebook.com/v23.0/' + $json.pageId + '/videos' : 'https://graph.facebook.com/v23.0/' + $json.pageId + '/photos' }}",
                                        sendBody: true,
                                        contentType: "multipart-form-data",
                                        bodyParameters: {
                                            parameters: [
                                                { name: "message", value: "={{ $json.description }}" },
                                                { name: "access_token", value: "={{ $json.pageAccessToken }}" },
                                                { parameterType: "formBinaryData", name: "source", inputDataFieldName: "source" }
                                            ]
                                        }
                                    },
                                    name: "Facebook Post Media",
                                    type: "n8n-nodes-base.httpRequest",
                                    typeVersion: 4.1,
                                    position: [600, 200]
                                },
                                {
                                    parameters: {
                                        authentication: "none",
                                        method: "POST",
                                        url: "=https://graph.facebook.com/v23.0/{{ $json.pageId }}/feed",
                                        sendBody: true,
                                        contentType: "multipart-form-data",
                                        bodyParameters: {
                                            parameters: [
                                                { name: "message", value: "={{ $json.description }}" },
                                                { name: "access_token", value: "={{ $json.pageAccessToken }}" }
                                            ]
                                        }
                                    },
                                    name: "Facebook Post Text",
                                    type: "n8n-nodes-base.httpRequest",
                                    typeVersion: 4.1,
                                    position: [600, 400]
                                }
                            ],
                            connections: {
                                "Webhook": { main: [[{ node: "Split Images", type: "main", index: 0 }]] },
                                "Split Images": { main: [[{ node: "Has File?", type: "main", index: 0 }]] },
                                "Has File?": { main: [[{ node: "Facebook Post Media", type: "main", index: 0 }], [{ node: "Facebook Post Text", type: "main", index: 0 }]] }
                            }
                        };

                        this.createWorkflow(template).subscribe({
                            next: (created) => {
                                if (created && created.id) {
                                    this.activateWorkflow(created.id).subscribe();
                                }
                                observer.next({ status: 'created', workflow: created });
                                observer.complete();
                            },
                            error: (err) => observer.error(err)
                        });
                    };

                    if (exists) {
                        this.http.delete(`${this.API_BASE_URL}/workflows/${exists.id}`, { headers: this.getHeaders() }).subscribe({
                            next: () => createNew(),
                            error: () => createNew() // Try creating anyway if delete fails
                        });
                    } else {
                        createNew();
                    }
                },
                error: (err) => observer.error(err)
            });
        });
    }
}