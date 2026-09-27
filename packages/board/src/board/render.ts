import { FONT } from '../constants';
import type { BoardElement } from '../protocol';
import { clamp, triPts } from './geometry';
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
      ctx.lineWidth = el.size;
      if (el.hl) { ctx.globalAlpha = 0.38; ctx.globalCompositeOperation = 'multiply'; }
      const p = el.pts;
      if (p.length === 1) {
        ctx.beginPath(); ctx.arc(p[0][0], p[0][1], el.size / 2, 0, Math.PI * 2); ctx.fill();
        break;
      }
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
    case 'rect': case 'ellipse': case 'triangle': {
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
    case 'text': {
      ctx.font = `600 ${el.fs}px ${FONT}`;
      ctx.textBaseline = 'top';
      el.text.split('\n').forEach((line, i) => ctx.fillText(line, el.x, el.y + i * el.fs * 1.25 + el.fs * 0.08));
      break;
    }
  }
  ctx.restore();
}
