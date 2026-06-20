
interface DungeonNode {
  x: number;
  y: number;
  shape: 'circle' | 'rect';
  size: number;
  opacity: number;
  discovered: boolean;
  arrivalPulse: number;
}

interface DungeonConnection {
  from: number;
  to: number;
  distance: number;
  progress: number;
}

interface LoopConnection {
  from: number;
  to: number;
  progress: number;
}

interface DungeonCamera {
  x: number;
  y: number;
  zoom: number;
  targetX: number;
  targetY: number;
  targetZoom: number;
  velX: number;
  velY: number;
  velZoom: number;
}

type DungeonPhase = 'JOURNEY' | 'REVEAL' | 'LOOPING' | 'STAMPING' | 'HOLDING' | 'FADING' | 'WAITING';

interface DungeonState {
  phase: DungeonPhase;
  phaseTime: number;
  journeyStep: number;
  nodes: DungeonNode[];
  connections: DungeonConnection[];
  loopConnections: LoopConnection[];
  circledNode: number | null;
  fadeOpacity: number;
  camera: DungeonCamera;
  discoveredNodes: Set<number>;
}

interface VisualizerSettings {
  size: string;
  circleChance: number;
  loopChance: number;
  corridorStyle: string;
  [key: string]: unknown;
}

interface VisualizerOptions {
  height?: number;
  settings?: Partial<VisualizerSettings>;
}

interface SmoothDampResult {
  value: number;
  velocity: number;
}

export class DungeonEssenceVisualizer {
  container: HTMLElement;
  height: number;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
  stampOverlay: HTMLDivElement;
  animationId: number | null;
  state: DungeonState | null;
  resizeObserver: ResizeObserver;
  colors: Record<string, string>;
  settings: VisualizerSettings;
  width: number;
  stampSize: number;
  lastTime: number;

  constructor(container: HTMLElement, options: VisualizerOptions = {}) {
    this.container = container;
    this.height = options.height != null && options.height !== 0 ? options.height : 150;
    this.width = 0;
    this.stampSize = 0;
    this.lastTime = 0;
    this.colors = {};
    this.settings = {
      size: 'medium',
      circleChance: 0.3,
      loopChance: 0.15,
      corridorStyle: 'straight',
      ...options.settings
    };

    // Create canvas
    this.canvas = activeDocument.createElement('canvas');
    this.canvas.setCssStyles({ display: 'block', width: '100%' });
    this.container.appendChild(this.canvas);

    // Create stamp overlay container
    this.stampOverlay = activeDocument.createElement('div');
    this.stampOverlay.setCssStyles({
      position: 'absolute',
      pointerEvents: 'none',
      opacity: '0',
      filter: 'saturate(0.4)',
      transition: 'opacity 0.3s ease'
    });
    // Parse as SVG (not HTML) so filters/namespaced elements survive, and avoid
    // the innerHTML sink. Content is a static developer-authored template.
    const stampSvg = new DOMParser().parseFromString(this.getWindroseSVG(), 'image/svg+xml').documentElement;
    this.stampOverlay.appendChild(stampSvg);
    this.container.setCssStyles({ position: 'relative' });
    this.container.appendChild(this.stampOverlay);

    this.ctx = this.canvas.getContext('2d');
    this.animationId = null;
    this.state = null;

    // Sample colors from CSS
    this.sampleColors();

    // Setup resize observer
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);

