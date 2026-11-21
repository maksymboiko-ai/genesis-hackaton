import type { NumberLineBlock as NumberLine } from '@/contracts/domain'
import { formatNumber } from './GraphBlock'

const WIDTH = 560
const HEIGHT = 96
const EDGE = 34
const LINE_Y = 56

export function NumberLineBlock({ block }: { block: NumberLine }) {
  const range = block.max - block.min
  const px = (value: number) => EDGE + ((value - block.min) / range) * (WIDTH - 2 * EDGE)
  const count = Math.floor(range / block.step + 1e-9)
  const ticks = Array.from({ length: count + 1 }, (_, index) => Number((block.min + index * block.step).toFixed(6)))
  // With many ticks only every second one is labelled.
  const labelEvery = ticks.length > 14 ? 2 : 1

  const summary = [
    block.title || 'Number line',
    ...block.points.map((point) => `${point.open ? 'open' : 'closed'} point at ${point.label || formatNumber(point.value)}`),
    ...block.ranges.map(
      (item) =>
        `shaded ${item.from === null ? 'from the left end' : `from ${formatNumber(item.from)}`} ${item.to === null ? 'to the right end' : `to ${formatNumber(item.to)}`}`,
    ),
  ].join(', ')

  return (
    <figure className="blk nline">
      {block.title && <figcaption className="blk-title">{block.title}</figcaption>}
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={summary}>
        <defs>
          <marker id={`nl-${block.id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill="var(--text)" />
          </marker>
          <marker id={`nlr-${block.id}`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill="var(--s)" />
          </marker>
        </defs>
        <line
          x1={8}
          x2={WIDTH - 8}
          y1={LINE_Y}
          y2={LINE_Y}
          className="nl-axis"
          markerStart={`url(#nl-${block.id})`}
          markerEnd={`url(#nl-${block.id})`}
        />
        {ticks.map((tick, index) => (
          <g key={tick} className="nl-tick">
            <line x1={px(tick)} x2={px(tick)} y1={LINE_Y - 6} y2={LINE_Y + 6} />
            {index % labelEvery === 0 && (
              <text x={px(tick)} y={LINE_Y + 26} textAnchor="middle">
                {formatNumber(tick)}
              </text>
            )}
          </g>
        ))}
        {block.ranges.map((item, index) => (
          <line
            key={index}
            x1={item.from === null ? 30 : px(item.from)}
            x2={item.to === null ? WIDTH - 30 : px(item.to)}
            y1={LINE_Y}
            y2={LINE_Y}
            className="nl-range"
            markerStart={item.from === null ? `url(#nlr-${block.id})` : undefined}
            markerEnd={item.to === null ? `url(#nlr-${block.id})` : undefined}
          />
        ))}
        {block.points.map((point, index) => (
          <g key={index}>
            <circle cx={px(point.value)} cy={LINE_Y} r={7} className={point.open ? 'nl-open' : 'nl-dot'} />
            {point.label && (
              <text x={px(point.value)} y={LINE_Y - 18} textAnchor="middle" className="nl-label">
                {point.label}
              </text>
            )}
          </g>
        ))}
      </svg>
      {block.caption && (
        <div className="blk-foot">
          <p className="sm">{block.caption}</p>
        </div>
      )}
    </figure>
  )
}
