import type { ReactNode } from 'react'
import Markdown from 'react-markdown'
import type { Components } from 'react-markdown'
import type { LessonBlock } from '@/contracts/domain'
import { splitBody } from '@/lib/lesson-blocks'
import type { SubjectKey } from '@/lib/subjects'
import { CheckBlock } from './CheckBlock'
import { GraphBlock } from './GraphBlock'
import { NumberLineBlock } from './NumberLineBlock'
import { StepsBlock } from './StepsBlock'
import { splitLabel } from './text'
import type { Section } from './text'

type HastNode = { type: string; value?: string; tagName?: string; children?: HastNode[] }

function textOf(node: HastNode | undefined): string {
  if (!node) return ''
  if (node.type === 'text') return node.value ?? ''
  return (node.children ?? []).map(textOf).join('')
}

function soleCode(node: HastNode | undefined) {
  const children = (node?.children ?? []).filter((child) => child.type !== 'text' || child.value?.trim())
  return children.length === 1 && children[0].tagName === 'code' ? textOf(children[0]) : null
}

function components(subject: SubjectKey): Components {
  return {
    p: ({ node, children }) => {
      const code = soleCode(node as HastNode)
      return code ? <p className="eq solo">{code}</p> : <p>{children}</p>
    },
    ol: ({ children }) => <ol className="steps">{children}</ol>,
    li: ({ children }) => (
      <li>
        <div className="li-body">{children}</div>
      </li>
    ),
    pre: ({ node }) => <p className="eq solo">{textOf(node as HastNode).trim()}</p>,
    a: ({ children }) => <span>{children}</span>,
    img: () => null,
    hr: () => null,
    blockquote: ({ node, children }) => {
      if (subject !== 'read') return <div className="box bg-s-tint">{children}</div>
      const lines = textOf(node as HastNode)
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
      return (
        <div className="passage">
          {lines.map((line, index) => (
            <PassageLine key={index} number={index + 1}>
              {line}
            </PassageLine>
          ))}
        </div>
      )
    },
  }
}

function PassageLine({ number, children }: { number: number; children: ReactNode }) {
  return (
    <>
      <span className="ln" aria-hidden="true">
        {number}
      </span>
      <span>{children}</span>
    </>
  )
}

function BlockView({ block }: { block: LessonBlock }) {
  switch (block.type) {
    case 'graph':
      return <GraphBlock block={block} />
    case 'number_line':
      return <NumberLineBlock block={block} />
    case 'check':
      return <CheckBlock block={block} />
    case 'steps':
      return <StepsBlock block={block} />
  }
}

export function LessonBody({
  sections,
  blocks,
  subject,
}: {
  sections: Section[]
  blocks: LessonBlock[]
  subject: SubjectKey
}) {
  const map = components(subject)
  // A line holding only [[block-id]] is where that block goes; a placeholder
  // with no block behind it shows nothing.
  const md = (body: string) =>
    splitBody(body).map((part, index) => {
      if (part.kind === 'markdown') {
        return (
          <Markdown key={index} components={map}>
            {part.text}
          </Markdown>
        )
      }
      const block = blocks.find((item) => item.id === part.id)
      return block ? <BlockView key={block.id} block={block} /> : null
    })

  return (
    <div className="ld">
      {sections.map((section) => {
        const { title, label } = splitLabel(section.heading ?? '')

        if (!section.heading) {
          return (
            <section key={section.id} id={section.id} className={section.kind === 'recap' ? 'remember' : undefined}>
              {md(section.body)}
            </section>
          )
        }

        if (section.kind === 'rule') {
          return (
            <section key={section.id} id={section.id}>
              <div className="box rule bg-s-tint">
                <h2 className="lab text-s-ink">{section.heading}</h2>
                {md(section.body)}
              </div>
            </section>
          )
        }

        if (section.kind === 'slip') {
          return (
            <section key={section.id} id={section.id}>
              <div className="box slip bg-sun-tint">
                <h2 className="lab text-sun-ink">{section.heading}</h2>
                {md(section.body)}
              </div>
            </section>
          )
        }

        if (section.kind === 'recap') {
          return (
            <section key={section.id} id={section.id}>
              <div className="box recap bg-surface-2">
                <h2 className="lab text-muted">{section.heading}</h2>
                {md(section.body)}
              </div>
            </section>
          )
        }

        if (section.kind === 'example') {
          return (
            <section key={section.id} id={section.id}>
              <h2>{title}</h2>
              <div className="box plain">
                {label && <p className="lab text-muted">{label}</p>}
                {md(section.body)}
              </div>
            </section>
          )
        }

        return (
          <section key={section.id} id={section.id}>
            <h2>{section.heading}</h2>
            {md(section.body)}
          </section>
        )
      })}
    </div>
  )
}
