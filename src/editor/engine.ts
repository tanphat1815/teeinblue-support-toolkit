export type Pt = [number, number];
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type Tool =
  | 'select'
  | 'crop'
  | 'pen'
  | 'arrow'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'text'
  | 'highlight'
  | 'pixelate'
  | 'redact'
  | 'badge';

export interface Style {
  color: string;
  width: number;
  font: number;
  opacity: number;
  shadow: boolean;
}

export type Shape =
  | { t: 'pen'; pts: Pt[]; color: string; width: number; opacity: number; shadow: boolean }
  | { t: 'line' | 'arrow' | 'rect' | 'ellipse'; a: Pt; b: Pt; color: string; width: number; opacity: number; shadow: boolean }
  | { t: 'highlight'; a: Pt; b: Pt; color: string; opacity: number }
  | { t: 'pixelate' | 'redact'; a: Pt; b: Pt }
  | { t: 'text'; at: Pt; text: string; color: string; size: number; opacity: number; shadow: boolean }
  | { t: 'badge'; at: Pt; n: number; color: string; size: number; shadow: boolean };

interface Snapshot {
  base: HTMLCanvasElement;
  shapes: Shape[];
}

const norm = (a: Pt, b: Pt): Rect => ({
  x: Math.min(a[0], b[0]),
  y: Math.min(a[1], b[1]),
  w: Math.abs(a[0] - b[0]),
  h: Math.abs(a[1] - b[1])
});

