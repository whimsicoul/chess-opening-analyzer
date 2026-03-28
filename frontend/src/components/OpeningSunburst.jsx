import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import * as d3 from 'd3';
import './OpeningSunburst.css';

// ── Layout constants ──────────────────────────────────────────────────────────
const OUTER_R  = 220;
const INNER_R  = 52;
const SVG_SIZE = (OUTER_R + 20) * 2;
const CENTER   = SVG_SIZE / 2;
const MAX_DEPTH = 8;
const RING_W   = (OUTER_R - INNER_R) / MAX_DEPTH; // ~21 px per ring

// Control points: [winRate, hue, baseLgt] — sorted descending
// Interpolates smoothly between bands rather than jumping.
const WR_STOPS = [
  [60, 120, 16], // super dark green
  [55, 112, 28], // normal green
  [50, 88,  36], // light green
  [48, 52,  36], // yellow
  [45, 22,  32], // orange
  [40, 0,   28], // red
];

function wrBand(wr) {
  if (wr >= WR_STOPS[0][0]) return { hue: WR_STOPS[0][1], baseLgt: WR_STOPS[0][2] };
  const last = WR_STOPS[WR_STOPS.length - 1];
  if (wr <= last[0]) return { hue: last[1], baseLgt: last[2] };
  for (let i = 0; i < WR_STOPS.length - 1; i++) {
    const [wr1, h1, l1] = WR_STOPS[i];
    const [wr2, h2, l2] = WR_STOPS[i + 1];
    if (wr <= wr1 && wr >= wr2) {
      const t = (wr1 - wr) / (wr1 - wr2);
      return { hue: Math.round(h1 + (h2 - h1) * t), baseLgt: l1 + (l2 - l1) * t };
    }
  }
  return { hue: 0, baseLgt: 28 };
}

function segColor(nodeId, depth, x0, x1, winRates, bright) {
  const stats = winRates?.[nodeId];

  if (!stats) {
    const lgt = bright ? Math.max(22, 32 - depth * 1.5) : Math.max(14, 22 - depth * 1.5);
    return `hsl(220, 12%, ${lgt}%)`;
  }

  const { hue, baseLgt } = wrBand(stats.winRate);
  const sat = bright ? 62 : 48;
  const lgt = bright
    ? Math.max(baseLgt, baseLgt + 8 - depth * 1.5)
    : Math.max(baseLgt - 10, baseLgt - depth * 1.5);

  return `hsl(${hue}, ${sat}%, ${lgt}%)`;
}

// ── D3 helpers ────────────────────────────────────────────────────────────────
function buildHierarchy(data) {
  const h = d3
    .hierarchy(data)
    .sum(() => 1)
    .sort((a, b) => (a.data.name ?? '').localeCompare(b.data.name ?? ''));
  d3.partition().size([2 * Math.PI, 1])(h);
  return h;
}

function arcPath(startA, endA, innerR, outerR) {
  const gap = Math.min(0.009, (endA - startA) * 0.08);
  const sa  = startA + gap;
  const ea  = endA   - gap;
  if (ea <= sa) return '';
  return d3.arc()({
    startAngle:  sa,
    endAngle:    ea,
    innerRadius: Math.max(0, innerR),
    outerRadius: Math.max(0, outerR),
  }) ?? '';
}

