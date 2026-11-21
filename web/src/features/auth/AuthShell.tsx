import { Atom, BookOpen, FlaskConical, Landmark, MessageCircle, Pencil, Triangle } from 'lucide-react'
import type { ReactNode } from 'react'
import { SubjectIcon } from '@/components/SubjectTile'
import { Wordmark } from '@/components/Wordmark'

const ICON = { size: 24, strokeWidth: 2.2, 'aria-hidden': true } as const

const TILES: { label: string; background: string; dark?: boolean; icon: ReactNode }[] = [
  { label: 'Math', background: '#2563EB', icon: <SubjectIcon subject="math" /> },
  { label: 'Reading', background: '#E04A33', icon: <BookOpen {...ICON} /> },
  { label: 'Science', background: '#15924F', icon: <FlaskConical {...ICON} /> },
  { label: 'Writing', background: '#FFC83D', dark: true, icon: <Pencil {...ICON} /> },
  { label: 'History', background: '#7C4DDB', icon: <Landmark {...ICON} /> },
  { label: 'Spanish', background: '#D9457F', icon: <MessageCircle {...ICON} /> },
  { label: 'Geometry', background: '#F2811D', dark: true, icon: <Triangle {...ICON} /> },
  { label: 'Chemistry', background: '#0E8C8C', icon: <Atom {...ICON} /> },
]

function Tile({
  tile,
  size,
  delay,
  fluid,
}: {
  tile: (typeof TILES)[number]
  size: number
  delay?: number
  fluid?: boolean
}) {
  return (
    <div
      className="a-pop flex aspect-square flex-none flex-col justify-between overflow-hidden"
      style={{
        width: fluid ? undefined : size,
        borderRadius: Math.round(size * 0.21),
        padding: Math.round(size * 0.12),
        background: tile.background,
        color: tile.dark ? '#16181F' : '#FFFFFF',
        animationDelay: delay ? `${delay}ms` : undefined,
      }}
    >
      {tile.icon}
      <span className="text-[13px] leading-tight font-bold md:text-sm">{tile.label}</span>
    </div>
  )
}

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-svh flex-col lg:grid lg:min-h-dvh lg:grid-cols-2">
      <section className="mx-auto flex w-full max-w-[560px] flex-col lg:mx-0 lg:max-w-none lg:bg-[#FAFAFC] lg:px-[72px] lg:py-12">
        <div className="px-6 pt-7 lg:p-0">
          <Wordmark />
        </div>

        <div aria-hidden="true" className="mt-7 overflow-hidden lg:hidden">
          <div className="marquee flex w-max gap-2 pl-6" style={{ animation: 'marquee 40s linear infinite' }}>
            {[...TILES, ...TILES].map((tile, at) => (
              <Tile key={at} tile={tile} size={84} />
            ))}
          </div>
        </div>

        <div className="stagger flex flex-col gap-2.5 px-6 pt-7 lg:mt-[120px] lg:gap-4 lg:p-0">
          <h1 className="h">
            Learns your kid.
            <br />
            Fixes the plan.
          </h1>
          <p className="sub lg:text-[19px]">Short lessons that adapt after every quiz.</p>
        </div>

        <div aria-hidden="true" className="mt-auto hidden grid-cols-[repeat(4,minmax(0,96px))] gap-3 pt-12 lg:grid">
          {TILES.map((tile, at) => (
            <Tile key={tile.label} tile={tile} size={96} delay={200 + at * 60} fluid />
          ))}
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-[560px] flex-1 flex-col justify-end px-6 pt-8 pb-6 lg:mx-0 lg:max-w-none lg:items-center lg:justify-center lg:p-12">
        {children}
      </section>
    </main>
  )
}
