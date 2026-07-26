import { TestBed } from '@angular/core/testing';

import { AiAgentKnowledgeService } from './ai-agent-knowledge.service';

describe('AiAgentKnowledgeService', () => {
  let service: AiAgentKnowledgeService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AiAgentKnowledgeService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
