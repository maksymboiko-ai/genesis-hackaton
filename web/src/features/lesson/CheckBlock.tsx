'use client'

import { Check } from 'lucide-react'
import { useId, useState } from 'react'
import type { CheckBlock as CheckData } from '@/contracts/domain'
import { LETTERS, isMathy } from './text'

// A quick question inside the lesson. Nothing is sent or scored: the child
// sees the feedback for their choice and can try again.
export function CheckBlock({ block }: { block: CheckData }) {
  const promptId = useId()
  const [chosen, setChosen] = useState<number | null>(null)
  const solved = chosen === block.answerIndex
  const mono = block.choices.every(isMathy)

  return (
    <div className="blk check">
      <p className="lab text-s-ink">Quick check</p>
      <p id={promptId} className="check-q">
        {block.prompt}
      </p>
      <div role="group" aria-labelledby={promptId} className="check-choices">
        {block.choices.map((choice, index) => {
          const on = chosen === index
          return (
            <button
              key={index}
              type="button"
              aria-pressed={on}
              disabled={solved && !on}
              onClick={() => setChosen(index)}
              className={`qa ${on ? (solved ? 'right' : 'tried') : ''}`}
            >
              <span className="lt2" aria-hidden="true">
                {on && solved ? <Check size={16} strokeWidth={3.2} /> : LETTERS[index]}
              </span>
              <span className={mono ? 'mono' : ''}>{choice}</span>
            </button>
          )
        })}
      </div>
      <div aria-live="polite">
        {chosen !== null && (
          <p key={chosen} className={`check-fb a-rise ${solved ? 'right' : ''}`}>
            {block.feedback[chosen]}
            {!solved && <b> Try another one.</b>}
          </p>
        )}
      </div>
    </div>
  )
}