    // Initial size
    this.handleResize();
  }

  sampleColors(): void {
    const style = getComputedStyle(document.body);
    this.colors = {
      node: style.getPropertyValue('--text-muted').trim() || '#888',
      nodePulse: style.getPropertyValue('--interactive-accent').trim() || '#7c5cbf',
      line: style.getPropertyValue('--text-faint').trim() || '#666',
      lineSolid: style.getPropertyValue('--text-muted').trim() || '#888'
    };
  }

  getWindroseSVG(): string {
    // Simplified WindroseCompass SVG for the stamp
    return `
      <svg viewBox="0 0 100 100" style="width: 100%; height: 100%;">
        <defs>
          <filter id="windrose-stamp-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0, 0, 0, 0.6)"/>
          </filter>
        </defs>
        <g filter="url(#windrose-stamp-shadow)">
          <circle cx="50" cy="50" r="28" fill="rgba(0, 0, 0, 0.7)" stroke="rgba(196, 165, 123, 0.4)" stroke-width="2"/>
          <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(196, 165, 123, 0.3)" stroke-width="0.8"/>

          <!-- Cardinal lines -->
          <line x1="50" y1="2" x2="50" y2="22" stroke="rgba(196, 165, 123, 0.8)" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="50" y1="78" x2="50" y2="98" stroke="rgba(196, 165, 123, 0.5)" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="78" y1="50" x2="98" y2="50" stroke="rgba(196, 165, 123, 0.5)" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="2" y1="50" x2="22" y2="50" stroke="rgba(196, 165, 123, 0.5)" stroke-width="1.5" stroke-linecap="round"/>

          <!-- Compass star -->
          <path d="M 50 8 L 58 50 L 50 47 L 42 50 Z" fill="#c4a57b" stroke="#8b6842" stroke-width="0.8"/>
          <path d="M 50 92 L 56 50 L 50 53 L 44 50 Z" fill="rgba(196, 165, 123, 0.7)" stroke="rgba(139, 104, 66, 0.7)" stroke-width="0.5"/>
          <path d="M 92 50 L 50 44 L 53 50 L 50 56 Z" fill="rgba(196, 165, 123, 0.7)" stroke="rgba(139, 104, 66, 0.7)" stroke-width="0.5"/>
          <path d="M 8 50 L 50 44 L 47 50 L 50 56 Z" fill="rgba(196, 165, 123, 0.7)" stroke="rgba(139, 104, 66, 0.7)" stroke-width="0.5"/>

          <!-- N letter -->
          <text x="50" y="62" text-anchor="middle" font-size="28" font-weight="bold" fill="#c4a57b" font-family="serif">N</text>

          <!-- Red north arrow -->
          <path d="M 50 14 L 45 24 L 50 20 L 55 24 Z" fill="#e74c3c" stroke="#c0392b" stroke-width="0.5"/>
        </g>
      </svg>
    `;
  }

  handleResize(): void {
    const rect = this.container.getBoundingClientRect();
    const width = Math.floor(rect.width);
    if (width < 10) return;

    this.width = width;
    this.canvas.width = width;
    this.canvas.height = this.height;

    // Update stamp size
    const stampSize = Math.min(65, Math.max(45, width * 0.12));
    this.stampSize = stampSize;
    this.stampOverlay.style.width = stampSize + 'px';
    this.stampOverlay.style.height = stampSize + 'px';

    // Restart animation with new dimensions
    if (this.animationId != null) {
      this.stop();
      this.start();
    }
  }

  /**
   * Update animation settings
   *
   * Behavior by setting type:
   * - corridorStyle: Updates on-the-fly (affects line drawing)
   * - circleChance: Takes effect on next animation cycle (affects node generation)
   * - loopChance: Takes effect on next animation cycle (affects connection generation)
   * - size: Restarts animation immediately (affects node count significantly)
   */
  updateSettings(newSettings: Partial<VisualizerSettings>): void {
    const sizeChanged = newSettings.size != null && newSettings.size !== '' && newSettings.size !== this.settings.size;
    this.settings = { ...this.settings, ...newSettings };

    // Size changes warrant an immediate restart since node count changes dramatically
    if (sizeChanged && this.animationId != null) {
      this.restartAnimation();
    }
  }

  /**
   * Restart the animation with current settings
   */
  restartAnimation(): void {
    if (this.animationId == null) return;

    this.hideStamp();
    this.initState();
  }

  // Apply style overrides (from DUNGEON_STYLES)
  applyStyle(styleName: string): void {
    const styleOverrides: Record<string, Partial<VisualizerSettings>> = {
      classic: {},
      cavern: { circleChance: 0.6, corridorStyle: 'organic', loopChance: 0.2 },
      fortress: { circleChance: 0, corridorStyle: 'straight', loopChance: 0.08 },
      crypt: { circleChance: 0.1, corridorStyle: 'straight', loopChance: 0.02 }
    };

    const overrides = styleOverrides[styleName] ?? {};
    this.updateSettings(overrides);
  }

  start(): void {
    if (this.animationId != null) return;

    this.initState();
    this.lastTime = performance.now();
    this.animationId = window.requestAnimationFrame((t) => this.render(t));
  }

  stop(): void {
    if (this.animationId != null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.hideStamp();
  }

  destroy(): void {
    this.stop();
    this.resizeObserver.disconnect();
    this.container.removeChild(this.canvas);
    this.container.removeChild(this.stampOverlay);
  }

  // === Animation State ===

  initState(): void {
    const nodeCount = this.settings.size === 'small' ? 5 :
                      this.settings.size === 'large' ? 12 : 8;

    this.state = {
      phase: 'JOURNEY',
      phaseTime: 0,
      journeyStep: 0,
      nodes: [],
      connections: [],
      loopConnections: [],
      circledNode: null,
      fadeOpacity: 1,
      camera: {
        x: 0, y: 0, zoom: 2.2,
        targetX: 0, targetY: 0, targetZoom: 2.2,
        velX: 0, velY: 0, velZoom: 0
      },
      discoveredNodes: new Set()
    };

    this.generateNodes(nodeCount);
    this.buildMST();
    this.buildLoops();

    // Set initial camera
    if (this.state.nodes.length > 0) {
      const first = this.state.nodes[0];
      this.state.camera.x = this.state.camera.targetX = first.x;
      this.state.camera.y = this.state.camera.targetY = first.y;
    }
  }

  generateNodes(count: number): void {
    const nodes: DungeonNode[] = [];
    const padding = 30;
    const bottomPadding = 55; // Extra space at bottom for title overlay
    const minDist = 35;
    const { width, height } = this;

    for (let i = 0; i < count; i++) {
      let attempts = 0;
      let placed = false;

      while (!placed && attempts < 50) {
        const x = padding + Math.random() * (width - padding * 2);
        const y = padding + Math.random() * (height - padding - bottomPadding);

        const tooClose = nodes.some(n => {
          const dx = n.x - x;
          const dy = n.y - y;
          return Math.sqrt(dx * dx + dy * dy) < minDist;
        });

        if (!tooClose) {
          const isCircle = Math.random() < this.settings.circleChance;
          nodes.push({
            x, y,
            shape: isCircle ? 'circle' : 'rect',
            size: 5 + Math.random() * 3,
            opacity: 0,
            discovered: i === 0,
            arrivalPulse: 0
          });
          placed = true;
        }
        attempts++;
      }
    }

    if (nodes.length > 0) {
      nodes[0].opacity = 1;
      this.state!.discoveredNodes.add(0);
      this.state!.circledNode = nodes.length - 1;
    }

    this.state!.nodes = nodes;
  }

  buildMST(): void {
    const nodes = this.state!.nodes;
    if (nodes.length < 2) {
      this.state!.connections = [];
      return;
    }

    const connections: DungeonConnection[] = [];
    const connected = new Set([0]);
    const unconnected = new Set(nodes.map((_: DungeonNode, i: number) => i).filter((i: number) => i !== 0));

    while (unconnected.size > 0) {
      let bestDist = Infinity;
      let bestEdge: { from: number; to: number; distance: number } | null = null;

      for (const from of connected) {
        for (const to of unconnected) {
          const dx = nodes[to].x - nodes[from].x;
          const dy = nodes[to].y - nodes[from].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < bestDist) {
            bestDist = dist;
            bestEdge = { from, to, distance: dist };
          }
        }
      }

      if (bestEdge) {
        connections.push({ ...bestEdge, progress: 0 });
        connected.add(bestEdge.to);
        unconnected.delete(bestEdge.to);
      } else {
        break;
      }
    }

    this.state!.connections = connections;
  }

  buildLoops(): void {
    const { nodes, connections } = this.state!;
    const loops: LoopConnection[] = [];
    const existingPairs = new Set(
      connections.map(c => `${Math.min(c.from, c.to)}-${Math.max(c.from, c.to)}`)
    );

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const key = `${i}-${j}`;
        if (!existingPairs.has(key) && Math.random() < this.settings.loopChance) {
          loops.push({ from: i, to: j, progress: 0 });
        }
      }
    }

    this.state!.loopConnections = loops;
  }

  // === Easing & Math ===

  lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

  easeOutCubic(t: number): number { return 1 - Math.pow(1 - t, 3); }
  easeInOutCubic(t: number): number { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  easeHandTraced(t: number): number {
    if (t < 0.15) return t * t * 4.44;
    if (t > 0.85) return 1 - Math.pow(1 - t, 2) * 4.44;
    return 0.1 + ((t - 0.15) / 0.7) * 0.8;
  }

  smoothDamp(current: number, target: number, velocity: number, smoothTime: number, dt: number): SmoothDampResult {
    const omega = 2 / smoothTime;
    const x = omega * dt;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const change = current - target;
    const temp = (velocity + omega * change) * dt;
    const newVel = (velocity - omega * temp) * exp;
    return { value: target + (change + temp) * exp, velocity: newVel };
  }

  // === Stamp Control ===

  showStamp(screenX: number, screenY: number): void {
    this.stampOverlay.setCssStyles({
      left: screenX + 'px',
      top: screenY + 'px',
      transform: 'translate(-50%, -50%)',
      animation: 'none'
    });
    // Trigger reflow
    void this.stampOverlay.offsetHeight;
    this.stampOverlay.setCssStyles({
      animation: 'windrose-windrose-stamp 0.35s ease-out forwards',
      opacity: '0.75'
    });
  }

  hideStamp(): void {
    this.stampOverlay.setCssStyles({ opacity: '0', animation: 'none' });
  }

  // === Rendering ===

  render(time: number): void {
    const dt = time - this.lastTime;
    this.lastTime = time;
    const dtSeconds = dt / 1000;

    const { state, ctx, width, height } = this;
    if (!state || !ctx) return;
    state.phaseTime += dt;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Smooth camera
    const camSmooth = 0.4;
    let result = this.smoothDamp(state.camera.x, state.camera.targetX, state.camera.velX, camSmooth, dtSeconds);
    state.camera.x = result.value; state.camera.velX = result.velocity;

    result = this.smoothDamp(state.camera.y, state.camera.targetY, state.camera.velY, camSmooth, dtSeconds);
    state.camera.y = result.value; state.camera.velY = result.velocity;

    result = this.smoothDamp(state.camera.zoom, state.camera.targetZoom, state.camera.velZoom, camSmooth * 1.2, dtSeconds);
    state.camera.zoom = result.value; state.camera.velZoom = result.velocity;

    // Apply camera
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(state.camera.zoom, state.camera.zoom);
    ctx.translate(-state.camera.x, -state.camera.y);
    ctx.globalAlpha = state.fadeOpacity;

    // Phase logic
    this.updatePhase(dt);

    // Draw connections
    state.connections.forEach(conn => {
      if (conn.progress > 0) {
        const from = state.nodes[conn.from];
        const to = state.nodes[conn.to];
        this.drawLine(from, to, conn.progress, false);
      }
    });

    // Draw loops
    state.loopConnections.forEach(conn => {
      if (conn.progress > 0) {
        const from = state.nodes[conn.from];
        const to = state.nodes[conn.to];
        this.drawLine(from, to, conn.progress, true);
      }
    });

    // Draw nodes
    state.nodes.forEach((node) => {
      if (!node.discovered || node.opacity <= 0) return;
      this.drawNode(node);
    });

    ctx.restore();

    this.animationId = window.requestAnimationFrame((t) => this.render(t));
  }

  updatePhase(_dt: number): void {
    const { state, width, height } = this;
    if (!state) return;
    const BASE_JOURNEY_TIME = 350;
    const JOURNEY_VARIANCE = 200;
    const PAUSE_TIME = 180;

    switch (state.phase) {
      case 'JOURNEY': {
        const conn = state.connections[state.journeyStep];
        if (conn == null) {
          state.phase = 'REVEAL';
          state.phaseTime = 0;
          break;
        }

        const variance = Math.sin(state.journeyStep * 7.3 + conn.distance * 0.5) * JOURNEY_VARIANCE;
        const connTime = BASE_JOURNEY_TIME + conn.distance * 2 + variance;
        const totalTime = connTime + PAUSE_TIME;

        if (state.phaseTime < connTime) {
          const progress = this.easeHandTraced(state.phaseTime / connTime);
          conn.progress = progress;

          const from = state.nodes[conn.from];
          const to = state.nodes[conn.to];
          state.camera.targetX = this.lerp(from.x, to.x, progress);
          state.camera.targetY = this.lerp(from.y, to.y, progress);

          const exploreProgress = state.journeyStep / state.connections.length;
          state.camera.targetZoom = this.lerp(2.0, 1.3, exploreProgress);

          if (progress > 0.8 && !state.nodes[conn.to].discovered) {
            state.nodes[conn.to].discovered = true;
            state.nodes[conn.to].arrivalPulse = 1;
            state.discoveredNodes.add(conn.to);
          }
        } else {
          conn.progress = 1;
          state.nodes[conn.to].opacity = Math.min(1, state.nodes[conn.to].opacity + 0.15);

          if (state.phaseTime >= totalTime) {
            state.journeyStep++;
            state.phaseTime = 0;
          }
        }
        break;
      }

      case 'REVEAL': {
        const revealTime = 800;
        const progress = Math.min(1, state.phaseTime / revealTime);

        // Calculate graph center
        const nodes = state.nodes;
        const minX = Math.min(...nodes.map(n => n.x));
        const maxX = Math.max(...nodes.map(n => n.x));
        const minY = Math.min(...nodes.map(n => n.y));
        const maxY = Math.max(...nodes.map(n => n.y));

        state.camera.targetX = (minX + maxX) / 2;
        state.camera.targetY = (minY + maxY) / 2;
        state.camera.targetZoom = 1.0;

        nodes.forEach(n => { if (n.discovered) n.opacity = Math.min(1, n.opacity + 0.1); });

        if (progress >= 1) {
          state.phase = 'LOOPING';
          state.phaseTime = 0;
        }
        break;
      }

      case 'LOOPING': {
        const loopTime = 600;
        const progress = state.phaseTime / loopTime;

        state.loopConnections.forEach((conn, i) => {
          conn.progress = Math.max(0, Math.min(1, (progress - i * 0.15) * 2));
        });

        if (progress >= 1 + state.loopConnections.length * 0.1) {
          state.phase = 'STAMPING';
          state.phaseTime = 0;
        }
        break;
      }

      case 'STAMPING': {
        if (state.phaseTime < 20 && state.circledNode !== null) {
          const node = state.nodes[state.circledNode];
          if (node != null) {
            const screenX = (node.x - state.camera.x) * state.camera.zoom + width / 2;
            const screenY = (node.y - state.camera.y) * state.camera.zoom + height / 2;
            this.showStamp(screenX, screenY);
          }
        }

        if (state.phaseTime >= 500) {
          state.phase = 'HOLDING';
          state.phaseTime = 0;
        }
        break;
      }

      case 'HOLDING': {
        if (state.phaseTime >= 1500) {
          state.phase = 'FADING';
          state.phaseTime = 0;
        }
        break;
      }

      case 'FADING': {
        if (state.phaseTime < 20) {
          this.hideStamp();
        }

        const fadeTime = 700;
        const progress = state.phaseTime / fadeTime;
        state.fadeOpacity = 1 - this.easeInOutCubic(progress);

        if (progress >= 1) {
          state.phase = 'WAITING';
          state.phaseTime = 0;
        }
        break;
      }

      case 'WAITING': {
        if (state.phaseTime >= 300) {
          // Reset
          const nodeCount = this.settings.size === 'small' ? 5 :
                            this.settings.size === 'large' ? 12 : 8;

          state.phase = 'JOURNEY';
          state.phaseTime = 0;
          state.journeyStep = 0;
          state.fadeOpacity = 1;
          state.discoveredNodes.clear();

          this.generateNodes(nodeCount);
          this.buildMST();
          this.buildLoops();

          if (state.nodes.length > 0) {
            const first = state.nodes[0];
            state.camera.x = state.camera.targetX = first.x;
            state.camera.y = state.camera.targetY = first.y;
            state.camera.zoom = state.camera.targetZoom = 2.2;
            state.camera.velX = state.camera.velY = state.camera.velZoom = 0;
          }
        }
        break;
      }
    }
  }

  drawLine(from: DungeonNode, to: DungeonNode, progress: number, isLoop: boolean): void {
    if (progress <= 0) return;

    const { ctx, colors, settings } = this;
    if (!ctx) return;

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;

    const nx = dx / len;
    const ny = dy / len;

    // Clip to node edges
    const startPad = from.size + 3;
    const endPad = to.size + 3;
    const x1 = from.x + nx * startPad;
    const y1 = from.y + ny * startPad;
    const x2 = to.x - nx * endPad;
    const y2 = to.y - ny * endPad;

    const clippedLen = len - startPad - endPad;
    if (clippedLen <= 0) return;

    const wobbleAmount = settings.corridorStyle === 'organic' ? 3 : 0;

    ctx.beginPath();
    ctx.moveTo(x1, y1);

    const segments = Math.max(5, Math.floor(clippedLen / 8));
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      if (t > progress) break;

      const px = x1 + (x2 - x1) * t;
      const py = y1 + (y2 - y1) * t;

      const wobble = Math.sin(t * Math.PI * 4 + len * 0.1) * wobbleAmount * (0.3 + t * 0.7);
      ctx.lineTo(px - ny * wobble, py + nx * wobble);
    }

    ctx.lineWidth = isLoop ? 1.5 : 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (isLoop) {
      ctx.setLineDash([4, 5]);
    } else {
      ctx.setLineDash([]);
    }

    const alpha = isLoop ? 0.5 : (0.5 + progress * 0.4);
    ctx.strokeStyle = colors.lineSolid + Math.floor(alpha * 255).toString(16).padStart(2, '0');
    ctx.stroke();

    // Pen head
    if (progress < 1 && !isLoop) {
      const headX = x1 + (x2 - x1) * progress;
      const headY = y1 + (y2 - y1) * progress;

      ctx.beginPath();
      ctx.arc(headX, headY, 5, 0, Math.PI * 2);
      ctx.fillStyle = colors.nodePulse + '33';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(headX, headY, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = colors.nodePulse + 'aa';
      ctx.fill();
    }

    ctx.setLineDash([]);
  }

  drawNode(node: DungeonNode): void {
    const { ctx, colors, state } = this;
    if (!ctx || !state) return;
    const nodeAlpha = state.fadeOpacity * node.opacity;

    // Arrival pulse
    if (node.arrivalPulse > 0) {
      const pulseRadius = node.size + 10 * node.arrivalPulse;
      ctx.globalAlpha = nodeAlpha * node.arrivalPulse * 0.5;
      ctx.beginPath();
      ctx.arc(node.x, node.y, pulseRadius, 0, Math.PI * 2);
      ctx.strokeStyle = colors.nodePulse;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      node.arrivalPulse = Math.max(0, node.arrivalPulse - 0.025);
    }

    // Shadow
    ctx.globalAlpha = nodeAlpha * 0.25;
    const shadowOffset = 2;
    if (node.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(node.x + shadowOffset, node.y + shadowOffset, node.size + 1, 0, Math.PI * 2);
      ctx.fillStyle = colors.node;
      ctx.fill();
    } else {
      ctx.fillStyle = colors.node;
      ctx.fillRect(node.x - node.size + shadowOffset, node.y - node.size + shadowOffset, node.size * 2, node.size * 2);
    }

    ctx.globalAlpha = nodeAlpha;

    // Node shape
    if (node.shape === 'circle') {
      // Hollow ring
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.size, 0, Math.PI * 2);
      ctx.strokeStyle = colors.node;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Subtle fill
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.size - 1.5, 0, Math.PI * 2);
      ctx.fillStyle = colors.node + '20';
      ctx.fill();
    } else {
      // Filled square with outline
      const s = node.size;
      ctx.fillStyle = colors.node + '40';
      ctx.fillRect(node.x - s, node.y - s, s * 2, s * 2);

      ctx.strokeStyle = colors.node;
      ctx.lineWidth = 2;
      ctx.strokeRect(node.x - s, node.y - s, s * 2, s * 2);
    }
  }
}
