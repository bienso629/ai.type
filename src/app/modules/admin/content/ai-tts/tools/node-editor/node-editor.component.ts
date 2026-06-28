import { Component, OnInit, ViewChild, ElementRef, HostListener, AfterViewChecked, ChangeDetectorRef, NgZone, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';
import { TextFieldModule } from '@angular/cdk/text-field';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { AddSceneComponent } from '../add-scene.component';
import { DirectorModeComponent } from '../director-mode.component';
import { CharacterDialogComponent } from '../character-dialog.component';
import { AudioGenerationComponent } from '../audio-generation.component';
import { MagicPromptDialogComponent } from './magic-prompt-dialog.component';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { GenaiService } from 'app/genai.service';
import { ToastrService } from 'ngx-toastr';
import { FuseConfirmationService } from '@fuse/services/confirmation';

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
  path?: string;
  color?: string;
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
export class NodeEditorComponent implements OnInit, AfterViewChecked, OnDestroy {
  @ViewChild('workspace', { static: true }) workspace!: ElementRef;
  @ViewChild('contextMenuTrigger') contextMenuTrigger!: MatMenuTrigger;
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

  draggedConnection: {
    fromNode: string;
    fromPort: string;
    toX: number;
    toY: number;
    path?: string;
    color?: string;
  } | null = null;
  hoveredNode: NodeItem | null = null;
  hoveredInput: { node: NodeItem, port: string } | null = null;

  private mouseMoveListener: any;
  private mouseUpListener: any;

  contextMenuVisible = false;
  contextMenuPosition = { x: 0, y: 0 };
  contextMenuCanvasPosition = { x: 0, y: 0 };

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
    private genaiService: GenaiService,
    private ngZone: NgZone,
    private _fuseConfirmationService: FuseConfirmationService,
    private sanitizer: DomSanitizer,
    private toastr: ToastrService
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
           this.updateConnectionPaths();
           this.cdr.detectChanges();
       }, 0);
    }
  }

  ngOnInit(): void {
    this.mouseMoveListener = this.onMouseMoveOutside.bind(this);
    this.mouseUpListener = this.onMouseUpOutside.bind(this);
    this.ngZone.runOutsideAngular(() => {
      window.addEventListener('mousemove', this.mouseMoveListener, { passive: true });
      window.addEventListener('mouseup', this.mouseUpListener);
    });

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

  ngOnDestroy(): void {
    if (this.mouseMoveListener) window.removeEventListener('mousemove', this.mouseMoveListener);
    if (this.mouseUpListener) window.removeEventListener('mouseup', this.mouseUpListener);
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
    if (!data) return;

    if (data.editorLayout && data.editorLayout.nodes && data.editorLayout.connections) {
       this.nodes = data.editorLayout.nodes;
       this.connections = data.editorLayout.connections;
       
       // Sync backend data back into nodes
       if (data.scenes) {
          this.nodes.forEach(node => {
             if (node.data && node.data.sceneIndex !== undefined) {
                const scene = data.scenes[node.data.sceneIndex];
                if (scene) {
                   if (node.type === 'video') {
                       let imageUrl = scene.imageUrl;
                       let videoUrl = null;
                       if (scene.videos && scene.videos.length > 0) {
                          imageUrl = scene.videos[0].imageUrl || scene.videos[0].controlImageUrl || imageUrl;
                          videoUrl = scene.videos[0].videoUrl || null;
                       }
                       node.data.imageUrl = imageUrl || node.data.imageUrl;
                       node.data.videoUrl = videoUrl || node.data.videoUrl;
                       node.data.isVideo = !!node.data.videoUrl;
                       node.data.text = scene.script;
                       node.data.sceneData = scene;
                   } else if (node.type === 'tts') {
                        if (scene.subtitles && scene.subtitles.length > 0) {
                            node.data.audioUrl = scene.subtitles[0].audioUrl || node.data.audioUrl;
                            node.data.text = scene.subtitles[0].text;
                            node.title = scene.subtitles[0].text || 'Text to Speech';
                            node.data.sceneData = scene;
                        }
                       node.inputs = []; // Ensure TTS nodes don't have input ports
                   }
                }
             }
          });
       }
       
       const compNode = this.nodes.find(n => n.id === 'comp_final');
       if (compNode) {
          compNode.data.videoUrl = data.finalVideoUrl || null;
       }
       
       this.calculateCanvasSize();
       return;
    }

    this.nodes = [];
    this.connections = [];
    let startX = 150;
    
    const compNode: NodeItem = {
      id: 'comp1', type: 'composition', title: 'Composition', subtitle: 'Final Output',
      x: data.scenes.length * 450 + 150, y: 300, inputs: [], outputs: [],
      data: { imageUrl: '' },
      baseX: data.scenes.length * 450 + 150, baseY: 300
    };

    data.scenes.forEach((scene: any, index: number) => {
      const sceneX = startX + index * 450;
      const yOffset = Math.floor(Math.random() * 100) - 50; 

      
      const ttsNodeId = `tts_${index}`;
      const vidNodeId = `vid_${index}`;

      let hasTts = false;

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
          id: ttsNodeId, type: 'tts', title: sub.text || 'Text to Speech', subtitle: `${ttsDuration}s`,
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
        data: { imageUrl: imageUrl, videoUrl: videoUrl, text: scene.script, isVideo: !!videoUrl, aspectRatio: aspectRatio, sceneData: scene, projectCharacters: data.characters, sceneIndex: index },
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
    
    this.nodes.forEach(n => {
        if (n.inputs && n.inputs.length > 1) {
             n.inputs.sort((a, b) => {
                 const aIsTts = a.startsWith('tts_in');
                 const bIsTts = b.startsWith('tts_in');
                 if (aIsTts && !bIsTts) return 1;
                 if (!aIsTts && bIsTts) return -1;
                 return a.localeCompare(b);
             });
        }
    });
    
    this.calculateCanvasSize();
    this.saveEditorState();
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
    this.saveEditorState();
  }

  calculateCanvasSize() {
    let maxX = 0;
    let maxY = 0;
    this.nodes.forEach(n => {
      if (n.x > maxX) maxX = n.x;
      if (n.y > maxY) maxY = n.y;
    });
    this.canvasWidth = Math.max(1200, maxX + 280 + 150);
    this.canvasHeight = Math.max(800, maxY + 300 + 150);
    this.updateConnectionPaths();
  }

  cleanupUnusedPorts() {
      this.nodes.forEach(node => {
          if (node.type !== 'video' && node.type !== 'composition') return;
          node.inputs = node.inputs.filter(port => {
              if (!port.startsWith('tts_in')) return true;
              return this.connections.some(c => c.toNode === node.id && c.toPort === port);
          });
      });
  }

  updateConnectionPaths() {
    this.cleanupUnusedPorts();
    this.connections.forEach(conn => {
      conn.path = this.getConnectionPath(conn);
      const fromNode = this.nodes.find(n => n.id === conn.fromNode);
      if (fromNode && fromNode.type === 'tts') {
        conn.color = '#10b981'; // emerald-500
      } else {
        conn.color = '#a5b4fc'; // indigo-300
      }
    });
  }

  getConnectionPath(conn: NodeConnection): string {
    const from = this.nodes.find(n => n.id === conn.fromNode);
    const to = this.nodes.find(n => n.id === conn.toNode);
    if (!from || !to) return '';

    let fromHeight = this.nodeHeights[from.id] || (from.type === 'tts' ? 130 : 250);
    let fromWidth = from.type === 'video' || from.type === 'composition' ? 360 : 280;
    let toHeight = this.nodeHeights[to.id] || (to.type === 'tts' ? 130 : 250);

    const fromX = from.x + fromWidth; 
    const fromY = from.y + (fromHeight / 2); 
    
    const toX = to.x; 
    let toY = to.y + (toHeight / 2); 
    
    const numPorts = to.inputs.length;
    const portIndex = to.inputs.indexOf(conn.toPort);
    if (numPorts > 1 && portIndex >= 0) {
       const totalPortHeight = numPorts * 24 + (numPorts - 1) * 8;
       const startY = toY - (totalPortHeight / 2);
       toY = startY + (portIndex * 32) + 12;
    }

    const dx = Math.abs(toX - fromX) * 0.5;
    
    return `M ${fromX} ${fromY} C ${fromX + dx} ${fromY}, ${toX - dx} ${toY}, ${toX} ${toY}`;
  }

  getDraggedConnectionPath(): string {
    if (!this.draggedConnection) return '';
    const from = this.nodes.find(n => n.id === this.draggedConnection!.fromNode);
    if (!from) return '';
    
    let fromHeight = this.nodeHeights[from.id] || (from.type === 'tts' ? 130 : 250);
    let fromWidth = from.type === 'video' || from.type === 'composition' ? 360 : 280;
    
    const fromX = from.x + fromWidth; 
    const fromY = from.y + (fromHeight / 2); 
    
    const toX = this.draggedConnection.toX;
    const toY = this.draggedConnection.toY;
    
    const dx = Math.abs(toX - fromX) * 0.5;
    
    return `M ${fromX} ${fromY} C ${fromX + dx} ${fromY}, ${toX - dx} ${toY}, ${toX} ${toY}`;
  }

  onInputPortMouseDown(event: MouseEvent, node: NodeItem, port: string) {
    event.stopPropagation();
    const existingConnIndex = this.connections.findIndex(c => c.toNode === node.id && c.toPort === port);
    if (existingConnIndex >= 0) {
      const conn = this.connections[existingConnIndex];
      this.connections.splice(existingConnIndex, 1);
      
      const rect = this.workspace.nativeElement.getBoundingClientRect();
      const mouseX = (event.clientX - rect.left + this.workspace.nativeElement.scrollLeft) / this.scale;
      const mouseY = (event.clientY - rect.top + this.workspace.nativeElement.scrollTop) / this.scale;

      const fromNodeObj = this.nodes.find(n => n.id === conn.fromNode);
      const isAudio = fromNodeObj && fromNodeObj.type === 'tts';

      this.draggedConnection = {
        fromNode: conn.fromNode,
        fromPort: conn.fromPort,
        toX: mouseX,
        toY: mouseY,
        color: isAudio ? '#10b981' : '#818cf8'
      };
    }
  }

  onOutputPortMouseDown(event: MouseEvent, node: NodeItem, port: string) {
    event.stopPropagation();
    const rect = this.workspace.nativeElement.getBoundingClientRect();
    const mouseX = (event.clientX - rect.left + this.workspace.nativeElement.scrollLeft) / this.scale;
    const mouseY = (event.clientY - rect.top + this.workspace.nativeElement.scrollTop) / this.scale;
    
    const isAudio = node.type === 'tts';
    
    this.draggedConnection = {
      fromNode: node.id,
      fromPort: port,
      toX: mouseX,
      toY: mouseY,
      color: isAudio ? '#10b981' : '#818cf8'
    };
  }

  createConnection(fromNode: string, fromPort: string, toNode: string, toPort: string) {
     if (fromNode === toNode) return;
     
     const fromObj = this.nodes.find(n => n.id === fromNode);
     const toObj = this.nodes.find(n => n.id === toNode);
     
     if (fromObj && toObj) {
         if (fromObj.type === 'tts') {
             if (!toPort.startsWith('tts_in')) {
                 const usedPorts = this.connections.filter(c => c.toNode === toNode).map(c => c.toPort);
                 let freePort = toObj.inputs.find(p => p.startsWith('tts_in') && !usedPorts.includes(p));
                 if (!freePort) {
                     let i = 1;
                     while(toObj.inputs.includes(`tts_in_${i}`)) i++;
                     freePort = `tts_in_${i}`;
                     toObj.inputs.push(freePort);
                 }
                 toPort = freePort;
             } else {
                 const isOccupied = this.connections.some(c => c.toNode === toNode && c.toPort === toPort);
                 if (isOccupied) {
                     let i = 1;
                     while(toObj.inputs.includes(`tts_in_${i}`)) i++;
                     const newPort = `tts_in_${i}`;
                     toObj.inputs.push(newPort);
                     toPort = newPort;
                 }
             }
         } else if (fromObj.type === 'video' || fromObj.type === 'image') {
             if (toObj.type !== 'composition' && toPort !== 'prev_scene_in') return;
         }
     }

     this.connections = this.connections.filter(c => !(c.toNode === toNode && c.toPort === toPort));
     
     if (toObj && !toObj.inputs.includes(toPort)) {
         toObj.inputs.push(toPort);
     }
     
     this.connections.push({
       id: `c_${Date.now()}`,
       fromNode, fromPort, toNode, toPort
     });

     if (toObj) {
         toObj.inputs.sort((a, b) => {
             const aIsTts = a.startsWith('tts_in');
             const bIsTts = b.startsWith('tts_in');
             if (aIsTts && !bIsTts) return 1;
             if (!aIsTts && bIsTts) return -1;
             return a.localeCompare(b);
         });
     }

     this.updateConnectionPaths();
     this.saveEditorState();
  }

  onWorkspaceMouseDown(event: MouseEvent) {
    if (this.contextMenuVisible) {
      this.closeContextMenu();
    }
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

  onWorkspaceContextMenu(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (target.closest('.cursor-move') || target.closest('.fixed.bottom-12')) {
      return;
    }

    event.preventDefault();
    this.contextMenuPosition = { x: event.clientX, y: event.clientY };

    const rect = this.workspace.nativeElement.getBoundingClientRect();
    const x = (event.clientX - rect.left + this.workspace.nativeElement.scrollLeft) / this.scale;
    const y = (event.clientY - rect.top + this.workspace.nativeElement.scrollTop) / this.scale;
    this.contextMenuCanvasPosition = { x, y };
    
    if (this.contextMenuTrigger) {
      this.contextMenuTrigger.openMenu();
    }
  }

  autoArrangeAllNodes() {
      const isPrimary = (type: string) => type === 'video' || type === 'image';
      const isComp = (type: string) => type === 'composition' || type === 'comp';
      
      const primaryNodes = this.nodes.filter(n => isPrimary(n.type));
      const compNodes = this.nodes.filter(n => isComp(n.type));
      const secondaryNodes = this.nodes.filter(n => !isPrimary(n.type) && !isComp(n.type));
      
      const colMap = new Map<string, number>();
      primaryNodes.forEach(n => colMap.set(n.id, 0));
      
      let changed = true;
      let iterations = 0;
      while (changed && iterations < 100) {
          changed = false;
          iterations++;
          this.connections.forEach(c => {
             const fromNode = this.nodes.find(n => n.id === c.fromNode);
             const toNode = this.nodes.find(n => n.id === c.toNode);
             
             if (fromNode && toNode && isPrimary(fromNode.type) && isPrimary(toNode.type)) {
                 const fromCol = colMap.get(fromNode.id) || 0;
                 const toCol = colMap.get(toNode.id) || 0;
                 if (fromCol + 1 > toCol) {
                     colMap.set(toNode.id, fromCol + 1);
                     changed = true;
                 }
             }
          });
      }
      
      primaryNodes.sort((a, b) => {
          const colA = colMap.get(a.id) || 0;
          const colB = colMap.get(b.id) || 0;
          if (colA !== colB) return colA - colB;
          return a.x - b.x;
      });
      
      const secondaryToPrimary = new Map<string, string>();
      this.connections.forEach(c => {
          const fromNode = this.nodes.find(n => n.id === c.fromNode);
          const toNode = this.nodes.find(n => n.id === c.toNode);
          if (fromNode && toNode && !isPrimary(fromNode.type) && isPrimary(toNode.type)) {
              secondaryToPrimary.set(fromNode.id, toNode.id);
          }
      });
      
      const blockPositions = new Map<string, {x: number, currentY: number}>();
      let maxPrimaryX = 150;
      
      primaryNodes.forEach((pNode, index) => {
          pNode.x = 150 + index * 450;
          pNode.baseX = pNode.x;
          maxPrimaryX = Math.max(maxPrimaryX, pNode.x);
          
          pNode.y = 150 + (Math.random() * 60 - 30);
          if (pNode.y < 50) pNode.y = 50;
          pNode.baseY = pNode.y;
          
          blockPositions.set(pNode.id, {
              x: pNode.x,
              currentY: pNode.y + 320 
          });
      });
      
      compNodes.forEach((cNode, index) => {
          cNode.x = maxPrimaryX + 450 + index * 450;
          cNode.baseX = cNode.x;
          cNode.y = 300; 
          cNode.baseY = cNode.y;
      });
      
      let unconnectedX = 150 + primaryNodes.length * 450;
      
      secondaryNodes.forEach(sNode => {
          const targetId = secondaryToPrimary.get(sNode.id);
          if (targetId && blockPositions.has(targetId)) {
              const pos = blockPositions.get(targetId)!;
              sNode.x = pos.x;
              sNode.baseX = sNode.x;
              sNode.y = pos.currentY;
              sNode.baseY = sNode.y;
              pos.currentY += 180;
          } else {
              sNode.x = unconnectedX;
              sNode.baseX = sNode.x;
              sNode.y = 470; 
              sNode.baseY = sNode.y;
              unconnectedX += 450;
          }
      });
      
      this.updateConnectionPaths();
      this.calculateCanvasSize();
      this.saveEditorState();
      this.cdr.detectChanges();
  }
  
  closeContextMenu() {
    this.contextMenuVisible = false;
  }

  deleteNode(nodeId: string) {
      const dialogRef = this._fuseConfirmationService.open({
          title: 'Thông báo!',
          message: 'Bạn có chắc chắn muốn xóa khối này không? Toàn bộ dây kết nối liên quan cũng sẽ bị xóa.',
          icon: {
              show: true,
              name: 'feather:alert-triangle',
              color: 'error',
          },
          actions: {
              confirm: {
                  show: true,
                  label: 'Đồng ý',
                  color: 'warn',
              },
              cancel: {
                  show: true,
                  label: 'Hủy',
              },
          },
          dismissible: true,
      });

      dialogRef.afterClosed().subscribe((result) => {
          if (result === 'confirmed') {
              // Remove all connections associated with this node
              this.connections = this.connections.filter(c => c.fromNode !== nodeId && c.toNode !== nodeId);
              // Remove the node itself
              this.nodes = this.nodes.filter(n => n.id !== nodeId);
              
              this.updateConnectionPaths();
              this.calculateCanvasSize();
              this.saveEditorState();
              this.cdr.detectChanges();
          }
      });
  }

  addNewSceneNode() {
    const id = `scene_${Date.now()}`;
    const x = this.contextMenuCanvasPosition.x ? Math.round(this.contextMenuCanvasPosition.x) : 150;
    const y = this.contextMenuCanvasPosition.y ? Math.round(this.contextMenuCanvasPosition.y) : 150;
    
    const newScene: NodeItem = {
      id,
      type: 'video',
      title: `Scene Visuals ${this.nodes.filter(n => n.type === 'video' || n.type === 'composition').length + 1}`,
      subtitle: '~5s',
      x, y,
      baseX: x, baseY: y,
      inputs: ['in1'],
      outputs: ['out'],
      data: { 
        imageUrl: '',
        videoUrl: '',
        text: '', 
        isVideo: false, 
        aspectRatio: '16:9', 
        sceneData: { visualPrompt: '' },
        projectCharacters: []
      }
    };
    this.nodes = [...this.nodes, newScene];
    this.selectNode(newScene);
    this.calculateCanvasSize();
    this.closeContextMenu();
    this.saveEditorState();
    
    setTimeout(() => this.cdr.detectChanges(), 0);
  }

  addNewAudioNode() {
    const id = `tts_${Date.now()}`;
    const x = this.contextMenuCanvasPosition.x ? Math.round(this.contextMenuCanvasPosition.x) : 150;
    const y = this.contextMenuCanvasPosition.y ? Math.round(this.contextMenuCanvasPosition.y) : 150;
    
    const newAudio: NodeItem = {
      id,
      type: 'tts',
      title: 'Text to Speech',
      subtitle: '0s',
      x, y,
      baseX: x, baseY: y,
      inputs: [],
      outputs: ['out'],
      data: { 
        text: '', 
        audioUrl: '',
        duration: '0s'
      }
    };
    this.nodes = [...this.nodes, newAudio];
    this.selectNode(newAudio);
    this.calculateCanvasSize();
    this.closeContextMenu();
    this.saveEditorState();
    
    setTimeout(() => this.cdr.detectChanges(), 0);
  }

  saveProject() {
    if (!this.uuid || !this.projectData) return;
    const storageKey = `ai_type_video_ready_data_${this.uuid}`;
    this.multiAccountService.setItem(storageKey, this.projectData);
  }

  saveEditorState() {
     if (this.projectData) {
         const strippedNodes = this.nodes.map(n => {
             const nCopy = JSON.parse(JSON.stringify(n));
             if (nCopy.data) {
                 delete nCopy.data.projectCharacters;
                 // Chỉ strip media URLs nếu node có liên kết với scene
                 if (nCopy.data.sceneIndex !== undefined && nCopy.data.sceneIndex !== null) {
                     delete nCopy.data.sceneData;
                 }
             }
             return nCopy;
         });

         this.projectData.editorLayout = {
             nodes: strippedNodes,
             connections: JSON.parse(JSON.stringify(this.connections))
         };
         this.saveProject();
     }
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
    } else if (this.editingType === 'scene' && this.selectedNode) {
      if (this.selectedNode.type === 'tts') {
          this.selectedNode.data = { ...this.selectedNode.data, text: text };
          this.selectedNode.title = text || 'Text to Speech';
          if (this.selectedNode.data.sceneData && this.selectedNode.data.sceneData.subtitles && this.selectedNode.data.sceneData.subtitles.length > 0) {
              this.selectedNode.data.sceneData.subtitles[0].text = text;
          }
          this.saveProject();
          return;
      }

      let savedText = text;
      const visualMarker = 'Action/Visuals: ';
      const index = text.lastIndexOf(visualMarker);
      if (index !== -1) {
          savedText = text.substring(index + visualMarker.length).trim();
      } else {
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
        this.saveEditorState();
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
    const targetNode = node || this.selectedNode;
    const isSpecificNode = !!targetNode;
    
    if (isSpecificNode && targetNode.type === 'tts') {
        if (targetNode.data?.sceneData) {
            const sceneData = targetNode.data.sceneData;
            if (sceneData.subtitles) {
                sceneData.subtitles.forEach((sub: any) => sub.audioUrl = null);
            }
        } else {
            targetNode.data.audioUrl = null;
        }
    }

    const dialogRef = this.dialog.open(AudioGenerationComponent, {
        width: '400px',
        maxWidth: '100vw',
        data: { 
            ...this.projectData,
            selectedModel: this.selectedModel, 
            scenePrompt: targetNode?.data?.text || '',
            targetSceneIndex: isSpecificNode ? targetNode.data.sceneIndex : null,
            standaloneTTSNode: (isSpecificNode && targetNode.type === 'tts' && !targetNode.data.sceneData) ? targetNode : null
        }
    });

    dialogRef.afterClosed().subscribe(data => {
        if (data && data.action === 'start') {
            this.generateAudioInBackground(data, targetNode, isSpecificNode);
        } else if (data && !data.action) {
            // Backward compatibility
            this.projectData = data;
            this.saveEditorState();
            this.buildGraphFromData(this.projectData);
            this.cdr.detectChanges();
        }
    });
  }

  async generateAudioInBackground(config: any, targetNode: NodeItem, isSpecificNode: boolean) {
      const pendingSubs: {
          sub: any;
          sIdx: number;
          subIdx: number;
          globalIndex: number;
      }[] = [];
      let globalCounter = 0;

      // Gom dữ liệu
      if (isSpecificNode && targetNode.type === 'tts' && !targetNode.data.sceneData) {
          targetNode.data.isGeneratingAudio = true;
          this.cdr.detectChanges();
          pendingSubs.push({
              sub: targetNode.data,
              sIdx: -1,
              subIdx: -1,
              globalIndex: 0
          });
      } else if (this.projectData.scenes) {
          this.projectData.scenes.forEach((scene: any, sIdx: number) => {
              const targetSceneIndex = isSpecificNode ? targetNode.data.sceneIndex : null;
              if (targetSceneIndex !== undefined && targetSceneIndex !== null && targetSceneIndex !== sIdx) {
                  return; 
              }
              if (targetSceneIndex === sIdx && targetNode) {
                  targetNode.data.isGeneratingAudio = true;
              }
              scene.subtitles.forEach((sub: any, subIdx: number) => {
                  if (!sub.audioUrl) {
                      pendingSubs.push({
                          sub,
                          sIdx,
                          subIdx,
                          globalIndex: globalCounter,
                      });
                  }
                  globalCounter++;
              });
          });
          this.cdr.detectChanges();
      }

      if (pendingSubs.length === 0) return;

      this.toastr.info(`Bắt đầu xử lý ${pendingSubs.length} mục...`, 'System');

      const edgeVoices = ['vi-VN-NamMinhNeural', 'vi-VN-HoaiMyNeural'];
      const isEdgeVoice = edgeVoices.includes(config.selectedVoice);
      const isTTSTypeVoice = config.selectedVoice.indexOf('tts.type.vn') !== -1;
      const concurrencyLimit = (isEdgeVoice || isTTSTypeVoice) ? 3 : 1;

      try {
          let currentIndex = 0;
          const worker = async () => {
              while (currentIndex < pendingSubs.length) {
                  const taskIndex = currentIndex++;
                  const item = pendingSubs[taskIndex];

                  await this.generateAudioForSub(
                      item.sub,
                      item.globalIndex,
                      config
                  );

                  this.ngZone.run(() => {
                      this.saveEditorState();
                      this.buildGraphFromData(this.projectData);
                      this.cdr.detectChanges();
                  });
              }
          };

          const workers = [];
          for (let i = 0; i < concurrencyLimit; i++) {
              workers.push(worker());
          }
          await Promise.all(workers);

          this.ngZone.run(() => {
              this.nodes.forEach(n => { if(n.data) n.data.isGeneratingAudio = false; });
              if (this.projectData.scenes) {
                  this.projectData.scenes.forEach((scene: any) => {
                      scene.subtitles.forEach((sub: any) => { sub.isGeneratingAudio = false; });
                  });
              }
              
              const hasErrors = pendingSubs.some(item => item.sub.hasError);
              if (hasErrors) {
                  this.toastr.warning('Quá trình hoàn tất nhưng có lỗi xảy ra ở một số tiến trình.');
              } else {
                  this.toastr.success('Đã hoàn tất quá trình tạo audio!');
              }
              this.saveEditorState();
              this.buildGraphFromData(this.projectData);
              this.cdr.detectChanges();
          });
      } catch (err) {
          this.ngZone.run(() => {
              this.nodes.forEach(n => { if(n.data) n.data.isGeneratingAudio = false; });
              console.error('Concurrency processing error:', err);
              this.toastr.error('Có lỗi xảy ra trong quá trình xử lý liên tục.');
              this.cdr.detectChanges();
          });
      }
  }

  toSlug(str: string): string {
      str = str || '';
      str = str.toLowerCase();
      str = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      str = str.replace(/[đĐ]/g, 'd');
      str = str.replace(/([^0-9a-z-\s])/g, '');
      str = str.replace(/(\s+)/g, '-');
      str = str.replace(/^-+|-+$/g, '');
      return str;
  }

  async generateAudioForSub(sub: any, globalIndex: number, config: any): Promise<void> {
      return new Promise(async (resolve) => {
          if (!sub.text || !sub.text.trim()) { resolve(); return; }
          if (!(window as any).electron || !(window as any).electron.invoke) {
              this.toastr.error('Cần chạy trên App Desktop (Electron).');
              resolve(); return;
          }

          const username = this.projectData.username || 'anonymous';
          const subPath = `${username}/${this.projectData.uuid || 'default'}`;
          const prefix = (globalIndex >= 0 ? globalIndex + 1 : 0).toString().padStart(3, '0');
          const slug = this.toSlug(sub.text.substring(0, 50));

          const edgeVoices = ['vi-VN-NamMinhNeural', 'vi-VN-HoaiMyNeural'];
          const isEdgeVoice = edgeVoices.includes(config.selectedVoice);

          let res: any;
          try {
              if (isEdgeVoice) {
                  const niceFilename = `${prefix}_${slug}`;
                  const payload = {
                      text: sub.text,
                      voice: config.selectedVoice,
                      rate: config.selectedRate,
                      pitch: config.selectedPitch,
                      filename: niceFilename,
                      username: subPath,
                  };
                  res = await (window as any).electron.invoke('tts-generate', payload);
              } else {
                  const isTTSTypeVoice = config.selectedVoice.endsWith('tts.type.vn');
                  const isAusyncVoice = config.selectedVoice.endsWith('ausynclab.io');

                  if (isTTSTypeVoice) {
                      const voice_id = config.selectedVoice.replace('-tts.type.vn', '');
                      const niceFilename = `${prefix}_${slug}`;
                      const voice = await config.myvoices.filter((voice: any) => (String(voice['id']) === String(voice_id)));
                      let safeText = sub.text;
                      if (safeText.length < 150) {
                          safeText = safeText.replace(/[.!?\n]+/g, ', ');
                          safeText = safeText.replace(/,\s*$/, '').trim(); 
                      }
                      const payload = {
                          text: safeText,
                          voice_id: voice[0]['id'],
                          key: voice[0]['api_key'],
                          ref_audio_name: voice[0]['ref_audio_name'],
                          ref_text: voice[0]['ref_text'],
                          speed: voice[0]['speed'] || config.selectedRate || 1.0,
                          num_step: voice[0]['num_step'] || 16,
                          filename: niceFilename,
                          username: subPath,
                      };
                      res = await (window as any).electron.invoke('tts-type-generate', payload);
                  } else if (isAusyncVoice) {
                      const voice_id = config.selectedVoice.replace('-ausynclab.io', '');
                      const niceFilename = `${prefix}_${slug}_ausync`;
                      const voice = await config.myvoices.filter((voice: any) => (String(voice['id']) === String(voice_id)));
                      const payload = {
                          text: sub.text,
                          voice_id: voice_id,
                          key: voice[0]['api_key'],
                          speed: voice[0]['speed'] || config.selectedRate || 1.0,
                          filename: niceFilename,
                          username: subPath,
                      };
                      res = await (window as any).electron.invoke('tts-ausync-generate', payload);
                  }
              }

              if (res && res.success !== false && !res.error) {
                  const rawPath = res.filePath || res.url || res.result;
                  if (rawPath) {
                      let finalAudioUrl = rawPath;
                      if (!rawPath.startsWith('http://') && !rawPath.startsWith('https://') && !rawPath.startsWith('file://') && !rawPath.startsWith('media://')) {
                          finalAudioUrl = `file://${rawPath}`;
                      }
                      sub.audioUrl = finalAudioUrl;
                      if (sub.sceneData && sub.sceneData.subtitles && sub.sceneData.subtitles.length > 0) {
                          sub.sceneData.subtitles[0].audioUrl = finalAudioUrl;
                      }
                      sub.hasError = false;
                      sub.errorMessage = '';
                  }
              } else {
                  let errorMsg = res?.error || 'Lỗi không xác định từ API';
                  if (errorMsg.includes('CUDA error') || errorMsg.includes('device-side assert')) {
                      errorMsg = 'Hệ thống đang bị quá tải hoặc gặp sự cố phần cứng (GPU).';
                  }
                  console.error(`Error processing sub ${sub.text}:`, errorMsg);
                  this.toastr.error(`Lỗi tạo âm thanh: ${errorMsg}`);
                  sub.hasError = true;
                  sub.errorMessage = errorMsg;
              }
          } catch (err: any) {
              console.error(`Lỗi Electron cho sub ${sub.id}:`, err.message);
          } finally {
              resolve();
          }
      });
  }

  private safeUrlCache: { [url: string]: SafeUrl | string } = {};

  getSafeUrl(url: string | null): SafeUrl | string | null {
      if (!url) return null;
      if (url.startsWith('http://') || url.startsWith('https://')) return url;
      
      let cleanUrl = url.replace('unsafe:', '');
      
      // Sử dụng cấu trúc media://SMART_FIND/ để Chromium phân tích URL hợp lệ có hostname
      if (cleanUrl.startsWith('file://')) {
          const originalPath = cleanUrl.replace('file://', '');
          cleanUrl = `media://SMART_FIND/?path=${encodeURIComponent(originalPath)}`;
      }

      if (this.safeUrlCache[cleanUrl]) return this.safeUrlCache[cleanUrl];
      
      const safeUrl = this.sanitizer.bypassSecurityTrustUrl(cleanUrl);
      this.safeUrlCache[cleanUrl] = safeUrl;
      return safeUrl;
  }

  updateDuration(node: NodeItem, durationSec: number) {
      if (durationSec && !isNaN(durationSec)) {
          const m = Math.floor(durationSec / 60);
          const s = Math.floor(durationSec % 60);
          node.data.duration = `${m > 0 ? m + ':' : '00:'}${s.toString().padStart(2, '0')}`;
          this.cdr.detectChanges();
      }
  }

  onAudioError(event: any, node: NodeItem) {
      if (!node.data.audioUrl) return;
      console.error('Lỗi tải Audio:', event);
      console.error('URL thực tế trong thẻ audio:', event.target?.src);
      console.error('URL gốc trong node.data:', node.data.audioUrl);
      const errorMsg = event.target?.error ? ` (Mã lỗi: ${event.target.error.code})` : '';
      this.toastr.error(`Lỗi tải âm thanh từ: ${node.data.audioUrl}${errorMsg}`);
  }

  toggleAudio(node: NodeItem, audioEl: HTMLAudioElement, event: Event) {
      if (!node.data.audioUrl || !audioEl) return;
      event.stopPropagation();
      
      if (audioEl.paused) {
          const playPromise = audioEl.play();
          if (playPromise !== undefined) {
              playPromise.catch(error => {
                  console.error("Audio playback error:", error);
                  this.toastr.error("Không thể phát âm thanh: " + error.message);
              });
          }
      } else {
          audioEl.pause();
      }
      this.cdr.detectChanges();
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

  onMouseMoveOutside(event: MouseEvent) {
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
      
      const maxRadius = 50; 
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
      
      const el = document.getElementById(this.draggedNode.id);
      if (el) {
          el.style.left = newX + 'px';
          el.style.top = newY + 'px';
      }
      
      this.connections.forEach(conn => {
          if (conn.fromNode === this.draggedNode!.id || conn.toNode === this.draggedNode!.id) {
              conn.path = this.getConnectionPath(conn);
              const cEl = document.getElementById('conn_' + conn.id);
              if (cEl && conn.path) {
                  cEl.setAttribute('d', conn.path);
              }
          }
      });
    } else if (this.draggedConnection) {
      const rect = this.workspace.nativeElement.getBoundingClientRect();
      const mouseX = (event.clientX - rect.left + this.workspace.nativeElement.scrollLeft) / this.scale;
      const mouseY = (event.clientY - rect.top + this.workspace.nativeElement.scrollTop) / this.scale;
      this.draggedConnection.toX = mouseX;
      this.draggedConnection.toY = mouseY;
      this.draggedConnection.path = this.getDraggedConnectionPath();
      
      const dEl = document.getElementById('dragged_conn');
      if (dEl && this.draggedConnection.path) {
          dEl.setAttribute('d', this.draggedConnection.path);
      }
    }
  }

  onMouseUpOutside() {
    this.ngZone.run(() => {
        if (this.draggedConnection) {
          if (this.hoveredInput) {
             this.createConnection(this.draggedConnection.fromNode, this.draggedConnection.fromPort, this.hoveredInput.node.id, this.hoveredInput.port);
          } else if (this.hoveredNode) {
             const fromObj = this.nodes.find(n => n.id === this.draggedConnection!.fromNode);
             let targetPort = null;
             
             if (fromObj?.type === 'tts') {
                 targetPort = this.hoveredNode.inputs.includes('tts_in') ? 'tts_in' : null;
             } else if (fromObj?.type === 'video' || fromObj?.type === 'image') {
                 targetPort = this.hoveredNode.inputs.includes('prev_scene_in') ? 'prev_scene_in' : 
                              (this.hoveredNode.type === 'composition' && this.hoveredNode.inputs.length > 0 ? this.hoveredNode.inputs[0] : null);
             } else {
                 targetPort = this.hoveredNode.inputs.length > 0 ? this.hoveredNode.inputs[0] : null;
             }
             
             if (targetPort) {
                this.createConnection(this.draggedConnection.fromNode, this.draggedConnection.fromPort, this.hoveredNode.id, targetPort);
             }
          } else {
             this.saveEditorState();
          }
          this.draggedConnection = null;
        }
        
        if (this.draggedNode) {
           this.saveEditorState();
        }
        
        this.isPanning = false;
        this.draggedNode = null;
        this.cdr.detectChanges();
    });
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
  }
}
