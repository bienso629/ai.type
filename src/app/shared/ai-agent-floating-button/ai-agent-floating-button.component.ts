import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AiAgentKnowledgeService } from '../../core/services/ai-agent-knowledge.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-ai-agent-floating-button',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatTooltipModule],
  templateUrl: './ai-agent-floating-button.component.html',
  styleUrl: './ai-agent-floating-button.component.scss'
})
export class AiAgentFloatingButtonComponent implements OnInit, OnDestroy {
  isPluginInstalled = false;
  isAnalyzing = false;
  isAnimating = false;
  isCoolingDown = false;
  private sub: Subscription | null = null;

  constructor(
    public aiKnowledgeService: AiAgentKnowledgeService,
    private cd: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    this.sub = this.aiKnowledgeService.isAnalyzing.subscribe(val => {
      this.isAnalyzing = val;
      if (val) {
        this.isAnimating = true;
        this.isCoolingDown = false;
      } else if (!this.isAnimating && !this.isCoolingDown) {
        this.isAnimating = false;
      }
      this.cd.detectChanges();
    });

    if ((window as any).electronAPI && (window as any).electronAPI.getPluginsStatus) {
      try {
        const list = await (window as any).electronAPI.getPluginsStatus();
        const aiAgent = list?.find((p: any) => p.id === 'ai_agent');
        if (aiAgent && aiAgent.installed === true) {
          this.isPluginInstalled = true;
          this.cd.detectChanges();
        }
      } catch (e) {
        console.error('[AI Agent]', e);
      }
    }
  }

  onAnimationIteration(event: any) {
    if (event.animationName.includes('magical-blink') && !event.animationName.includes('cooldown') && !this.isAnalyzing && this.isAnimating) {
      this.isAnimating = false;
      this.isCoolingDown = true;
      this.cd.detectChanges();
    }
  }

  onAnimationEnd(event: any) {
    if (event.animationName.includes('magical-blink-cooldown')) {
      this.isCoolingDown = false;
      this.cd.detectChanges();
    }
  }

  ngOnDestroy() {
    if (this.sub) {
      this.sub.unsubscribe();
    }
  }
}
