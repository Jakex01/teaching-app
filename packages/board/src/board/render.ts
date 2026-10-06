import { FONT } from '../constants';
import type { BoardElement, SectionEl, StrokeEl, TaskCardEl } from '../protocol';
import { CARD, HINT, SECTION, cardDrawButton, clamp, hintLayout, solutionArea, triPts } from './geometry';
import { getStroke } from 'perfect-freehand';
import { getImage } from './images';

export interface Camera { x: number; y: number; z: number }

export function drawGrid(ctx: CanvasRenderingContext2D, cam: Camera, w: number, h: number) {
  ctx.fillStyle = '#FFF6E5';
  ctx.fillRect(0, 0, w, h);
  // Dot grid that adapts to zoom level
  let step = 32;
  while (step * cam.z < 18) step *= 2;
  while (step * cam.z > 60) step /= 2;
  const s = step * cam.z;
  const ox = -((cam.x * cam.z) % s);
  const oy = -((cam.y * cam.z) % s);
  const r = clamp(1.6 * Math.sqrt(cam.z), 1, 2.4);
  ctx.fillStyle = '#E6D5B8';
  for (let x = ox - s; x < w + s; x += s) {
    for (let y = oy - s; y < h + s; y += s) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function tint(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function drawElement(ctx: CanvasRenderingContext2D, el: BoardElement, onImageLoad: () => void = () => {}) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (el.type !== 'image') {
    ctx.strokeStyle = el.color;
    ctx.fillStyle = el.color;
  }
  switch (el.type) {
    case 'image': {
      ctx.translate(el.x + el.w / 2, el.y + el.h / 2);
      ctx.rotate(el.rot);
      const img = getImage(el.src, onImageLoad);
      if (img.status === 'ready') {
        ctx.drawImage(img.image, -el.w / 2, -el.h / 2, el.w, el.h);
      } else {
        // Placeholder while loading (or if the file can't be shown).
        ctx.fillStyle = img.status === 'error' ? '#F3E3E0' : '#F3EBDD';
        ctx.strokeStyle = '#E6D5B8';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.roundRect(-el.w / 2, -el.h / 2, el.w, el.h, 8);
        ctx.fill();
        ctx.stroke();
      }
      break;
    }
    case 'stroke': {
      if (el.hl) {
        // Highlighter: an even, see-through band.
        ctx.lineWidth = el.size;
        ctx.globalAlpha = 0.38; ctx.globalCompositeOperation = 'multiply';
        const p = el.pts;
        if (p.length === 1) { ctx.beginPath(); ctx.arc(p[0][0], p[0][1], el.size / 2, 0, Math.PI * 2); ctx.fill(); break; }
        ctx.beginPath();
        ctx.moveTo(p[0][0], p[0][1]);
        for (let i = 1; i < p.length - 1; i++) {
          const mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2;
          ctx.quadraticCurveTo(p[i][0], p[i][1], mx, my);
        }
        ctx.lineTo(p[p.length - 1][0], p[p.length - 1][1]);
        ctx.stroke();
        break;
      }
      // Pen: smoothed ink with tapered ends and varying width (pen pressure, or speed for a mouse/finger).
      ctx.fill(inkPath(el));
      break;
    }
    case 'rect': case 'ellipse': case 'triangle': {
      if (el.rot) {
        ctx.translate(el.x + el.w / 2, el.y + el.h / 2);
        ctx.rotate(el.rot);
        ctx.translate(-(el.x + el.w / 2), -(el.y + el.h / 2));
      }
      ctx.lineWidth = el.size;
      ctx.beginPath();
      if (el.type === 'rect') {
        ctx.roundRect(el.x, el.y, el.w, el.h, Math.min(14, el.w / 4, el.h / 4));
      } else if (el.type === 'ellipse') {
        ctx.ellipse(el.x + el.w / 2, el.y + el.h / 2, el.w / 2, el.h / 2, 0, 0, Math.PI * 2);
      } else {
        const [a, b, c] = triPts(el);
        ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...c); ctx.closePath();
      }
      if (el.fill) { ctx.fillStyle = tint(el.color, 0.28); ctx.fill(); }
      ctx.stroke();
      break;
    }
    case 'line': case 'arrow': {
      ctx.lineWidth = el.size;
      ctx.beginPath();
      ctx.moveTo(el.x1, el.y1);
      ctx.lineTo(el.x2, el.y2);
      ctx.stroke();
      if (el.type === 'arrow') {
        const ang = Math.atan2(el.y2 - el.y1, el.x2 - el.x1);
        const len = Math.max(12, el.size * 3.2);
        ctx.beginPath();
        ctx.moveTo(el.x2 - len * Math.cos(ang - 0.5), el.y2 - len * Math.sin(ang - 0.5));
        ctx.lineTo(el.x2, el.y2);
        ctx.lineTo(el.x2 - len * Math.cos(ang + 0.5), el.y2 - len * Math.sin(ang + 0.5));
        ctx.stroke();
      }
      break;
    }
    case 'task': drawTaskCard(ctx, el); break;
    case 'section': drawSection(ctx, el); break;
    case 'text': {
      ctx.font = `600 ${el.fs}px ${FONT}`;
      ctx.textBaseline = 'top';
      el.text.split('\n').forEach((line, i) => ctx.fillText(line, el.x, el.y + i * el.fs * 1.25 + el.fs * 0.08));
      break;
    }
  }
  ctx.restore();
}

/** A task card: tinted background, the label in a pill, an arrow from the task to a white solution area. */
function drawTaskCard(ctx: CanvasRenderingContext2D, el: TaskCardEl) {
  ctx.lineWidth = 2.5;
  ctx.fillStyle = tint(el.color, 0.16);
  ctx.strokeStyle = tint(el.color, 0.85);
  ctx.beginPath();
  ctx.roundRect(el.x, el.y, el.w, el.h, 22);
  ctx.fill();
  ctx.stroke();

  // Label pill
  ctx.font = `700 20px ${FONT}`;
  ctx.textBaseline = 'middle';
  const labelW = ctx.measureText(el.label).width + 28;
  ctx.fillStyle = el.color;
  ctx.strokeStyle = '#1E1B3A';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(el.x + CARD.pad, el.y + 9, labelW, 30, 15);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#1E1B3A';
  ctx.fillText(el.label, el.x + CARD.pad + 14, el.y + 25);

  // Solution area
  const a = solutionArea(el);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.strokeStyle = tint(el.color, 0.85);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(a.x1, a.y1, a.x2 - a.x1, a.y2 - a.y1, 14);
  ctx.fill();
  ctx.stroke();
  ctx.font = `600 16px ${FONT}`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(30,27,58,0.42)';
  ctx.fillText('Rozwiązanie', a.x1 + 14, a.y1 + 12);

  // "✨ Rysunek": a figure drawn by AI, straight into this solution area
  const db = cardDrawButton(el);
  if (db.x1 > a.x1 + 130) {
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = tint(el.color, 0.9);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(db.x1, db.y1, db.x2 - db.x1, db.y2 - db.y1, 15);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1E1B3A';
    ctx.font = `700 14px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.fillText('✨ Rysunek', db.x1 + 14, (db.y1 + db.y2) / 2 + 1);
    ctx.textBaseline = 'top';
  }

  // Hints under the task, and the button for the next one
  const layout = hintLayout(el);
  ctx.textBaseline = 'top';
  for (const box of layout.boxes) {
    ctx.fillStyle = '#FFF4CC';
    ctx.strokeStyle = tint(el.color, 0.9);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1E1B3A';
    ctx.font = `700 15px ${FONT}`;
    ctx.fillText(`💡${box.n}`, box.x + 8, box.y + HINT.pad + 2);
    ctx.font = `${HINT.font} ${FONT}`;
    box.lines.forEach((line, i) => ctx.fillText(line, box.x + HINT.pad + 30, box.y + HINT.pad + i * HINT.line + 2));
  }
  if (layout.button) {
    const b = layout.button;
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#1E1B3A';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1, 18);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1E1B3A';
    ctx.font = `700 15px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(b.label, b.x1 + 14, (b.y1 + b.y2) / 2 + 1);
  }

  // Arrow: task → solution
  const ay = a.y1 + 26, ax1 = a.x1 - CARD.gap + 12, ax2 = a.x1 - 10;
  ctx.strokeStyle = tint(el.color, 1);
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(ax1, ay); ctx.lineTo(ax2, ay);
  ctx.moveTo(ax2 - 9, ay - 7); ctx.lineTo(ax2, ay); ctx.lineTo(ax2 - 9, ay + 7);
  ctx.stroke();
}

// Outline of a pen stroke, cached until its points change (drawing adds points, moving replaces the array).
const inkCache = new WeakMap<StrokeEl, { pts: StrokeEl['pts']; n: number; path: Path2D }>();

function inkPath(el: StrokeEl): Path2D {
  const hit = inkCache.get(el);
  if (hit && hit.pts === el.pts && hit.n === el.pts.length) return hit.path;
  const pressure = el.pts.some(p => p.length === 3);
  const outline = getStroke(el.pts, {
    size: el.size * 1.5,
    thinning: pressure ? 0.6 : 0.25, // speed-based width (mouse, finger) varies less than real pen pressure
    smoothing: 0.6,
    streamline: 0.5,
    simulatePressure: !pressure,
    start: { taper: el.size * 2, cap: true },
    end: { taper: el.size * 2, cap: true },
  });
  const path = new Path2D();
  if (outline.length) {
    path.moveTo(outline[0][0], outline[0][1]);
    for (let i = 1; i < outline.length - 1; i++) {
      const [x0, y0] = outline[i], [x1, y1] = outline[i + 1];
      path.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
    }
    path.closePath();
  }
  inkCache.set(el, { pts: el.pts, n: el.pts.length, path });
  return path;
}

/** A section: a large frame with a coloured title band. */
function drawSection(ctx: CanvasRenderingContext2D, el: SectionEl) {
  ctx.fillStyle = tint(el.color, 0.06);
  ctx.strokeStyle = tint(el.color, 0.55);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(el.x, el.y, el.w, el.h, 28);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = tint(el.color, 0.22);
  ctx.beginPath();
  ctx.roundRect(el.x, el.y, el.w, SECTION.header, [28, 28, 0, 0]);
  ctx.fill();
  ctx.fillStyle = '#1E1B3A';
  ctx.font = `700 34px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(`📁 ${el.title}`, el.x + 28, el.y + SECTION.header / 2 + 2, el.w - 56);
}
