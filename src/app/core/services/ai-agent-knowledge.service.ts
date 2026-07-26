import { Injectable } from '@angular/core';
import { Router, NavigationEnd, Event as RouterEvent } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MatDialog } from '@angular/material/dialog';
import { filter, debounceTime } from 'rxjs/operators';
import { BehaviorSubject, Subject } from 'rxjs';
import { HelperService } from 'app/helper.service';
import { FuseConfigService } from '@fuse/services/config';
import { AppConfig } from 'app/core/config/app.config';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { AuthUtils } from 'app/core/auth/auth.utils';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';
import { GenaiService } from 'app/genai.service';

export interface ScreenKnowledge {
  screenRoute: string;
  uiSchema: any;
  customInstructions: string;
}

@Injectable({
  providedIn: 'root'
})
export class AiAgentKnowledgeService {
  // Current screen knowledge observable so components can subscribe to it
  private _currentKnowledge = new BehaviorSubject<ScreenKnowledge | null>(null);
  public currentKnowledge$ = this._currentKnowledge.asObservable();
  
  private saveSubject = new Subject<{route: string, schema: any}>();
  
  // Biến lưu trữ Route gốc trước khi mở dialog
  private baseRoute: string = '';
  // Biến lưu trữ ID của Dialog hiện tại (nếu có)
  private currentDialogId: string | null = null;
  
  public isLearningModeActive = true;

  // In-memory cache to replace localStorage
  private cachedSchemas: { [route: string]: any } = {};
  public config: AppConfig;
  public user: User;

  constructor(
    private router: Router, 
    private http: HttpClient, 
    private dialog: MatDialog,
    private _h: HelperService,
    private _fuseConfigService: FuseConfigService,
    private _userService: UserService,
    private _multiAccountService: MultiAccountService,
    private genaiService: GenaiService
  ) {
    this._fuseConfigService.config$.subscribe((config: AppConfig) => {
      this.config = config;
    });
    this._userService.user$.subscribe((user: User) => {
      this.user = user;
    });

    this.saveSubject.pipe(
      debounceTime(5000)
    ).subscribe(({ route, schema }) => {
      this._doSaveKnowledge(route, schema);
    });
    
    // Just-in-Time Loading on Route Change
    this.router.events.pipe(
      filter((event: RouterEvent): event is NavigationEnd => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      this.baseRoute = event.urlAfterRedirects;
      // Chỉ nạp context của trang gốc nếu không có popup nào đang mở
      if (!this.currentDialogId) {
        this.loadKnowledgeForRoute(this.baseRoute);
      }
    });

    // Auto-detect Popups/Dialogs globally to update currentDialogId
    this.dialog.afterOpened.subscribe(dialogRef => {
      const componentName = dialogRef.componentInstance ? dialogRef.componentInstance.constructor.name : dialogRef.id;
      this.currentDialogId = `dialog_${componentName}`;
      console.log('[AI Agent] Dialog opened:', this.currentDialogId);
      this.loadKnowledgeForRoute(this.currentDialogId);
    });

    this.dialog.afterAllClosed.subscribe(() => {
      this.currentDialogId = null;
      console.log('[AI Agent] All dialogs closed. Reverting to base route:', this.baseRoute);
      // Khôi phục lại ngữ cảnh của trang gốc sau khi tắt popup
      this.loadKnowledgeForRoute(this.baseRoute || this.router.url);
    });
  }


  public isAnalyzing = new BehaviorSubject<boolean>(false);
  private analyzedStructures = new Set<string>();

