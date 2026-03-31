import { useState, useEffect, useRef, useCallback } from 'react';
import './RepertoireWizard.css';

const TOOLTIP_W = 360;
const TOOLTIP_H = 220;
const PAD = 16;

function computeTooltipPos(rect, preferRight) {
  let top, left;

  if (preferRight) {
    left = rect.x + rect.w + PAD;
    top  = rect.y;
    if (left + TOOLTIP_W > window.innerWidth - 20) {
      left = rect.x - TOOLTIP_W - PAD;
    }
  } else {
    top  = rect.y + rect.h + PAD;
    left = rect.x;
    if (top + TOOLTIP_H > window.innerHeight - 20) {
      top = rect.y - TOOLTIP_H - PAD;
    }
    if (left + TOOLTIP_W > window.innerWidth - 20) {
      left = rect.x + rect.w - TOOLTIP_W;
    }
  }

  return {
    top:  Math.max(8, top),
    left: Math.max(8, left),
  };
}

export default function RepertoireWizard({ steps, stepIndex, onAdvance, onDismiss }) {
  const [spotlightRect, setSpotlightRect] = useState(null);
  const [displayRect, setDisplayRect]     = useState(null);
  const rafRef     = useRef(null);
  const targetRect = useRef(null);
  const mainRef    = useRef(null);

  const readRect = useCallback((step) => {
    if (!step) return;
    const el = document.querySelector(step.selector);
    if (!el) return;
    const r  = el.getBoundingClientRect();
    const p  = step.padding ?? 12;
    targetRect.current = {
      x: r.left - p,
      y: r.top  - p,
      w: r.width  + p * 2,
      h: r.height + p * 2,
    };
    setSpotlightRect({ ...targetRect.current });
  }, []);

  // Read rect after step changes — give step 0 extra time to let the scroll settle
  useEffect(() => {
    const step = steps[stepIndex];
    if (!step) return;
    const delay = stepIndex === 0 ? 650 : 350;
    const timer = setTimeout(() => readRect(step), delay);
    return () => clearTimeout(timer);
  }, [stepIndex, steps, readRect]);

  // ResizeObserver on document body to recompute on layout changes
  useEffect(() => {
    const step = steps[stepIndex];
    if (!step) return;
    const ro = new ResizeObserver(() => readRect(step));
    ro.observe(document.body);
    return () => ro.disconnect();
  }, [stepIndex, steps, readRect]);

  // On mount: scroll the panel group into view, then lock scroll after it settles
  useEffect(() => {
    const card = document.querySelector('.add-form');
    if (card) {
      const top = window.scrollY + card.getBoundingClientRect().top - 24;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }

    const prev = document.body.style.overflow;
    const lockTimer = setTimeout(() => {
      document.body.style.overflow = 'hidden';
    }, 500);

    return () => {
      clearTimeout(lockTimer);
      document.body.style.overflow = prev;
    };
  }, []);

  // Lerp animation: smoothly slide displayRect toward spotlightRect
  useEffect(() => {
    if (!spotlightRect) return;

    if (!displayRect) {
      setDisplayRect({ ...spotlightRect });
      return;
    }

    let current = { ...displayRect };
    const FACTOR = 0.18;

    function lerp(a, b) { return a + (b - a) * FACTOR; }

    function tick() {
      const dx = Math.abs(current.x - spotlightRect.x);
      const dy = Math.abs(current.y - spotlightRect.y);
      const dw = Math.abs(current.w - spotlightRect.w);
      const dh = Math.abs(current.h - spotlightRect.h);

      if (dx < 0.5 && dy < 0.5 && dw < 0.5 && dh < 0.5) {
        setDisplayRect({ ...spotlightRect });
        return;
      }

      current = {
        x: lerp(current.x, spotlightRect.x),
        y: lerp(current.y, spotlightRect.y),
        w: lerp(current.w, spotlightRect.w),
        h: lerp(current.h, spotlightRect.h),
      };
      setDisplayRect({ ...current });
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotlightRect]);

  const step = steps[stepIndex];
  if (!step || stepIndex >= steps.length) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const r = displayRect ?? { x: vw / 2 - 200, y: vh / 2 - 200, w: 400, h: 400 };
  const tooltipPos = computeTooltipPos(r, step.tooltipPreferRight);
  const isLast = stepIndex === steps.length - 1;

  return (
    <>
      {/* SVG overlay */}
      <svg
        className="rw-overlay-svg"
        width={vw}
        height={vh}
        viewBox={`0 0 ${vw} ${vh}`}
      >
        <defs>
          <clipPath id="rw-clip" clipPathUnits="userSpaceOnUse">
            <rect x={0} y={0} width={vw} height={vh} />
            <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={10} />
          </clipPath>
        </defs>

        {/* Dark overlay with hole */}
        <rect
          x={0} y={0} width={vw} height={vh}
          fill="rgba(0,0,0,0.82)"
          clipPath="url(#rw-clip)"
          fillRule="evenodd"
          style={{ pointerEvents: 'all' }}
        />

        {/* Transparent passthrough so user can interact with spotlit element */}
        <rect
          x={r.x} y={r.y} width={r.w} height={r.h}
          fill="transparent"
          style={{ pointerEvents: 'none' }}
        />

        {/* Gold ring */}
        <rect
          x={r.x} y={r.y} width={r.w} height={r.h}
          rx={10}
          fill="none"
          stroke="#c9a84c"
          strokeWidth={2}
          className="rw-spotlight-ring"
          style={{ pointerEvents: 'none' }}
        />
      </svg>

      {/* Floating tooltip */}
      <div
        key={stepIndex}
        className="rw-tooltip rw-enter"
        style={{ top: tooltipPos.top, left: tooltipPos.left }}
      >
        <div className="rw-step-label">Step {stepIndex + 1} / {steps.length}</div>
        <div className="rw-title">{step.title}</div>
        <p className="rw-body">{step.body}</p>
        <div className="rw-footer">
          <button className="rw-btn-skip" onClick={onDismiss}>
            Skip wizard
          </button>
          <div className="rw-dots">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`rw-dot${i === stepIndex ? ' rw-dot-active' : ''}`}
              />
            ))}
          </div>
          <button className="rw-btn-next" onClick={isLast ? onDismiss : onAdvance}>
            {isLast ? 'Done ✓' : 'Next →'}
          </button>
        </div>
      </div>
    </>
  );
}