export class EditorEngine {
  private ctx: CanvasRenderingContext2D;
  private base!: HTMLCanvasElement;
  private shapes: Shape[] = [];
  private draft: Shape | null = null;
  private cropDraft: Rect | null = null;
  private cropStart: Pt | null = null;
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  badgeNo = 1;
  onChange: () => void = () => {};

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  async load(blob: Blob, crop?: Rect) {
    const bmp = await createImageBitmap(blob);
    const r = crop && crop.w > 2 && crop.h > 2 ? crop : { x: 0, y: 0, w: bmp.width, h: bmp.height };
    const c = document.createElement('canvas');
    c.width = r.w;
    c.height = r.h;
    c.getContext('2d')!.drawImage(bmp, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    bmp.close();
    this.setBase(c);
    this.shapes = [];
    this.undoStack = [];
    this.redoStack = [];
    this.render();
  }

  get size() {
    return { w: this.canvas.width, h: this.canvas.height };
  }
  get canUndo() {
    return this.undoStack.length > 0;
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }
  get pendingCrop() {
    return this.cropDraft && this.cropDraft.w > 4 && this.cropDraft.h > 4 ? this.cropDraft : null;
  }

  private setBase(c: HTMLCanvasElement) {
    this.base = c;
    this.canvas.width = c.width;
    this.canvas.height = c.height;
  }
  private push() {
    this.undoStack.push({ base: this.base, shapes: this.shapes });
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
  }
  private restore(s: Snapshot) {
    if (s.base !== this.base) this.setBase(s.base);
    this.shapes = s.shapes;
    this.render();
    this.onChange();
  }
  undo() {
    const s = this.undoStack.pop();
    if (!s) return;
    this.redoStack.push({ base: this.base, shapes: this.shapes });
    this.restore(s);
  }
  redo() {
    const s = this.redoStack.pop();
    if (!s) return;
    this.undoStack.push({ base: this.base, shapes: this.shapes });
    this.restore(s);
  }
  clearAll() {
    if (this.shapes.length === 0) return;
    this.push();
    this.shapes = [];
    this.render();
    this.onChange();
  }

  begin(tool: Tool, p: Pt, st: Style) {
    if (tool === 'select') return;
    switch (tool) {
      case 'crop':
        this.cropStart = p;
        this.cropDraft = { x: p[0], y: p[1], w: 0, h: 0 };
        break;
      case 'pen':
        this.draft = { t: 'pen', pts: [p], color: st.color, width: st.width, opacity: st.opacity, shadow: st.shadow };
        break;
      case 'line':
      case 'arrow':
      case 'rect':
      case 'ellipse':
        this.draft = { t: tool, a: p, b: p, color: st.color, width: st.width, opacity: st.opacity, shadow: st.shadow };
        break;
      case 'highlight':
        this.draft = { t: 'highlight', a: p, b: p, color: st.color, opacity: st.opacity || 0.35 };
        break;
      case 'pixelate':
      case 'redact':
        this.draft = { t: tool, a: p, b: p };
        break;
      case 'badge':
        this.add({ t: 'badge', at: p, n: this.badgeNo++, color: st.color, size: st.font, shadow: st.shadow });
        break;
      case 'text':
        break;
    }
    this.render();
  }
  update(p: Pt) {
    if (this.cropStart) this.cropDraft = norm(this.cropStart, p);
    else if (this.draft) {
      if (this.draft.t === 'pen') this.draft.pts.push(p);
      else if ('b' in this.draft) this.draft.b = p;
    }
    this.render();
  }
  end() {
    if (this.cropStart) {
      this.cropStart = null;
      this.render();
      this.onChange();
      return;
    }
    const d = this.draft;
    this.draft = null;
    if (!d) return;
    const tiny =
      d.t === 'pen'
        ? d.pts.length < 2
        : 'a' in d
          ? Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]) < 4
          : false;
    if (!tiny) this.add(d);
    else this.render();
  }
  addText(at: Pt, text: string, color: string, size: number, opacity = 1, shadow = false) {
    if (text.trim()) this.add({ t: 'text', at, text, color, size, opacity, shadow });
  }
  private add(s: Shape) {
    this.push();
    this.shapes = [...this.shapes, s];
    this.render();
    this.onChange();
  }

  cancelCrop() {
    this.cropDraft = null;
    this.cropStart = null;
    this.render();
    this.onChange();
  }
  applyCrop() {
    const r = this.pendingCrop;
    if (!r) return;
    const x = Math.max(0, Math.round(r.x)),
      y = Math.max(0, Math.round(r.y));
    const w = Math.min(this.canvas.width - x, Math.round(r.w)),
      h = Math.min(this.canvas.height - y, Math.round(r.h));
    this.render(false);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d')!.drawImage(this.canvas, x, y, w, h, 0, 0, w, h);
    this.push();
    this.cropDraft = null;
    this.cropStart = null;
    this.setBase(c);
    this.shapes = [];
    this.render();
    this.onChange();
  }

  render(ui = true) {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(this.base, 0, 0);
    for (const s of this.shapes) this.draw(s);
    if (ui && this.draft) this.draw(this.draft);
    if (ui && this.cropDraft) this.drawCrop(this.cropDraft);
  }

  private drawCrop(r: Rect) {
    const { ctx, canvas } = this;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.fillRect(0, 0, canvas.width, r.y);
    ctx.fillRect(0, r.y, r.x, r.h);
    ctx.fillRect(r.x + r.w, r.y, canvas.width - r.x - r.w, r.h);
    ctx.fillRect(0, r.y + r.h, canvas.width, canvas.height - r.y - r.h);
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = Math.max(2, canvas.width / 600);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.restore();
  }

  private pixelate(r: Rect) {
    const { ctx, canvas } = this;
    const x = Math.max(0, Math.floor(r.x)),
      y = Math.max(0, Math.floor(r.y));
    const w = Math.min(canvas.width - x, Math.ceil(r.w)),
      h = Math.min(canvas.height - y, Math.ceil(r.h));
    if (w < 2 || h < 2) return;
    const block = Math.max(8, Math.round(Math.max(canvas.width, canvas.height) / 160));
    const tw = Math.max(1, Math.round(w / block)),
      th = Math.max(1, Math.round(h / block));
    const tmp = document.createElement('canvas');
    tmp.width = tw;
    tmp.height = th;
    tmp.getContext('2d')!.drawImage(canvas, x, y, w, h, 0, 0, tw, th);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, tw, th, x, y, w, h);
    ctx.restore();
  }

  private draw(s: Shape) {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const applyEffects = (color: string, opacity?: number, shadow?: boolean) => {
      ctx.globalAlpha = opacity != null ? opacity : 1;
      if (shadow) {
        ctx.shadowColor = 'rgba(0,0,0,0.45)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
      }
    };

    switch (s.t) {
      case 'pen':
        applyEffects(s.color, s.opacity, s.shadow);
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.width;
        ctx.beginPath();
        s.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        ctx.stroke();
        break;
      case 'line':
      case 'arrow': {
        applyEffects(s.color, s.opacity, s.shadow);
        ctx.strokeStyle = s.color;
        ctx.fillStyle = s.color;
        ctx.lineWidth = s.width;
        ctx.beginPath();
        ctx.moveTo(s.a[0], s.a[1]);
        ctx.lineTo(s.b[0], s.b[1]);
        ctx.stroke();
        if (s.t === 'arrow') {
          const ang = Math.atan2(s.b[1] - s.a[1], s.b[0] - s.a[0]),
            L = Math.max(14, s.width * 4.5);
          ctx.beginPath();
          ctx.moveTo(s.b[0], s.b[1]);
          ctx.lineTo(s.b[0] - L * Math.cos(ang - Math.PI / 7), s.b[1] - L * Math.sin(ang - Math.PI / 7));
          ctx.lineTo(s.b[0] - L * Math.cos(ang + Math.PI / 7), s.b[1] - L * Math.sin(ang + Math.PI / 7));
          ctx.closePath();
          ctx.fill();
        }
        break;
      }
      case 'rect': {
        applyEffects(s.color, s.opacity, s.shadow);
        const r = norm(s.a, s.b);
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.width;
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        break;
      }
      case 'ellipse': {
        applyEffects(s.color, s.opacity, s.shadow);
        const r = norm(s.a, s.b);
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.width;
        ctx.beginPath();
        ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'highlight': {
        const r = norm(s.a, s.b);
        ctx.globalAlpha = s.opacity || 0.35;
        ctx.fillStyle = s.color;
        ctx.fillRect(r.x, r.y, r.w, r.h);
        break;
      }
      case 'redact': {
        const r = norm(s.a, s.b);
        ctx.fillStyle = '#000';
        ctx.fillRect(r.x, r.y, r.w, r.h);
        break;
      }
      case 'pixelate':
        this.pixelate(norm(s.a, s.b));
        break;
      case 'text': {
        applyEffects(s.color, s.opacity, s.shadow);
        ctx.font = `600 ${s.size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
        ctx.textBaseline = 'top';
        s.text.split('\n').forEach((line, i) => {
          const y = s.at[1] + i * s.size * 1.25;
          ctx.lineWidth = Math.max(2, s.size / 5);
          ctx.strokeStyle = '#fff';
          ctx.strokeText(line, s.at[0], y);
          ctx.fillStyle = s.color;
          ctx.fillText(line, s.at[0], y);
        });
        break;
      }
      case 'badge':
        applyEffects(s.color, 1, s.shadow);
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.at[0], s.at[1], s.size * 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `700 ${s.size}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(s.n), s.at[0], s.at[1] + 1);
        break;
    }
    ctx.restore();
  }

  async toBlob(type = 'image/png', q?: number): Promise<Blob> {
    this.render(false);
    const b = await new Promise<Blob | null>((r) => this.canvas.toBlob(r, type, q));
    this.render(true);
    if (!b) throw new Error('Không xuất được ảnh.');
    return b;
  }

  async exportForUpload(maxBytes: number, maxPixels: number): Promise<{ blob: Blob; ext: 'png' | 'jpg' }> {
    this.render(false);
    try {
      const w = this.canvas.width,
        h = this.canvas.height;
      const base = w * h > maxPixels ? Math.sqrt(maxPixels / (w * h)) * 0.98 : 1;
      const make = (sc: number, type: string, q?: number) => {
        const c = document.createElement('canvas');
        c.width = Math.floor(w * sc);
        c.height = Math.floor(h * sc);
        c.getContext('2d')!.drawImage(this.canvas, 0, 0, c.width, c.height);
        return new Promise<Blob | null>((r) => c.toBlob(r, type, q));
      };
      const png = await make(base, 'image/png');
      if (png && png.size <= maxBytes) return { blob: png, ext: 'png' };
      for (let sc = base; sc > 0.3; sc *= 0.85) {
        const j = await make(sc, 'image/jpeg', 0.9);
        if (j && j.size <= maxBytes) return { blob: j, ext: 'jpg' };
      }
      throw new Error('Không nén được ảnh xuống dưới giới hạn 20 MB của Shopify.');
    } finally {
      this.render(true);
    }
  }
}