  public async triggerManualSave() {
    if (!this.isLearningModeActive || this.isAnalyzing.value) return;
    this.isAnalyzing.next(true);

    const currentRoute = this.currentDialogId || this.router.url;
    const newSchema = this.captureScreenState();
    
    // Capture recent API calls to give context to the Agent
    let recentAPIs: string[] = [];
    try {
        const resources = performance.getEntriesByType("resource");
        recentAPIs = resources
            .filter(r => {
                const res = r as PerformanceResourceTiming;
                return res.initiatorType === 'xmlhttprequest' || res.initiatorType === 'fetch';
            })
            .map(r => r.name)
            .filter(url => url.includes('/v1/') || url.includes('/api/'))
            .map(url => url.split('?')[0]); // get only endpoint path
        // deduplicate
        recentAPIs = Array.from(new Set(recentAPIs)).slice(-10); // get last 10 unique APIs
    } catch (e) {
        console.error('Could not capture APIs', e);
    }

    const promptStr = `Dựa vào thông tin giao diện (UI Schema) và các API đã được gọi gần đây trên màn hình này, hãy đóng vai là một chuyên gia UI/UX và lập trình viên. 
Hãy viết một bản mô tả/hướng dẫn (customInstructions) bằng text thuần túy (không dùng markdown code block quá phức tạp, có thể dùng markdown list) thật súc tích cho AI Agent, giải thích:
1. Màn hình này dùng để làm gì?
2. Các Nút bấm (Buttons) và Input có chức năng gì dựa vào ID, Name, Text?
3. Cấu trúc Data JSON dự kiến (dựa vào formControlName/name) cần truyền vào như thế nào?
4. Danh sách các API được gọi trên màn hình này.

UI Schema (JSON):
${JSON.stringify(newSchema, null, 2)}

Các API gọi gần đây:
${JSON.stringify(recentAPIs, null, 2)}`;

    try {
        const customInstructions = await this.genaiService.generateText({
            model: 'gemini-3.6-flash',
            contents: [{ role: 'user', parts: [{ text: promptStr }] }]
        });
        
        const knowledge: ScreenKnowledge = {
            screenRoute: currentRoute,
            uiSchema: newSchema,
            customInstructions: customInstructions || "Không có hướng dẫn chi tiết."
        };

        // Cache locally
        this.cachedSchemas[currentRoute] = newSchema;
        
        // Save to DB via Subject
        this.saveSubject.next({route: currentRoute, schema: knowledge});
    } catch (err) {
        console.error('[AI Agent] Lỗi khi tạo custom instructions:', err);
    } finally {
        this.isAnalyzing.next(false);
    }
  }

  private getApiUrl(): string {
    let server = this.user?.server;
    
    // Fallback to activeInfo if this.user is not fully propagated yet
    if (!server) {
      let activeInfo = this._multiAccountService.getItem('active_info');
      if (activeInfo) {
        activeInfo = AuthUtils._getActiveInfo(activeInfo);
        if (activeInfo && activeInfo['user']) {
          server = activeInfo['user']['server'];
        }
      }
    }

    if (!server) {
      // Có thể user chưa đăng nhập
      return '';
    }

    if (this.config?.settings?.api?.[server]) {
      return `${this.config.settings.api[server]}/agent/docs`;
    }
    
    // Config có thể chưa load kịp ở lúc init hoặc cấu hình thiếu
    return '';
  }

  private _doSaveKnowledge(route: string, knowledge: ScreenKnowledge) {

    // GỌI API LƯU VÀO DATABASE THẬT
    let activeInfo = this._multiAccountService.getItem('active_info');
    if (activeInfo) {
      activeInfo = AuthUtils._getActiveInfo(activeInfo);
      if (activeInfo && activeInfo['user']) {
        (knowledge as any).appId = 'ai.typing';
        (knowledge as any).appToken = activeInfo['user']['appToken'];
      }
    }

    let postData = {
      params: this._h.encrypt(knowledge, this.config.settings.gen)
    };

    const apiUrl = this.getApiUrl();
    if (!apiUrl) return;

    this.http.post<any>(apiUrl + '/save', postData).subscribe({
      next: (res) => {
        this._currentKnowledge.next(knowledge);
        this.injectIntoAgentContext(knowledge);
        console.log('[AI Agent] Saved context to DB successfully!');
      },
      error: (err) => {
        console.error('[AI Agent] API Error saving context to DB:', err);
      }
    });
  }

  /**
   * Load instructions for the specific route (JIT Context)
   */
  public loadKnowledgeForRoute(route: string) {
    const apiUrl = this.getApiUrl();
    if (!apiUrl) return;
    
    let dataForm: any = { screenRoute: route };

    let activeInfo = this._multiAccountService.getItem('active_info');
    if (activeInfo) {
      activeInfo = AuthUtils._getActiveInfo(activeInfo);
      if (activeInfo && activeInfo['user']) {
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];
      }
    }

    let data = {
      params: this._h.encrypt(dataForm, this.config.settings.gen)
    };
    
