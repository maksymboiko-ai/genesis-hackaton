import type { RefObject } from 'react'
import { anxietyLine, schoolLine } from './questions'

type Props = { headingRef: RefObject<HTMLHeadingElement | null>; name: string }

const DOT_COLORS = ['var(--math)', 'var(--read)', 'var(--sci)']
const FILLED_DOTS = 30

function Figure({ color, children }: { color: string; children: string }) {
  return (
    <p
      className="a-rise m-0 text-[96px] leading-[0.9] font-extrabold tracking-[-0.05em] md:text-[132px]"
      style={{ color }}
    >
      {children}
    </p>
  )
}

export function StatSchool({ headingRef, name, pace }: Props & { pace: string | null }) {
  return (
    <div className="grid content-start md:flex-1 gap-5 pt-3 md:grid-cols-2 md:items-center md:gap-16">
      <div className="flex flex-col gap-5">
        <Figure color="var(--math)">&lt;1 in 3</Figure>
        <h1 ref={headingRef} tabIndex={-1} className="q a-rise outline-none" style={{ fontSize: 24, animationDelay: '80ms' }}>
          U.S. 8th graders are proficient in math or reading.
        </h1>
        <p className="sub a-rise hidden md:block" style={{ animationDelay: '160ms' }}>
          <b className="text-text">{schoolLine(pace, name)}</b>
        </p>
        <p className="sm hidden md:block">NAEP 2024 · math 28%, reading 30%</p>
      </div>
      <div className="flex flex-col gap-5">
        <div role="img" aria-label="About 30 of 100 dots filled" className="grid grid-cols-[repeat(20,minmax(0,1fr))] gap-[5px] md:grid-cols-[repeat(10,minmax(0,1fr))] md:gap-2.5">
          {Array.from({ length: 100 }, (_, at) => (
            <i
              key={at}
              className="a-pop block aspect-square rounded-full"
              style={{
                background: at < FILLED_DOTS ? DOT_COLORS[at % 3] : 'var(--track)',
                animationDelay: `${at < FILLED_DOTS ? 200 + at * 22 : 0}ms`,
              }}
            />
          ))}
        </div>
        <p className="sub md:hidden">
          <b className="text-text">{schoolLine(pace, name)}</b>
        </p>
        <p className="sm md:hidden">NAEP 2024 · math 28%, reading 30%</p>
      </div>
    </div>
  )
}

export function StatAnxiety({ headingRef, name, obstacles }: Props & { obstacles: string[] }) {
  return (
    <div className="grid content-start md:flex-1 gap-5 pt-3 md:grid-cols-2 md:items-center md:gap-16">
      <div className="flex flex-col gap-5">
        <Figure color="var(--read)">1 in 5</Figure>
        <h1 ref={headingRef} tabIndex={-1} className="q a-rise outline-none" style={{ fontSize: 24, animationDelay: '80ms' }}>
          kids feel real anxiety about math.
        </h1>
        <p className="sub a-rise hidden md:block" style={{ animationDelay: '160ms' }}>
          {anxietyLine(obstacles, name)}
        </p>
        <p className="sm hidden md:block">APA, 2023</p>
      </div>
      <div className="flex flex-col gap-5">
        <div role="img" aria-label="One of five highlighted" className="flex gap-2.5 md:gap-4">
          {Array.from({ length: 5 }, (_, at) => (
            <i
              key={at}
              className="a-rise block h-[88px] flex-1 rounded-[44px_44px_16px_16px] md:h-[180px] md:rounded-[90px_90px_24px_24px]"
              style={{ background: at === 0 ? 'var(--read)' : 'var(--track)', animationDelay: `${200 + at * 70}ms` }}
            />
          ))}
        </div>
        <p className="sub md:hidden">{anxietyLine(obstacles, name)}</p>
        <p className="sm md:hidden">APA, 2023</p>
      </div>
    </div>
  )
}

function Node({ shape, label, score, tone, indent, delay }: { shape: 'done' | 'review' | 'next'; label: string; score?: string; tone?: string; indent?: boolean; delay: number }) {
  return (
    <div className={`a-drop flex items-center gap-3 ${indent ? 'pl-7' : ''}`} style={{ animationDelay: `${delay}ms` }}>
      <span
        className="relative z-[1] size-[26px] flex-none"
        style={
          shape === 'done'
            ? { borderRadius: '50%', background: 'var(--math)' }
            : shape === 'review'
              ? { borderRadius: 8, background: 'var(--sun)' }
              : { borderRadius: '50%', border: '3px solid var(--math)', background: '#fff' }
        }
      />
      <span className={`text-[15px] ${shape === 'done' ? 'font-bold' : 'font-semibold'} ${shape === 'next' ? 'text-muted' : ''}`}>
        {label}
      </span>
      {score && (
        <span className="mono ml-auto text-sm font-semibold" style={{ color: tone }}>
          {score}
        </span>
      )}
    </div>
  )
}

export function Explainer({ headingRef, name }: Props) {
  return (
    <div className="grid content-start md:flex-1 gap-[22px] md:grid-cols-2 md:items-center md:gap-16">
      <div className="flex flex-col gap-[22px]">
        <h1 ref={headingRef} tabIndex={-1} className="q outline-none">
          {name}’s plan isn’t fixed.
          <br />
          It learns from every quiz.
        </h1>
        <p className="sub hidden text-text md:block">
          Stuck? It adds review. Ahead? It adds a challenge. You always see what changed and why.
        </p>
      </div>
      <div className="flex flex-col gap-[22px]">
        <div aria-hidden="true" className="relative flex flex-col gap-3.5 rounded-[20px] bg-surface-2 p-[18px]">
          <i className="a-grow absolute top-[30px] bottom-[30px] left-[30px] block w-[3px] origin-top bg-[#D5D8E0]" />
          <Node shape="done" label="Lesson + quiz" score="5/5" tone="var(--sci-ink)" delay={150} />
          <Node shape="done" label="Lesson + quiz" score="2/5" tone="var(--read-ink)" delay={450} />
          <div
            className="a-drop ml-[38px] rounded-[6px_14px_14px_14px] bg-sun px-3 py-2.5 text-sm leading-[1.35] font-bold"
            style={{ animationDelay: '900ms' }}
          >
            Spotted a gap → added 2 short reviews
          </div>
          <Node shape="review" label="Review" indent delay={1150} />
          <Node shape="review" label="Review" indent delay={1230} />
          <Node shape="next" label="Back on track" delay={1500} />
        </div>
        <p className="sub text-text md:hidden">
          Stuck? It adds review. Ahead? It adds a challenge. You always see what changed and why.
        </p>
      </div>
    </div>
  )
}
