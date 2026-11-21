'use client'

import { RotateCcw } from 'lucide-react'
import { useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import type { GraphBlock as Graph, GraphElement, GraphParameter, GraphTone } from '@/contracts/domain'
import { tryCompile } from '@/lib/expr'
import type { Compiled, Scope } from '@/lib/expr'
import { FUNCTION_VARIABLE, dragParameters, elementExprs, startScope } from '@/lib/lesson-blocks'

const WIDTH = 560
const MIN_HEIGHT = 300
const MAX_HEIGHT = 560
const PAD = 8
const SAMPLES = 240

const TONES: Record<GraphTone, string> = {
  primary: 'var(--s)',
  secondary: 'var(--challenge)',
  muted: 'var(--field)',
}

export function formatNumber(value: number) {
  if (!Number.isFinite(value)) return '—'
  const rounded = Math.round(value * 100) / 100
  return String(Object.is(rounded, -0) ? 0 : rounded).replace('-', '−')
}

/** A round step (1, 2 or 5 times a power of ten) giving at most `max` ticks. */
function niceStep(range: number, max: number) {
  const rough = range / max
  const power = Math.pow(10, Math.floor(Math.log10(rough)))
  const unit = rough / power
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power
}

function ticks(min: number, max: number, step: number) {
  const out: number[] = []
  for (let value = Math.ceil(min / step) * step; value <= max + step * 1e-9; value += step) {
    out.push(Math.abs(value) < step * 1e-9 ? 0 : value)
  }
  return out
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function snap(value: number, parameter: GraphParameter) {
  const stepped = parameter.min + Math.round((value - parameter.min) / parameter.step) * parameter.step
  // Rounds away float noise such as 0.30000000000000004.
  return clamp(Number(stepped.toFixed(6)), parameter.min, parameter.max)
}

export function GraphBlock({ block }: { block: Graph }) {
  const clipId = useId()
  const svgRef = useRef<SVGSVGElement>(null)
  const [scope, setScope] = useState<Scope>(() => startScope(block))
  const names = useMemo(() => block.parameters.map((parameter) => parameter.name), [block.parameters])
  const changed = block.parameters.some((parameter) => scope[parameter.name] !== parameter.value)

  const xRange = block.xMax - block.xMin
  const yRange = block.yMax - block.yMin
  const height = clamp((WIDTH * yRange) / xRange, MIN_HEIGHT, MAX_HEIGHT)
  const px = (x: number) => PAD + ((x - block.xMin) / xRange) * (WIDTH - 2 * PAD)
  const py = (y: number) => PAD + ((block.yMax - y) / yRange) * (height - 2 * PAD)

  // Each expression is parsed once per graph, not on every slider move.
  const parsed = useMemo(() => {
    const exprs = [
      ...block.elements.flatMap((element) => elementExprs(element, names)),
      ...block.readouts.map((readout) => ({ expr: readout.expr, variables: names })),
    ]
    return new Map<string, Compiled | null>(
      exprs.map(({ expr, variables }) => [`${variables.length}:${expr}`, tryCompile(expr, variables)]),
    )
  }, [block.elements, block.readouts, names])
  // A function's expression has one more variable than the others: x.
  const compiled = (expr: string, withX = false) => parsed.get(`${names.length + Number(withX)}:${expr}`) ?? null
  const value = (expr: string) => compiled(expr)?.(scope) ?? Number.NaN

  const setParameter = (name: string, next: number) => setScope((current) => ({ ...current, [name]: next }))
  const parameter = (name: string) => block.parameters.find((item) => item.name === name)!

  function dragTo(event: PointerEvent<SVGElement>, bound: { x: string; y: string }) {
    const box = svgRef.current?.getBoundingClientRect()
    if (!box) return
    const scale = WIDTH / box.width
    const x = block.xMin + (((event.clientX - box.left) * scale - PAD) / (WIDTH - 2 * PAD)) * xRange
    const y = block.yMax - (((event.clientY - box.top) * scale - PAD) / (height - 2 * PAD)) * yRange
    setScope((current) => ({
      ...current,
      [bound.x]: snap(x, parameter(bound.x)),
      [bound.y]: snap(y, parameter(bound.y)),
    }))
  }

  function nudge(event: KeyboardEvent<SVGElement>, bound: { x: string; y: string }) {
    const move: Record<string, [string, number]> = {
      ArrowLeft: [bound.x, -1],
      ArrowRight: [bound.x, 1],
      ArrowDown: [bound.y, -1],
      ArrowUp: [bound.y, 1],
    }
    const step = move[event.key]
    if (!step) return
    event.preventDefault()
    const target = parameter(step[0])
    setParameter(target.name, snap(scope[target.name] + step[1] * target.step, target))
  }

  const xStep = niceStep(xRange, 12)
  const yStep = niceStep(yRange, 12)
  const xTicks = ticks(block.xMin, block.xMax, xStep)
  const yTicks = ticks(block.yMin, block.yMax, yStep)
  // The axes sit at zero when zero is in view, otherwise on the nearest edge.
  const axisY = py(clamp(0, block.yMin, block.yMax))
  const axisX = px(clamp(0, block.xMin, block.xMax))

  const label = (x: number, y: number, text: string, tone: GraphTone, key: string) =>
    text && Number.isFinite(x) && Number.isFinite(y) ? (
      <text
        key={key}
        x={clamp(x, PAD + 4, WIDTH - PAD - 4)}
        y={clamp(y, PAD + 14, height - PAD - 4)}
        className="g-label"
        fill={tone === 'muted' ? 'var(--muted)' : TONES[tone]}
        textAnchor={x > WIDTH * 0.8 ? 'end' : 'start'}
      >
        {text}
      </text>
    ) : null

  function functionPath(element: Extract<GraphElement, { kind: 'function' }>) {
    const fn = compiled(element.expr, true)
    if (!fn) return { d: '', anchor: null as { x: number; y: number } | null }
    let d = ''
    let pen = false
    let anchor: { x: number; y: number } | null = null
    // Far outside the view is a break in the curve (an asymptote), not a line.
    const limit = yRange * 4
    for (let i = 0; i <= SAMPLES; i++) {
      const x = block.xMin + (xRange * i) / SAMPLES
      const y = fn({ ...scope, [FUNCTION_VARIABLE]: x })
      if (!Number.isFinite(y) || y > block.yMax + limit || y < block.yMin - limit) {
        pen = false
        continue
      }
      d += `${pen ? 'L' : 'M'}${px(x).toFixed(1)} ${py(y).toFixed(1)}`
      pen = true
      if (y >= block.yMin && y <= block.yMax && i <= SAMPLES * 0.82) anchor = { x: px(x), y: py(y) }
    }
    return { d, anchor }
  }

  function draw(element: GraphElement, index: number) {
    const color = TONES[element.tone]
    const key = `e${index}`
    const stroke = {
      stroke: color,
      strokeWidth: element.tone === 'muted' ? 2 : 3,
      strokeDasharray: 'dashed' in element && element.dashed ? '7 6' : undefined,
      strokeLinecap: 'round' as const,
      fill: 'none',
    }

    switch (element.kind) {
      case 'point': {
        const x = px(value(element.x))
        const y = py(value(element.y))
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null
        const bound = dragParameters(element, block)
        return (
          <g key={key}>
            {bound ? (
              <circle
                cx={x}
                cy={y}
                r={11}
                className="g-drag"
                fill={color}
                tabIndex={0}
                role="slider"
                aria-label={`Point ${element.label || 'to move'}`}
                aria-valuetext={`${formatNumber(scope[bound.x])}, ${formatNumber(scope[bound.y])}`}
                aria-valuenow={scope[bound.x]}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId)
                  dragTo(event, bound)
                }}
                onPointerMove={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) dragTo(event, bound)
                }}
                onKeyDown={(event) => nudge(event, bound)}
              />
            ) : (
              <circle cx={x} cy={y} r={6} fill={color} stroke="#fff" strokeWidth={2} />
            )}
            {label(x + 12, y - 12, element.label, element.tone, `${key}l`)}
          </g>
        )
      }
      case 'segment':
      case 'vector':
      case 'line': {
        let x1 = px(value(element.x1))
        let y1 = py(value(element.y1))
        let x2 = px(value(element.x2))
        let y2 = py(value(element.y2))
        if (![x1, y1, x2, y2].every(Number.isFinite)) return null
        const midX = (x1 + x2) / 2
        const midY = (y1 + y2) / 2
        if (element.kind === 'line') {
          // Runs well past the view on both sides; the clip trims it.
          const length = Math.hypot(x2 - x1, y2 - y1)
          if (length < 1e-6) return null
          const reach = (WIDTH + height) * 2
          const dx = ((x2 - x1) / length) * reach
          const dy = ((y2 - y1) / length) * reach
          ;[x1, y1, x2, y2] = [midX - dx, midY - dy, midX + dx, midY + dy]
        }
        return (
          <g key={key}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} {...stroke} markerEnd={element.kind === 'vector' ? `url(#${clipId}-${element.tone})` : undefined} />
            {label(midX + 10, midY - 10, element.label, element.tone, `${key}l`)}
          </g>
        )
      }
      case 'circle': {
        const cx = px(value(element.cx))
        const cy = py(value(element.cy))
        const r = value(element.r)
        if (![cx, cy].every(Number.isFinite) || !(r > 0)) return null
        const rx = (r / xRange) * (WIDTH - 2 * PAD)
        const ry = (r / yRange) * (height - 2 * PAD)
        return (
          <g key={key}>
            <ellipse cx={cx} cy={cy} rx={rx} ry={ry} {...stroke} />
            {label(cx + rx * 0.72 + 8, cy - ry * 0.72 - 8, element.label, element.tone, `${key}l`)}
          </g>
        )
      }
      case 'function': {
        const { d, anchor } = functionPath(element)
        if (!d) return null
        return (
          <g key={key}>
            <path d={d} {...stroke} strokeLinejoin="round" />
            {anchor && label(anchor.x + 10, anchor.y - 12, element.label, element.tone, `${key}l`)}
          </g>
        )
      }
      case 'polygon': {
        const corners = element.points.map((point) => ({ x: px(value(point.x)), y: py(value(point.y)) }))
        if (!corners.every((corner) => Number.isFinite(corner.x) && Number.isFinite(corner.y))) return null
        const centerX = corners.reduce((sum, corner) => sum + corner.x, 0) / corners.length
        const centerY = corners.reduce((sum, corner) => sum + corner.y, 0) / corners.length
        return (
          <g key={key}>
            <polygon
              points={corners.map((corner) => `${corner.x.toFixed(1)},${corner.y.toFixed(1)}`).join(' ')}
              {...stroke}
              fill={color}
              fillOpacity={0.12}
              strokeLinejoin="round"
            />
            {label(centerX, centerY, element.label, element.tone, `${key}l`)}
          </g>
        )
      }
    }
  }

  const draggable = block.elements.some((element) => dragParameters(element, block))
  // Shapes first, points last, so a point is never hidden under a line.
  const ordered = block.elements
    .map((element, index) => ({ element, index }))
    .sort((a, b) => Number(a.element.kind === 'point') - Number(b.element.kind === 'point'))

  return (
    <figure className="blk graph">
      {block.title && <figcaption className="blk-title">{block.title}</figcaption>}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${height}`}
        role="group"
        aria-label={[block.title || 'Graph', block.caption].filter(Boolean).join('. ')}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={PAD} y={PAD} width={WIDTH - 2 * PAD} height={height - 2 * PAD} />
          </clipPath>
          {(Object.keys(TONES) as GraphTone[]).map((tone) => (
            <marker key={tone} id={`${clipId}-${tone}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10z" fill={TONES[tone]} />
            </marker>
          ))}
        </defs>
        <rect x={PAD} y={PAD} width={WIDTH - 2 * PAD} height={height - 2 * PAD} className="g-bg" />
        <g className="g-grid" aria-hidden="true">
          {xTicks.map((tick) => (
            <line key={`x${tick}`} x1={px(tick)} x2={px(tick)} y1={PAD} y2={height - PAD} />
          ))}
          {yTicks.map((tick) => (
            <line key={`y${tick}`} y1={py(tick)} y2={py(tick)} x1={PAD} x2={WIDTH - PAD} />
          ))}
        </g>
        <g className="g-axis" aria-hidden="true">
          <line x1={PAD} x2={WIDTH - PAD} y1={axisY} y2={axisY} />
          <line y1={PAD} y2={height - PAD} x1={axisX} x2={axisX} />
          {xTicks.map((tick) =>
            tick === 0 && block.yMin <= 0 && block.yMax >= 0 ? null : (
              <text key={`x${tick}`} x={px(tick)} y={clamp(axisY + 16, PAD + 14, height - PAD - 4)} textAnchor="middle">
                {formatNumber(tick)}
              </text>
            ),
          )}
          {yTicks.map((tick) =>
            tick === 0 ? null : (
              <text key={`y${tick}`} x={clamp(axisX - 6, PAD + 22, WIDTH - PAD - 2)} y={py(tick) + 4} textAnchor="end">
                {formatNumber(tick)}
              </text>
            ),
          )}
        </g>
        <g clipPath={`url(#${clipId})`}>{ordered.map(({ element, index }) => draw(element, index))}</g>
      </svg>

      {(block.parameters.length > 0 || block.readouts.length > 0) && (
        <div className="g-panel">
          {block.parameters.map((item) => (
            <label key={item.name} className="g-slider">
              <span>
                {item.label || item.name}
                <b className="mono">{formatNumber(scope[item.name])}</b>
              </span>
              <input
                type="range"
                min={item.min}
                max={item.max}
                step={item.step}
                value={scope[item.name]}
                onChange={(event) => setParameter(item.name, Number(event.target.value))}
              />
            </label>
          ))}
          {block.readouts.length > 0 && (
            <dl className="g-readouts" aria-live="polite">
              {block.readouts.map((readout) => (
                <div key={readout.label}>
                  <dt>{readout.label}</dt>
                  <dd className="mono">{formatNumber(value(readout.expr))}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}

      {(block.caption || changed || draggable) && (
        <div className="blk-foot">
          <p className="sm">{block.caption || (draggable ? 'Drag the point to move it.' : '')}</p>
          {changed && (
            <button type="button" className="barbtn g-reset" onClick={() => setScope(startScope(block))}>
              <RotateCcw size={15} strokeWidth={2.4} aria-hidden="true" />
              Reset
            </button>
          )}
        </div>
      )}
    </figure>
  )
}
