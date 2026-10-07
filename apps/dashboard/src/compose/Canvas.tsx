/**
 * SVG rendering of a drawing in screen pixels. Used by the editor (with a selection outline) and
 * by read-only previews. `render.ts` draws the same shapes on a 2D canvas for the flattened file.
 */
import type { ComponentChildren } from "preact";
import type { Shape } from "@fielder/vocab";
import { arrowHead, boundsPx, sizePx, strokePx, toPx, type CanvasRect } from "./geometry";
import { STENCIL_BOX, STENCIL_PATHS, STENCIL_STROKE } from "./stencils";

export const CANVAS_FONT = "'Atkinson Hyperlegible Next', system-ui, sans-serif";

/** SVG path data of a freehand stroke. */
export function pathD(points: readonly (readonly [number, number])[], c: CanvasRect): string {
  return points.map((p, i) => { const [x, y] = toPx(p as [number, number], c); return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`; }).join(" ");
}

/** Arrow head polygon points (px) at the end of a → b. */
export function arrowPoints(ax: number, ay: number, bx: number, by: number, strokeW: number): [number, number][] {
  const len = arrowHead(strokeW);
  const ang = Math.atan2(by - ay, bx - ax);
  const spread = 0.46;
  return [[bx, by], [bx - len * Math.cos(ang - spread), by - len * Math.sin(ang - spread)], [bx - len * Math.cos(ang + spread), by - len * Math.sin(ang + spread)]];
}

export function ShapeSvg({ s, c }: { s: Shape; c: CanvasRect }) {
  const sw = strokePx(s.width, c);
  const common = { stroke: s.color, "stroke-width": sw, fill: "none", opacity: s.opacity, "stroke-linecap": "round" as const, "stroke-linejoin": "round" as const };
  switch (s.type) {
    case "path": {
      if (s.points.length === 1) { const [x, y] = toPx(s.points[0], c); return <circle cx={x} cy={y} r={sw / 2} fill={s.color} opacity={s.opacity} />; }
      return <path d={pathD(s.points, c)} {...common} />;
    }
    case "line": { const [ax, ay] = toPx(s.from, c), [bx, by] = toPx(s.to, c); return <line x1={ax} y1={ay} x2={bx} y2={by} {...common} />; }
    case "arrow": {
      const [ax, ay] = toPx(s.from, c), [bx, by] = toPx(s.to, c);
      const head = arrowPoints(ax, ay, bx, by, sw);
      // The shaft stops short of the tip so the head's point stays sharp.
      const len = arrowHead(sw) * 0.6, ang = Math.atan2(by - ay, bx - ax);
      return (
        <g opacity={s.opacity}>
          <line x1={ax} y1={ay} x2={bx - len * Math.cos(ang)} y2={by - len * Math.sin(ang)} {...common} opacity={1} />
          <polygon points={head.map((p) => p.join(",")).join(" ")} fill={s.color} stroke={s.color} stroke-width={sw / 2} stroke-linejoin="round" />
        </g>
      );
    }
    case "rect": {
      const [ax, ay] = toPx(s.from, c), [bx, by] = toPx(s.to, c);
      return <rect x={Math.min(ax, bx)} y={Math.min(ay, by)} width={Math.abs(bx - ax)} height={Math.abs(by - ay)} {...common} fill={s.fill ? s.color : "none"} />;
    }
    case "ellipse": {
      const [ax, ay] = toPx(s.from, c), [bx, by] = toPx(s.to, c);
      return <ellipse cx={(ax + bx) / 2} cy={(ay + by) / 2} rx={Math.abs(bx - ax) / 2} ry={Math.abs(by - ay) / 2} {...common} fill={s.fill ? s.color : "none"} />;
    }
    case "text": {
      const [x, y] = toPx(s.at, c);
      const px = sizePx(s.size, c);
      return <text x={x} y={y} fill={s.color} opacity={s.opacity} font-family={CANVAS_FONT} font-weight="700" font-size={px} paint-order="stroke" stroke={s.color === "#0B0B0C" ? "#FFFFFF" : "#0B0B0C"} stroke-width={px * 0.08} stroke-linejoin="round">{s.text}</text>;
    }
    case "stencil": {
      const [x, y] = toPx(s.at, c);
      const k = sizePx(s.size, c) / STENCIL_BOX;
      return (
        <g transform={`translate(${x} ${y}) rotate(${s.rotation}) scale(${k}) translate(${-STENCIL_BOX / 2} ${-STENCIL_BOX / 2})`} opacity={s.opacity}>
          <path d={STENCIL_PATHS[s.stencil]} fill="none" stroke={s.color} stroke-width={STENCIL_STROKE} stroke-linecap="round" stroke-linejoin="round" />
        </g>
      );
    }
  }
}

/** All shapes of a drawing; `selected` gets a dashed outline. The <svg> itself is positioned by the caller. */
export function DrawingSvg({ shapes, c, width, height, selected, children, ...rest }: { shapes: readonly Shape[]; c: CanvasRect; width: number; height: number; selected?: string | null; children?: ComponentChildren } & Record<string, unknown>) {
  const sel = selected ? shapes.find((s) => s.id === selected) : null;
  const b = sel ? boundsPx(sel, c) : null;
  return (
    <svg class="compose__svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} {...rest}>
      {shapes.map((s) => <ShapeSvg key={s.id} s={s} c={c} />)}
      {b && <rect class="compose__sel" x={b.x} y={b.y} width={b.w} height={b.h} />}
      {children}
    </svg>
  );
}
