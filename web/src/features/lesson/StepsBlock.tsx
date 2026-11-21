'use client'

import { ArrowDown } from 'lucide-react'
import { useState } from 'react'
import Markdown from 'react-markdown'
import type { Components } from 'react-markdown'
import { Button } from '@/components/Button'
import type { StepsBlock as StepsData } from '@/contracts/domain'

// Step text is inline Markdown from a model: no links, no images (ADR 0002).
const INLINE: Components = {
  p: ({ children }) => <p>{children}</p>,
  a: ({ children }) => <span>{children}</span>,
  img: () => null,
}

// A worked example opened one step at a time, so the child can try the next
// step in their head before seeing it.
export function StepsBlock({ block }: { block: StepsData }) {
  const [shown, setShown] = useState(1)
  const total = block.steps.length
  const done = shown >= total

  return (
    <div className="blk stepped">
      <p className="stepped-title">{block.title}</p>
      <ol className="steps" aria-live="polite">
        {block.steps.slice(0, shown).map((step, index) => (
          <li key={index} className={index === shown - 1 && index > 0 ? 'a-rise' : undefined}>
            <div className="li-body">
              <Markdown components={INLINE}>{step.text}</Markdown>
              {step.math && <p className="eq solo">{step.math}</p>}
            </div>
          </li>
        ))}
      </ol>
      <div className="stepped-foot">
        {done ? (
          <span className="sm">
            All {total} steps shown.{' '}
            <button type="button" className="stepped-again" onClick={() => setShown(1)}>
              Start over
            </button>
          </span>
        ) : (
          <>
            <Button variant="secondary" size="sm" onClick={() => setShown(shown + 1)}>
              Next step
              <ArrowDown size={16} strokeWidth={2.6} aria-hidden="true" />
            </Button>
            <span className="sm">
              Step {shown} of {total}. Guess the next one first.
            </span>
          </>
        )}
      </div>
    </div>
  )
}
