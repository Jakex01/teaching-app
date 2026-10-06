import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { engine } from '../board/engine';
import { clamp } from '../board/geometry';
import { COLORS, SIZE_NAMES, TOOLS, toolDef, type SizeIndex } from '../constants';
import { useUI } from '../store';
import { FillIcon, MinusIcon, PlusIcon, RedoIcon, ToolIcon, UndoIcon } from './Icons';

type CssVars = CSSProperties & Record<`--${string}`, string>;

export function Dock() {
  const tool = useUI(s => s.tool);
  return (
    <nav className="dock card">
      {TOOLS.map((t, i) => t === 'sep' ? <span key={`sep${i}`} className="dock-sep" /> : (
        <button
          key={t.id}
          className={`tool${tool === t.id ? ' active' : ''}`}
          data-tool={t.id}
          aria-label={t.label}
          style={{ '--tc': t.color, ...(t.fg ? { '--tcf': t.fg } : {}) } as CssVars}
          onClick={() => engine.setTool(t.id)}
        >
          <ToolIcon id={t.id} />
          <span className="key">{t.key}</span>
          <span className="tip">{t.label} · {t.key}</span>
        </button>
      ))}
    </nav>
  );
}

const PEN_LABELS = { soft: 'delikatny', normal: 'normalny', firm: 'mocny' } as const;

export function StyleBubble() {
  const tool = useUI(s => s.tool);
  const pen = useUI(s => s.pen);
  const style = useUI(s => s.style);
  const selection = useUI(s => s.selection);
  const ref = useRef<HTMLDivElement>(null);
  const [arrowX, setArrowX] = useState<number | null>(null);

  const def = toolDef(tool);
  const forSelection = tool === 'select' && selection.styleable;
  const show = !!def?.style || forSelection;
  const hasFill = !!def?.fill || (forSelection && selection.hasShape);
  const color = tool === 'highlighter' ? style.hlColor : style.color;

  // Point the bubble's arrow at the active tool
  useLayoutEffect(() => {
    const btn = document.querySelector(`.tool[data-tool="${tool}"]`);
    if (!show || !btn || !ref.current) return;
    const br = ref.current.getBoundingClientRect();
    const tr = btn.getBoundingClientRect();
    setArrowX(clamp(tr.left + tr.width / 2 - br.left, 20, br.width - 20));
  }, [tool, show, hasFill]);

  return (
    <div
      ref={ref}
      className={`style-bubble card${show ? ' show' : ''}${hasFill ? ' has-fill' : ''}`}
      style={arrowX == null ? undefined : ({ '--arrow-x': `${arrowX}px` } as CssVars)}
    >
      <div className="swatches">
        {COLORS.map(({ name, c }) => (
          <button key={c} className={`swatch${c === color ? ' active' : ''}`} title={name} aria-label={name}
            style={{ '--c': c } as CssVars} onClick={() => engine.setColor(c)} />
        ))}
      </div>
      <div className="divider" />
      <div className="sizes">
        {SIZE_NAMES.map((name, i) => (
          <button key={name} className={`size${i === style.size ? ' active' : ''}`} title={name} aria-label={name}
            onClick={() => engine.setSize(i as SizeIndex)}>
            <i style={{ width: 4 + i * 5, height: 4 + i * 5 }} />
          </button>
        ))}
      </div>
      {pen.seen && def?.id === 'pen' && (
        <>
          <div className="divider" />
          <div className="pen-panel" title={pen.pressureWorks ? 'Nacisk rysika działa' : 'Rysik bez nacisku: sprawdź sterownik tabletu (Windows Ink / uprawnienia na Macu)'}>
            <span className={`pen-dot${pen.pressureWorks ? ' ok' : ''}`} aria-hidden="true" />
            {(['soft', 'normal', 'firm'] as const).map(s => (
              <button key={s} className={`pen-level${pen.sensitivity === s ? ' active' : ''}`} onClick={() => engine.setPenSensitivity(s)}
                aria-label={`Czułość nacisku: ${PEN_LABELS[s]}`} title={`Czułość nacisku: ${PEN_LABELS[s]}`}>
                {PEN_LABELS[s]}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="divider fill-only" />
      <button className={`fill-toggle fill-only${style.fill ? ' active' : ''}`} title="Fill shapes" aria-label="Fill shapes"
        style={{ '--fillc': color } as CssVars} onClick={engine.toggleFill}>
        <FillIcon />
      </button>
    </div>
  );
}

export function History() {
  const canUndo = useUI(s => s.canUndo);
  const canRedo = useUI(s => s.canRedo);
  return (
    <div className="history card">
      <button className="icon-btn" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!canUndo} onClick={engine.undo}><UndoIcon /></button>
      <button className="icon-btn" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={!canRedo} onClick={engine.redo}><RedoIcon /></button>
    </div>
  );
}

export function Zoom() {
  const z = useUI(s => s.cam.z);
  return (
    <div className="zoom card">
      <button className="icon-btn" title="Zoom out (−)" aria-label="Zoom out" onClick={() => engine.zoomBy(0.8)}><MinusIcon /></button>
      <button className="zoom-level" title="Reset view (0)" onClick={engine.resetView}>{Math.round(z * 100)}%</button>
      <button className="icon-btn" title="Zoom in (+)" aria-label="Zoom in" onClick={() => engine.zoomBy(1.25)}><PlusIcon /></button>
    </div>
  );
}