function getMovePath(node) {
  // ancestors() goes from node → root; reverse and skip root ('start')
  return node.ancestors().reverse().slice(1).map(n => n.data.name);
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function OpeningSunburst({ data, onActivePath, winRates = {} }) {
  const wrapperRef = useRef(null);

  const [focusNode, setFocusNode] = useState(null); // null = tree root
  const [hovered,   setHovered  ] = useState(null);
  const [selected,  setSelected ] = useState(null);
  const [tipPos,    setTipPos   ] = useState(null); // {x,y} in wrapper px

  const root  = useMemo(() => (data ? buildHierarchy(data) : null), [data]);
  const focus = focusNode ?? root;

  // Report active path to parent whenever hover/selection changes
  const activeNode = hovered ?? selected;
  useEffect(() => {
    if (!onActivePath) return;
    if (!activeNode) { onActivePath([], null); return; }
    onActivePath(getMovePath(activeNode), activeNode.data);
  }, [activeNode, onActivePath]);

  // xScale: maps d.x0/x1 (partition angles) to [0, 2π] within current focus
  const xScale = useMemo(
    () => focus
      ? d3.scaleLinear().domain([focus.x0, focus.x1]).range([0, 2 * Math.PI])
      : null,
    [focus],
  );

  // Precompute arc data for all visible nodes
  const arcs = useMemo(() => {
    if (!focus || !xScale) return [];
    return focus
      .descendants()
      .filter(d => {
        if (d === focus) return false;
        const rel = d.depth - focus.depth;
        if (rel < 1 || rel > MAX_DEPTH) return false;
        // Skip arcs too thin to be interactive
        const span = ((d.x1 - d.x0) / (focus.x1 - focus.x0)) * 2 * Math.PI;
        return span > 0.006;
      })
      .map(d => {
        const rel    = d.depth - focus.depth;
        const startA = xScale(d.x0);
        const endA   = xScale(d.x1);
        const iR     = INNER_R + (rel - 1) * RING_W;
        const oR     = INNER_R + rel * RING_W - 1.5;
        const path   = arcPath(startA, endA, iR, oR);
        return path ? { node: d, path, hasKids: !!(d.children?.length) } : null;
      })
      .filter(Boolean);
  }, [focus, xScale]);

  // Breadcrumb: path from root down to current focus
  const crumbs = useMemo(
    () => (!focus || !root || focus === root)
      ? []
      : focus.ancestors().reverse().slice(1),
    [focus, root],
  );

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleMouseEnter = useCallback(d => setHovered(d), []);
  const handleMouseLeave = useCallback(() => {
    setHovered(null);
    setTipPos(null);
  }, []);
  const handleMouseMove = useCallback(e => {
    if (!wrapperRef.current) return;
    const r = wrapperRef.current.getBoundingClientRect();
    setTipPos({ x: e.clientX - r.left, y: e.clientY - r.top });
  }, []);

  const handleArcClick = useCallback(d => {
    setSelected(prev => (prev === d ? null : d));
    if (d.children?.length) setFocusNode(d);
  }, []);

  const goBack = useCallback(() => {
    if (!focus || focus === root) return;
    const parent = focus.parent;
    setFocusNode(parent === root ? null : parent);
  }, [focus, root]);

  const goToRoot = useCallback(() => {
    setFocusNode(null);
    setSelected(null);
  }, []);

  if (!root) return null;

  const isZoomed = focus !== root;

  return (
    <div className="sunburst-wrap" ref={wrapperRef}>

      {/* ── Breadcrumb ─────────────────────────────────────────────────────── */}
      <div className="sunburst-crumbs">
        <button className="crumb crumb-home" onClick={goToRoot}>Start</button>
        {crumbs.map((n, i) => (
          <span key={n.data.id ?? i} className="crumb-seg">
            <span className="crumb-arr">›</span>
            <button
              className="crumb"
              onClick={() => {
                setFocusNode(n === root ? null : n);
                setSelected(n);
              }}
            >
              {n.data.name}
            </button>
          </span>
        ))}
      </div>

      {/* ── Sunburst SVG ───────────────────────────────────────────────────── */}
      <svg
        viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
        className="sunburst-svg"
        onMouseMove={hovered ? handleMouseMove : undefined}
      >
        {/* Arcs */}
        <g>
          {arcs.map(({ node: d, path, hasKids }) => {
            const isHov  = hovered === d;
            const isSel  = selected === d;
            const inPath = selected ? selected.ancestors().includes(d) : false;
            const bright = isHov || isSel || inPath;
            return (
              <path
                key={d.data.id ?? `${d.depth}-${d.x0.toFixed(5)}`}
                d={path}
                fill={segColor(d.data.id, d.depth, d.x0, d.x1, winRates, bright)}
                stroke={bright ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)'}
                strokeWidth={0.5}
                transform={`translate(${CENTER},${CENTER})`}
                style={{ cursor: hasKids ? 'pointer' : 'default', transition: 'fill 0.12s' }}
                onMouseEnter={() => handleMouseEnter(d)}
                onMouseLeave={handleMouseLeave}
                onClick={() => handleArcClick(d)}
              />
            );
          })}
        </g>

        {/* Center hole — click to go back when zoomed */}
        <circle
          cx={CENTER} cy={CENTER} r={INNER_R - 3}
          fill="#12162a"
          stroke={isZoomed ? '#2a3060' : '#181e36'}
          strokeWidth={1.5}
          style={{ cursor: isZoomed ? 'pointer' : 'default' }}
          onClick={isZoomed ? goBack : undefined}
        />

        {/* Center label */}
        <text
          x={CENTER} y={CENTER + (isZoomed ? 5 : 9)}
          textAnchor="middle"
          fill={isZoomed ? '#c8cce0' : '#30395e'}
          fontSize={isZoomed ? 13 : 26}
          fontFamily="inherit"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {isZoomed ? focus.data.name : '♟'}
        </text>
        {isZoomed && (
          <text
            x={CENTER} y={CENTER + 20}
            textAnchor="middle"
            fill="#30395e" fontSize={9} fontFamily="inherit"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            ← back
          </text>
        )}

        {/* Depth ring labels */}
        {!isZoomed && [1, 3, 5].map(depth => {
          const r = INNER_R + (depth - 0.5) * RING_W;
          const label = depth === 1 ? 'Early' : depth === 3 ? 'Mid' : 'Deep';
          return (
            <text
              key={depth}
              x={CENTER + r}
              y={CENTER}
              textAnchor="start"
              fill="rgba(255,255,255,0.10)"
              fontSize={8}
              fontFamily="inherit"
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {label}
            </text>
          );
        })}
      </svg>

      {/* ── Tooltip ────────────────────────────────────────────────────────── */}
      {hovered && tipPos && (
        <div
          className="sunburst-tip"
          style={{ left: tipPos.x + 14, top: tipPos.y - 14 }}
        >
          <div className="st-move">{hovered.data.name}</div>
          {hovered.data.opening_name && (
            <div className="st-name">{hovered.data.opening_name}</div>
          )}
          {hovered.data.eco_code && (
            <span className="badge badge-eco">{hovered.data.eco_code}</span>
          )}
          {winRates[hovered.data.id] && (() => {
            const s = winRates[hovered.data.id];
            return (
              <div className="st-wr">
                <strong>{s.winRate.toFixed(1)}%</strong> win rate
                <span className="st-record">&nbsp;·&nbsp;{s.wins}W&nbsp;{s.draws}D&nbsp;{s.losses}L</span>
              </div>
            );
          })()}
          {hovered.children?.length > 0 && (
            <div className="st-hint">Click to zoom in ↗</div>
          )}
        </div>
      )}
    </div>
  );
}
