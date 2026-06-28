import { Component, OnInit, ViewChild, ElementRef, HostListener, AfterViewChecked, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';
import { TextFieldModule } from '@angular/cdk/text-field';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { AddSceneComponent } from '../add-scene.component';
import { DirectorModeComponent } from '../director-mode.component';
import { CharacterDialogComponent } from '../character-dialog.component';
import { AudioGenerationComponent } from '../audio-generation.component';
import { MagicPromptDialogComponent } from './magic-prompt-dialog.component';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { GenaiService } from 'app/genai.service';

interface NodeItem {
  id: string;
  type: 'image' | 'video' | 'tts' | 'composition';
  title: string;
  subtitle: string;
  x: number;
  y: number;
  inputs: string[];
  outputs: string[];
  data: any;
  baseX?: number;
  baseY?: number;
}

interface NodeConnection {
  id: string;
  fromNode: string;
  fromPort: string;
  toNode: string;
  toPort: string;
}

@Component({
  selector: 'app-node-editor',
  standalone: true,
  imports: [CommonModule, MatIconModule, RouterModule, TextFieldModule, FormsModule, MatButtonModule, MatDialogModule, MatMenuModule, MatAutocompleteModule],
  templateUrl: './node-editor.component.html',
  styleUrls: ['./node-editor.component.scss'],
  host: {
    'class': 'absolute inset-0 flex flex-col overflow-hidden'
  }
})
export class NodeEditorComponent implements OnInit, AfterViewChecked {
  @ViewChild('workspace', { static: true }) workspace!: ElementRef;
  @ViewChild('avatarFileInput') avatarFileInput!: ElementRef<HTMLInputElement>;
  targetAvatarChar: any = null;

  nodes: NodeItem[] = [];
  connections: NodeConnection[] = [];

  scale = 1;
  isPanning = false;
  selectedNode: NodeItem | null = null;
  startX = 0;
  startY = 0;
  startScrollLeft = 0;
  startScrollTop = 0;

  draggedNode: NodeItem | null = null;
  nodeStartX = 0;
  nodeStartY = 0;

  uuid: string | null = null;
  projectData: any = null;

  get activeCharacters(): any[] {
    if (this.editingType === 'character' && this.editingCharacter) {
      return [this.editingCharacter];
    }
    if (!this.selectedNode || !this.projectData?.characters?.length) return [];
    
    const prompt = this.selectedNode.data?.sceneData?.prompt || 
                   this.selectedNode.data?.sceneData?.visualPrompt || 
                   this.selectedNode.data?.sceneData?.imagePrompt || 
                   this.selectedNode.data?.text || '';
                   
    if (!prompt) return [];
    
    const lowerPrompt = prompt.toLowerCase();
    const matched = [];
    for (const char of this.projectData.characters) {
      if (lowerPrompt.includes(char.name.toLowerCase())) {
        matched.push(char);
      }
    }
    return matched;
  }

  expandedCharIndex: number | null = null;

  canvasWidth = 2000;
  canvasHeight = 1000;

  nodeHeights: { [id: string]: number } = {};

  availableModels: string[] = ['3.1 Pro'];
  filteredModels: string[] = [];
  selectedModel: string = '3.1 Pro';

  globalPromptText: string = '';
  editingType: 'scene' | 'character' | 'master' | 'none' = 'none';
  editingCharacter: any = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private multiAccountService: MultiAccountService,
    private dialog: MatDialog,
    private cdr: ChangeDetectorRef,
    private genaiService: GenaiService
  ) { }

  ngAfterViewChecked() {
    let changed = false;
    const newHeights: { [id: string]: number } = {};
    for (const node of this.nodes) {
       const el = document.getElementById(node.id);
       if (el) {
           const h = el.offsetHeight;
           if (this.nodeHeights[node.id] !== h) {
               newHeights[node.id] = h;
               changed = true;
           }
       }
    }
    if (changed) {
       setTimeout(() => {
           this.nodeHeights = { ...this.nodeHeights, ...newHeights };
           this.cdr.detectChanges();
       }, 0);
    }
  }

  ngOnInit(): void {
    this.uuid = this.route.snapshot.paramMap.get('uuid');
    if (!this.uuid) {
      this.router.navigate(['../'], { relativeTo: this.route });
      return;
    }

    const storageKey = `ai_type_video_ready_data_${this.uuid}`;
    this.projectData = this.multiAccountService.getItem(storageKey);

    if (this.projectData && this.projectData.scenes && this.projectData.scenes.length > 0) {
      this.buildGraphFromData(this.projectData);
    } else {
      this.buildFakeGraph();
    }

    this.loadModels();
  }

  async loadModels() {
    try {
      const models = await this.genaiService.getUModelverseModels();
      if (models && models.length > 0) {
        this.availableModels = models;
        this.filteredModels = [...this.availableModels];

        const savedModel = localStorage.getItem('ai_type_selected_model');
        if (savedModel && this.availableModels.includes(savedModel)) {
            this.selectedModel = savedModel;
        } else if (!this.availableModels.includes(this.selectedModel)) {
            this.selectedModel = this.availableModels[0];
        }
        this.cdr.detectChanges();
      }
    } catch (e) {
      console.error("Failed to load models", e);
    }
  }

    buildGraphFromData(data: any) {
    this.nodes = [];
    this.connections = [];
    let startX = 150;
    
    const compNode: NodeItem = {
      id: 'comp1', type: 'composition', title: 'Composition', subtitle: 'Final Output',
      x: data.scenes.length * 400 + 150, y: 300, inputs: [], outputs: [],
      data: { imageUrl: '' },
      baseX: data.scenes.length * 400 + 150, baseY: 300
    };

    data.scenes.forEach((scene: any, index: number) => {
      const sceneX = startX + index * 400;
      const yOffset = Math.floor(Math.random() * 100) - 50; // Random offset to make them not perfectly aligned

      
      const ttsNodeId = `tts_${index}`;
      const vidNodeId = `vid_${index}`;

      let hasTts = false;

      // Extract image
      let imageUrl = scene.imageUrl;
      let videoUrl = null;
      let duration = scene.forcedDuration || 5;
      let aspectRatio = data.ratio || data.aspectRatio || scene.ratio || scene.aspectRatio || '16:9';
      
      if (scene.videos && scene.videos.length > 0) {
        imageUrl = scene.videos[0].imageUrl || scene.videos[0].controlImageUrl || imageUrl;
        videoUrl = scene.videos[0].videoUrl || null;
      }

      let ttsDuration = 0;
      if (scene.subtitles && scene.subtitles.length > 0) {
        const sub = scene.subtitles[0];
        ttsDuration = sub.duration ? Math.round(sub.duration) : 5;
        this.nodes.push({
          id: ttsNodeId, type: 'tts', title: 'Text to Speech', subtitle: `${ttsDuration}s`,
          x: sceneX, y: 450 + yOffset, inputs: [], outputs: ['out'],
          data: { text: sub.text, duration: `00:${ttsDuration.toString().padStart(2, '0')}`, audioUrl: sub.audioUrl, sceneData: scene, sceneIndex: index },
          baseX: sceneX, baseY: 450 + yOffset
        });
        hasTts = true;
      }

      const visualUrl = videoUrl || imageUrl || null;

      const estimatedDuration = videoUrl ? duration : (ttsDuration > 0 ? ttsDuration : duration);
      const vidSubtitle = videoUrl ? `${estimatedDuration}s` : `~${estimatedDuration}s`;
      const vidNode: NodeItem = {
        id: vidNodeId, type: 'video', title: `Scene Visuals ${index + 1}`, subtitle: vidSubtitle,
        x: sceneX, y: 150 + yOffset, inputs: [], outputs: ['out'],
        data: { imageUrl: imageUrl, videoUrl: videoUrl, text: scene.script, isVideo: !!videoUrl, aspectRatio: aspectRatio, sceneData: scene, projectCharacters: data.characters },
        baseX: sceneX, baseY: 150 + yOffset
      };
      
      if (hasTts) {
        vidNode.inputs.push('tts_in');
        this.connections.push({ id: `c_tts_${index}`, fromNode: ttsNodeId, fromPort: 'out', toNode: vidNodeId, toPort: 'tts_in' });
      }
      
      if (index > 0) {
        const prevVidNodeId = `vid_${index - 1}`;
        vidNode.inputs.push('prev_scene_in');
        this.connections.push({ id: `c_seq_${index}`, fromNode: prevVidNodeId, fromPort: 'out', toNode: vidNodeId, toPort: 'prev_scene_in' });
      }

      this.nodes.push(vidNode);
    });

    if (data.scenes.length > 0) {
      const lastVidNodeId = `vid_${data.scenes.length - 1}`;
      compNode.inputs.push(lastVidNodeId);
      this.connections.push({ id: `c_comp`, fromNode: lastVidNodeId, fromPort: 'out', toNode: compNode.id, toPort: lastVidNodeId });
    }

    if (compNode.inputs.length > 0) {
      this.nodes.push(compNode);
    }
    
    this.calculateCanvasSize();
  }

  buildFakeGraph() {
    this.nodes = [
      {
        id: 'img1', type: 'image', title: 'Image', subtitle: 'Nano Banana Pro',
        x: 150, y: 150, inputs: [], outputs: ['out'],
        data: { imageUrl: 'assets/images/placeholder.jpg', text: 'A speed boat on the coast line during the summer, cinematic, moody and colorful' },
        baseX: 150, baseY: 150
      },
      {
        id: 'vid1', type: 'video', title: 'Video', subtitle: '5s',
        x: 550, y: 100, inputs: ['in1'], outputs: ['out'],
        data: { imageUrl: 'assets/images/placeholder.jpg', text: 'Camera moves from start frame to end frame', aspectRatio: '16:9', sceneData: { visualPrompt: 'Cinematic lighting, 8k resolution, highly detailed' }, projectCharacters: [{name: 'Nano Banana'}, {name: 'Captain'}] },
        baseX: 550, baseY: 100
      },
      {
        id: 'tts1', type: 'tts', title: 'Text to Speech', subtitle: '5s',
        x: 550, y: 400, inputs: [], outputs: ['out'],
        data: { text: 'Every sunset looks better from the water.', duration: '00:05' },
        baseX: 550, baseY: 400
      },
      {
        id: 'comp1', type: 'composition', title: 'Composition', subtitle: '',
        x: 950, y: 200, inputs: ['vid_in', 'audio_in'], outputs: [],
        data: { imageUrl: 'assets/images/placeholder.jpg' },
        baseX: 950, baseY: 200
      }
    ];

    this.connections = [
      { id: 'c1', fromNode: 'img1', fromPort: 'out', toNode: 'vid1', toPort: 'in1' },
      { id: 'c2', fromNode: 'vid1', fromPort: 'out', toNode: 'comp1', toPort: 'vid_in' },
      { id: 'c3', fromNode: 'tts1', fromPort: 'out', toNode: 'comp1', toPort: 'audio_in' }
    ];
    
    this.calculateCanvasSize();
  }

  calculateCanvasSize() {
    let maxX = 0;
    let maxY = 0;
    this.nodes.forEach(n => {
      if (n.x > maxX) maxX = n.x;
      if (n.y > maxY) maxY = n.y;
    });
    // Add 280px for node width + 150px right margin
    this.canvasWidth = Math.max(1200, maxX + 280 + 150);
    // Add 300px for node height + 150px bottom margin
    this.canvasHeight = Math.max(800, maxY + 300 + 150);
  }

  getConnectionPath(conn: NodeConnection): string {
    const from = this.nodes.find(n => n.id === conn.fromNode);
    const to = this.nodes.find(n => n.id === conn.toNode);
    if (!from || !to) return '';

    let fromHeight = this.nodeHeights[from.id] || (from.type === 'tts' ? 130 : 250);
    let fromWidth = 280;
    let toHeight = this.nodeHeights[to.id] || (to.type === 'tts' ? 130 : 250);

    const fromX = from.x + fromWidth; 
    const fromY = from.y + (fromHeight / 2); 
    
    const toX = to.x; 
    let toY = to.y + (toHeight / 2); 
    
    const numPorts = to.inputs.length;
    const portIndex = to.inputs.indexOf(conn.toPort);
    if (numPorts > 1 && portIndex >= 0) {
       const totalPortHeight = numPorts * 24 + (numPorts - 1) * 32;
       const startY = toY - (totalPortHeight / 2);
       toY = startY + (portIndex * 56) + 12;
    }

    const dx = Math.abs(toX - fromX) * 0.5;
    
    return `M ${fromX} ${fromY} C ${fromX + dx} ${fromY}, ${toX - dx} ${toY}, ${toX} ${toY}`;
  }

  onWorkspaceMouseDown(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (target.closest('.cursor-move') || target.closest('.fixed.bottom-12')) {
      return;
    }
    this.isPanning = true;
    this.selectedNode = null;
    this.editingType = 'none';
    this.editingCharacter = null;
    this.globalPromptText = '';
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.startScrollLeft = this.workspace.nativeElement.scrollLeft;
    this.startScrollTop = this.workspace.nativeElement.scrollTop;
  }

  saveProject() {
    if (!this.uuid || !this.projectData) return;
    const storageKey = `ai_type_video_ready_data_${this.uuid}`;
    this.multiAccountService.setItem(storageKey, this.projectData);
  }

  selectNode(node: NodeItem) {
    this.selectedNode = node;
    this.editingType = 'scene';
    this.editingCharacter = null;
    
    if (node.type === 'tts') {
        this.globalPromptText = node.data?.text || '';
        return;
    }
    
    let text = node.data?.sceneData?.prompt || node.data?.sceneData?.visualPrompt || node.data?.sceneData?.imagePrompt || node.data?.text || '';
    
    if (node.data?.sceneData) {
       let parts = [];
       if (this.projectData?.masterPrompt) parts.push(`Master Prompt: ${this.projectData.masterPrompt}`);
       if (node.data.sceneData.setting) parts.push(`Setting: ${node.data.sceneData.setting}`);
       if (node.data.sceneData.time) parts.push(`Time: ${node.data.sceneData.time}`);
       
       let charsDesc = '';
       if (this.projectData?.characters && this.projectData.characters.length > 0) {
           const fullSceneText = `${text} ${node.data.sceneData.script || ''} ${node.data.sceneData.setting || ''}`.toLowerCase();
           const sceneChars = this.projectData.characters.filter((c: any) => c.name && fullSceneText.includes(c.name.toLowerCase()));
           if (sceneChars.length > 0) {
               charsDesc = sceneChars.map((c: any) => {
                   let cParts = [];
                   if (c.name) cParts.push(`Name: ${c.name}`);
                   if (c.variant) cParts.push(`Variant: ${c.variant}`);
                   if (c.role) cParts.push(`Role: ${c.role}`);
                   if (c.appearance) cParts.push(`Appearance: ${c.appearance}`);
                   if (c.personality) cParts.push(`Personality: ${c.personality}`);
                   if (c.prompt) cParts.push(`Prompt: ${c.prompt}`);
                   return `- ${cParts.join(', ')}`;
               }).join('\n');
               parts.push(`Characters:\n${charsDesc}`);
           }
       }
       
       if (node.data.sceneData.script) parts.push(`Dialogue: ${node.data.sceneData.script}`);
       
       parts.push(`Action/Visuals: ${text}`);
       text = parts.join('\n\n');
    }
    this.globalPromptText = text;

    if (node.id === 'master') {
      this.selectedNode = null;
      this.editingType = 'master';
      this.globalPromptText = this.projectData?.masterPrompt || '';
    }
  }

  updatePrompt(text: string) {
    this.globalPromptText = text;
    
    if (this.editingType === 'master') {
        if (this.projectData) {
            this.projectData.masterPrompt = text;
            this.saveProject();
        }
    } else if (this.editingType === 'character' && this.editingCharacter) {
        // We do not save character prompt changes back directly to the character here unless requested.
        // Actually, let's just let it be in globalPromptText for generation.
    } else if (this.editingType === 'scene' && this.selectedNode) {
      if (this.selectedNode.type === 'tts') {
          this.selectedNode.data = { ...this.selectedNode.data, text: text };
          if (this.selectedNode.data.sceneData && this.selectedNode.data.sceneData.subtitles && this.selectedNode.data.sceneData.subtitles.length > 0) {
              this.selectedNode.data.sceneData.subtitles[0].text = text;
              this.saveProject();
          }
          return;
      }

      // If the text contains 'Action/Visuals:', extract only that part to save to the raw prompt
      let savedText = text;
      const visualMarker = 'Action/Visuals: ';
      const index = text.lastIndexOf(visualMarker);
      if (index !== -1) {
          savedText = text.substring(index + visualMarker.length).trim();
      } else {
          // Fallback if user accidentally deleted the marker
          // Try to extract text after the last known section
          const dialogMarker = 'Dialogue: ';
          const charMarker = 'Characters:\n';
          const masterMarker = 'Master Prompt: ';
          
          let lastKnownIndex = Math.max(
              text.lastIndexOf(dialogMarker) > -1 ? text.lastIndexOf(dialogMarker) + dialogMarker.length : -1,
              text.lastIndexOf(charMarker) > -1 ? text.lastIndexOf(charMarker) + text.indexOf('\n\n', text.lastIndexOf(charMarker)) + 2 : -1,
              text.lastIndexOf(masterMarker) > -1 ? text.lastIndexOf(masterMarker) + text.indexOf('\n\n', text.lastIndexOf(masterMarker)) + 2 : -1
          );
          
          if (lastKnownIndex > -1) {
              savedText = text.substring(lastKnownIndex).trim();
          }
      }

      if (this.selectedNode.data?.sceneData) {
        if (this.selectedNode.data.sceneData.prompt !== undefined) {
          this.selectedNode.data.sceneData.prompt = savedText;
        } else if (this.selectedNode.data.sceneData.visualPrompt !== undefined) {
          this.selectedNode.data.sceneData.visualPrompt = savedText;
        } else if (this.selectedNode.data.sceneData.imagePrompt !== undefined) {
          this.selectedNode.data.sceneData.imagePrompt = savedText;
        } else {
          this.selectedNode.data.sceneData.prompt = savedText;
        }
      } else {
        if (!this.selectedNode.data) this.selectedNode.data = {};
        this.selectedNode.data.text = savedText;
      }
      this.saveProject();
    }
  }

  addSceneNode() {
    const dialogRef = this.dialog.open(AddSceneComponent, {
      width: '650px',
      maxWidth: '95vw',
      maxHeight: '95vh',
      disableClose: true,
      data: {
        selectedClip: null,
        prompt: '',
        characters: this.projectData?.characters || [],
        masterPrompt: this.projectData?.masterPrompt || '',
        availableClips: []
      },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result && result.selectedClip && result.prompt) {
        const clip = result.selectedClip;
        const newId = `scene_${Date.now()}`;
        
        const newNode: NodeItem = {
          id: newId,
          type: 'video',
          title: 'Scene Mới',
          subtitle: 'Video',
          x: 150,
          y: 150,
          inputs: ['in1'],
          outputs: ['out'],
          data: {
            text: clip.description,
            sceneData: { 
              prompt: result.prompt,
              script: clip.description
            },
            projectCharacters: this.projectData?.characters || []
          },
          baseX: 150,
          baseY: 150
        };

        if (this.nodes.length > 0) {
          const lastNode = this.nodes[this.nodes.length - 1];
          newNode.x = lastNode.x + 350;
          newNode.y = lastNode.y;
          newNode.baseX = newNode.x;
          newNode.baseY = newNode.y;
        }

        this.nodes.push(newNode);
        this.selectedNode = newNode;
        this.calculateCanvasSize();
      }
    });
  }

  toggleCharacter(index: number) {
    if (this.expandedCharIndex === index) {
      this.expandedCharIndex = null;
    } else {
      this.expandedCharIndex = index;
    }
  }

  filterModels(query: string) {
    if (!query) {
      this.filteredModels = [...this.availableModels];
      return;
    }
    const lowerQuery = query.toLowerCase();
    this.filteredModels = this.availableModels.filter(m => m.toLowerCase().includes(lowerQuery));
  }

  onModelSelected(model: string) {
    this.selectedModel = model;
    localStorage.setItem('ai_type_selected_model', model);
  }

  attachedFiles: { file: File, base64: string, mimeType: string, url: string }[] = [];

  onFileSelected(event: any) {
    const files = event.target.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const reader = new FileReader();
        reader.onload = () => {
          const base64String = (reader.result as string).split(',')[1];
          this.attachedFiles.push({
            file: file,
            base64: base64String,
            mimeType: file.type,
            url: reader.result as string
          });
        };
        reader.readAsDataURL(file);
      }
    }
  }

  removeAttachedFile(index: number) {
    this.attachedFiles.splice(index, 1);
  }

  openAudioGeneration(node?: NodeItem) {
    const isSpecificNode = !!node;
    const targetNode = node || this.selectedNode;
    
    // If we are generating for a specific node, we need to clear the audioUrl of its subtitles so it gets re-generated.
    if (isSpecificNode && targetNode?.type === 'tts' && targetNode.data?.sceneData) {
        const sceneData = targetNode.data.sceneData;
        if (sceneData.subtitles) {
            sceneData.subtitles.forEach((sub: any) => sub.audioUrl = null);
        }
    }

    const dialogRef = this.dialog.open(AudioGenerationComponent, {
        width: '400px',
        maxWidth: '100vw',
        data: { 
            ...this.projectData,
            selectedModel: this.selectedModel, 
            scenePrompt: targetNode?.data?.text || '',
            targetSceneIndex: isSpecificNode ? targetNode?.data?.sceneIndex : null
        }
    });

    dialogRef.afterClosed().subscribe(result => {
        if (result) {
            this.projectData = result;
            this.buildGraphFromData(this.projectData);
            this.saveProject();
        }
    });
  }

  openMagicPromptDialog() {
    const dialogRef = this.dialog.open(MagicPromptDialogComponent, {
        width: '600px',
        maxWidth: '95vw',
        maxHeight: '95vh',
        panelClass: 'dark-theme-dialog',
        data: {
            currentPrompt: this.globalPromptText,
            type: this.editingType,
            selectedModel: this.selectedModel
        }
    });

    dialogRef.afterClosed().subscribe(result => {
        if (result) {
            this.updatePrompt(result);
        }
    });
  }

  openAddCharacter() {
    this.selectedNode = null;
    const dialogRef = this.dialog.open(CharacterDialogComponent, {
      width: '800px',
      maxWidth: '95vw',
      maxHeight: '95vh',
      disableClose: true,
      data: {
        char: null,
        index: -1,
        projectUuid: this.uuid
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        if (!this.projectData) this.projectData = {};
        if (!this.projectData.characters) this.projectData.characters = [];
        this.projectData.characters.push(result);
        this.saveProject();
      }
    });
  }



  insertCharacterToPrompt(char: any) {
    this.selectedNode = null;
    this.editingType = 'character';
    this.editingCharacter = char;

    let parts = [];
    if (char.name) parts.push(`Name: ${char.name}`);
    if (char.variant) parts.push(`Variant: ${char.variant}`);
    if (char.role) parts.push(`Role: ${char.role}`);
    if (char.appearance) parts.push(`Appearance: ${char.appearance}`);
    if (char.personality) parts.push(`Personality: ${char.personality}`);
    if (char.prompt) parts.push(`Prompt: ${char.prompt}`);
    let charDesc = parts.join('\n');
    if (!charDesc) charDesc = `Portrait of ${char.name}`;
    
    this.globalPromptText = charDesc;
    this.saveProject();
  }

  onAvatarDoubleClick(event: MouseEvent, char: any) {
    event.stopPropagation();
    event.preventDefault();
    if (char) {
      this.targetAvatarChar = char;
    } else if (this.editingType === 'character' && this.editingCharacter) {
      this.targetAvatarChar = this.editingCharacter;
    } else {
      return;
    }
    if (this.avatarFileInput?.nativeElement) {
      this.avatarFileInput.nativeElement.click();
    }
  }

  onAvatarFileSelected(event: any) {
    const file = event.target.files[0];
    if (file && this.targetAvatarChar) {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.targetAvatarChar.avatarUrl = e.target.result;
        this.saveProject();
        this.targetAvatarChar = null;
        if (this.avatarFileInput?.nativeElement) {
          this.avatarFileInput.nativeElement.value = '';
        }
      };
      reader.readAsDataURL(file);
    }
  }

  removeCharacterFromPrompt(char: any, event: Event) {
    event.stopPropagation();
    if (!this.selectedNode) return;

    const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const charNameEscaped = escapeRegExp(char.name);
    
    const blockRegex = new RegExp(`\\[Character '${charNameEscaped}'.*?\\]\\n*`, 'g');
    const nameRegex = new RegExp(`\\b${charNameEscaped}\\b\\s*`, 'gi');

    const sd = this.selectedNode.data?.sceneData;

    if (sd) {
      if (sd.prompt !== undefined) {
        sd.prompt = sd.prompt.replace(blockRegex, '').replace(nameRegex, '').trim();
      }
      if (sd.imagePrompt !== undefined) {
        sd.imagePrompt = sd.imagePrompt.replace(blockRegex, '').replace(nameRegex, '').trim();
      }
    } else {
      if (this.selectedNode.data?.text) {
         this.selectedNode.data.text = this.selectedNode.data.text.replace(blockRegex, '').replace(nameRegex, '').trim();
      }
    }
    
    this.saveProject();
  }

  @HostListener('window:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    if (this.isPanning) {
      const dx = event.clientX - this.startX;
      const dy = event.clientY - this.startY;
      this.workspace.nativeElement.scrollLeft = this.startScrollLeft - dx;
      this.workspace.nativeElement.scrollTop = this.startScrollTop - dy;
    } else if (this.draggedNode) {
      const dx = (event.clientX - this.startX) / this.scale;
      const dy = (event.clientY - this.startY) / this.scale;
      let newX = this.nodeStartX + dx;
      let newY = this.nodeStartY + dy;
      
      const maxRadius = 50; // Limited drag radius
      if (this.draggedNode.baseX !== undefined && this.draggedNode.baseY !== undefined) {
         const dist = Math.sqrt(Math.pow(newX - this.draggedNode.baseX, 2) + Math.pow(newY - this.draggedNode.baseY, 2));
         if (dist > maxRadius) {
             const angle = Math.atan2(newY - this.draggedNode.baseY, newX - this.draggedNode.baseX);
             newX = this.draggedNode.baseX + Math.cos(angle) * maxRadius;
             newY = this.draggedNode.baseY + Math.sin(angle) * maxRadius;
         }
      }
      
      this.draggedNode.x = newX;
      this.draggedNode.y = newY;
    }
  }

  @HostListener('window:mouseup')
  onMouseUp() {
    this.isPanning = false;
    this.draggedNode = null;
  }

  openDirectorMode(event?: Event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    
    let promptText = '';
    let target = '';
    let aspectRatio = '16:9';

    if (this.selectedNode) {
        promptText = this.selectedNode.data?.sceneData?.prompt || this.selectedNode.data?.sceneData?.visualPrompt || this.selectedNode.data?.sceneData?.imagePrompt || this.selectedNode.data?.text || '';
        target = 'Apply to Scene';
        aspectRatio = this.selectedNode.data?.aspectRatio || '16:9';
    } else if (this.projectData) {
        promptText = this.projectData.masterPrompt || '';
        target = 'Apply to Master Prompt';
        aspectRatio = this.projectData.aspectRatio || '16:9';
    } else {
        return; // nothing to edit
    }

    const dialogRef = this.dialog.open(DirectorModeComponent, {
      width: '650px',
      maxWidth: '95vw',
      maxHeight: '95vh',
      panelClass: 'dark-theme-dialog',
      data: {
        prompt: promptText,
        targetName: target,
        globalContext: this.projectData?.globalContext || null,
        aspectRatio: aspectRatio
      }
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result && result.prompt !== undefined) {
        let currentPrompt = promptText;
        currentPrompt = currentPrompt.replace(/\[(?:Director|Cinematography):.*?\]/g, '').replace(/\n{3,}/g, '\n\n').trim();

        if (result.prompt) {
          if (currentPrompt) {
            currentPrompt = '[Cinematography: ' + result.prompt + ']\n\n' + currentPrompt;
          } else {
            currentPrompt = '[Cinematography: ' + result.prompt + ']';
          }
        }
        
        if (this.selectedNode) {
            this.updatePrompt(currentPrompt);
        } else if (this.projectData) {
            this.projectData.masterPrompt = currentPrompt;
            this.saveProject();
        }
      }
    });
  }

  onWheel(event: WheelEvent) {
    // Only zoom if ctrl is pressed, otherwise native scroll works!
    if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const zoomIntensity = 0.03;
        const delta = event.deltaY > 0 ? -zoomIntensity : zoomIntensity;
        let newScale = this.scale + delta;
        // Restrict zoom out to 0.5x (50%) and zoom in to 1.5x (150%)
        newScale = Math.min(Math.max(0.5, newScale), 1.5); 
        this.scale = newScale;
    }
  }

  onNodeMouseDown(event: MouseEvent, node: NodeItem) {
    event.stopPropagation();
    this.draggedNode = node;
    const isNewSelection = this.selectedNode !== node || this.editingType !== 'scene';
    if (isNewSelection) {
      this.expandedCharIndex = null;
      this.selectNode(node);
    }
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.nodeStartX = node.x;
    this.nodeStartY = node.y;
    
    this.nodes = this.nodes.filter(n => n.id !== node.id);
    this.nodes.push(node);
  }
}
