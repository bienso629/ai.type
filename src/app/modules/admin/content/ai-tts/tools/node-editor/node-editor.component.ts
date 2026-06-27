import { Component, OnInit, ViewChild, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';
import { TextFieldModule } from '@angular/cdk/text-field';
import { FormsModule } from '@angular/forms';

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
  imports: [CommonModule, MatIconModule, RouterModule, TextFieldModule, FormsModule],
  templateUrl: './node-editor.component.html',
  styleUrls: ['./node-editor.component.scss'],
  host: {
    'class': 'absolute inset-0 flex flex-col overflow-hidden'
  }
})
export class NodeEditorComponent implements OnInit {
  @ViewChild('workspace', { static: true }) workspace!: ElementRef;

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

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private multiAccountService: MultiAccountService
  ) { }

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
  }

    buildGraphFromData(data: any) {
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

      if (scene.subtitles && scene.subtitles.length > 0) {
        this.nodes.push({
          id: ttsNodeId, type: 'tts', title: 'Text to Speech', subtitle: 'ElevenLabs',
          x: sceneX, y: 450 + yOffset, inputs: [], outputs: ['out'],
          data: { text: scene.subtitles[0].text, duration: '00:05' },
          baseX: sceneX, baseY: 450 + yOffset
        });
        hasTts = true;
      }

      const visualUrl = videoUrl || imageUrl || null;

      const vidNode: NodeItem = {
        id: vidNodeId, type: 'video', title: `Scene Visuals ${index + 1}`, subtitle: videoUrl ? 'Generated Video' : (imageUrl ? 'Source Image' : 'Empty'),
        x: sceneX, y: 150 + yOffset, inputs: [], outputs: ['out'],
        data: { imageUrl: visualUrl, text: scene.script, isVideo: !!videoUrl, aspectRatio: aspectRatio },
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
        id: 'vid1', type: 'video', title: 'Video', subtitle: 'Veo 3.1',
        x: 650, y: 100, inputs: ['in1'], outputs: ['out'],
        data: { imageUrl: 'assets/images/placeholder.jpg', text: 'Camera moves from start frame to end frame', aspectRatio: '16:9' },
        baseX: 650, baseY: 100
      },
      {
        id: 'tts1', type: 'tts', title: 'Text to Speech', subtitle: 'Eleven v3',
        x: 650, y: 400, inputs: [], outputs: ['out'],
        data: { text: 'Every sunset looks better from the water.', duration: '00:04' },
        baseX: 650, baseY: 400
      },
      {
        id: 'comp1', type: 'composition', title: 'Composition', subtitle: '',
        x: 1150, y: 200, inputs: ['vid_in', 'audio_in'], outputs: [],
        data: { imageUrl: 'assets/images/placeholder.jpg' },
        baseX: 1150, baseY: 200
      }
    ];

    this.connections = [
      { id: 'c1', fromNode: 'img1', fromPort: 'out', toNode: 'vid1', toPort: 'in1' },
      { id: 'c5', fromNode: 'vid1', fromPort: 'out', toNode: 'comp1', toPort: 'vid_in' },
      { id: 'c6', fromNode: 'tts1', fromPort: 'out', toNode: 'comp1', toPort: 'audio_in' }
    ];
  }

  getConnectionPath(conn: NodeConnection): string {
    const from = this.nodes.find(n => n.id === conn.fromNode);
    const to = this.nodes.find(n => n.id === conn.toNode);
    if (!from || !to) return '';

    let fromHeight = from.type === 'tts' ? 130 : 240;
    let fromWidth = 280;
    const fromEl = document.getElementById(from.id);
    if (fromEl) {
      fromHeight = fromEl.offsetHeight;
      fromWidth = fromEl.offsetWidth;
    }
    
    let toHeight = to.type === 'tts' ? 130 : 240;
    const toEl = document.getElementById(to.id);
    if (toEl) {
      toHeight = toEl.offsetHeight;
    }

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
    if (event.target === this.workspace.nativeElement || (event.target as HTMLElement).tagName === 'svg' || (event.target as HTMLElement).classList.contains('bg-gray-50')) {
      this.isPanning = true;
      this.selectedNode = null;
      this.startX = event.clientX;
      this.startY = event.clientY;
      this.startScrollLeft = this.workspace.nativeElement.scrollLeft;
      this.startScrollTop = this.workspace.nativeElement.scrollTop;
    }
  }

  updatePrompt(text: string) {
    if (this.selectedNode && this.selectedNode.type === 'video') {
      this.selectedNode.data.text = text;
    }
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
      
      const maxRadius = 100; // Limited drag radius
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

  onWheel(event: WheelEvent) {
    // Only zoom if ctrl is pressed, otherwise native scroll works!
    if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const zoomIntensity = 0.03;
        const delta = event.deltaY > 0 ? -zoomIntensity : zoomIntensity;
        let newScale = this.scale + delta;
        newScale = Math.min(Math.max(0.1, newScale), 3); 
        this.scale = newScale;
    }
  }

  onNodeMouseDown(event: MouseEvent, node: NodeItem) {
    event.stopPropagation();
    this.draggedNode = node;
    this.selectedNode = node;
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.nodeStartX = node.x;
    this.nodeStartY = node.y;
    
    this.nodes = this.nodes.filter(n => n.id !== node.id);
    this.nodes.push(node);
  }
}