    this.http.post<any>(apiUrl + '/get', data).subscribe({
      next: (res) => {
        // Tuỳ thuộc vào format trả về của API, lấy data tương ứng
        const data = res.data ? res.data : (res.uiSchema ? res : null);
        
        if (data) {
          this.cachedSchemas[route] = data.uiSchema;
          this._currentKnowledge.next(data);
          this.injectIntoAgentContext(data);
          console.log('[AI Agent] Loaded context from DB for route:', route);
        } else {
          this._currentKnowledge.next(null);
        }
      },
      error: (err) => {
        console.log('[AI Agent] No existing context in DB or error for route:', route);
        this._currentKnowledge.next(null);
      }
    });
  }

  /**
   * Inject the knowledge into the Agent's system prompt / context
   */
  private injectIntoAgentContext(knowledge: ScreenKnowledge) {
    console.log('[AI Agent] Injecting context for route:', knowledge.screenRoute);
    // Here we would call the GenAI Service to update system prompt.
    // e.g. this.genAiService.updateContext(knowledge);
  }

  /**
   * Toggle learning mode
   */
  public toggleLearningMode() {
    this.isLearningModeActive = !this.isLearningModeActive;
  }

  /**
   * Scrapes the DOM for interactive elements and data
   */
  public captureScreenState(): any {
    const interactiveElements = document.querySelectorAll('button, input, a, select, textarea, [data-ai-id], mat-checkbox, mat-slide-toggle, mat-select, mat-radio-button');
    const uiSchema: any = {
      elements: [],
      expectedDataModel: {}
    };

    interactiveElements.forEach((el: Element) => {
      const htmlEl = el as HTMLElement;
      // Basic heuristic to gather elements
      if (htmlEl.offsetWidth > 0 && htmlEl.offsetHeight > 0) { // is visible
        let elementText = htmlEl.innerText?.trim();
        const value = (htmlEl as HTMLInputElement).value;
        const ariaLabel = htmlEl.getAttribute('aria-label');
        const title = htmlEl.getAttribute('title');
        const matTooltip = htmlEl.getAttribute('matTooltip') || htmlEl.getAttribute('ng-reflect-message');
        const placeholder = htmlEl.getAttribute('placeholder');
        
        // Priority of text content extraction
        let textContent = elementText || ariaLabel || title || matTooltip || placeholder || value || '';

        // If it's an input/checkbox without text, try to find a parent label
        if (!textContent && (htmlEl.tagName.toLowerCase() === 'input' || htmlEl.tagName.includes('checkbox') || htmlEl.tagName.includes('toggle'))) {
             const parentLabel = htmlEl.closest('label');
             if (parentLabel) {
                 textContent = parentLabel.innerText?.trim() || '';
             }
        }

        // Only keep meaningful text (avoid huge blobs)
        if (textContent.length > 100) {
            textContent = textContent.substring(0, 100) + '...';
        }

        const nameOrFormControl = htmlEl.getAttribute('name') || htmlEl.getAttribute('formControlName') || htmlEl.getAttribute('ng-reflect-name') || null;

        const elementData = {
          id: htmlEl.id || htmlEl.getAttribute('data-ai-id') || null,
          name: nameOrFormControl,
          tagName: htmlEl.tagName.toLowerCase(),
          text: textContent,
          type: htmlEl.getAttribute('type') || null,
          role: htmlEl.getAttribute('role') || null,
          classes: htmlEl.className || null,
          isDisabled: (htmlEl as any).disabled || htmlEl.classList.contains('mat-mdc-button-disabled') || false
        };

        // Filter out completely useless elements (no ID, no Name, no Text)
        if (elementData.id || elementData.name || elementData.text) {
            uiSchema.elements.push(elementData);
            
            // Build expected data model for the Agent
            if (elementData.name) {
                uiSchema.expectedDataModel[elementData.name] = elementData.type || 'string/boolean';
            }
        }
      }
    });

    return uiSchema;
  }

  /**
   * Save custom instructions for a screen
   */
  public saveKnowledge(instructions: string) {
    // Nếu có popup đang mở, lưu theo ID của Popup. Nếu không, lưu theo URL (bao gồm cả query params)
    const currentRoute = this.currentDialogId || this.router.url; 
    const uiSchema = this.captureScreenState();
    
    const knowledge: ScreenKnowledge = {
      screenRoute: currentRoute,
      uiSchema: uiSchema,
      customInstructions: instructions
    };

    // Save to LocalStorage (Mock DB)
    localStorage.setItem(`ai_docs_${currentRoute}`, JSON.stringify(knowledge));
    
    // To implement real API:
    // this.http.post(this.apiUrl, knowledge).subscribe();

    console.log('[AI Agent] Saved knowledge for:', currentRoute);
  }
}
