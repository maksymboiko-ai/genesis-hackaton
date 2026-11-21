export type Section = { id: string; heading: string | null; body: string; kind: SectionKind }
export type SectionKind = 'plain' | 'rule' | 'example' | 'slip' | 'recap'

const HEADING = /^#{1,4}\s+(.+?)\s*#*$/

function kindOf(heading: string | null): SectionKind {
  if (!heading) return 'plain'
  if (/common (slip|mistake)|watch out|careful/i.test(heading)) return 'slip'
  if (/example/i.test(heading)) return 'example'
  if (/\brule\b|key idea|big idea/i.test(heading)) return 'rule'
  if (/recap|remember|summary|in short/i.test(heading)) return 'recap'
  return 'plain'
}

const TAKEAWAY = /^\*\*(remember|recap|key takeaway|in short)\b/i

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

export function splitSections(markdown: string, lessonTitle: string): Section[] {
  const sections: { heading: string | null; lines: string[] }[] = [{ heading: null, lines: [] }]
  let fenced = false

  for (const line of markdown.replace(/\r\n/g, '\n').split('\n')) {
    if (/^\s*```/.test(line)) fenced = !fenced
    const match = fenced ? null : HEADING.exec(line)
    if (!match) {
      sections[sections.length - 1].lines.push(line)
      continue
    }
    const heading = match[1].replace(/\*\*/g, '').trim()
    if (same(heading, lessonTitle) && sections.length === 1 && !sections[0].lines.join('').trim()) continue
    sections.push({ heading, lines: [] })
  }

  return sections
    .map((section) => ({ heading: section.heading, body: section.lines.join('\n').trim() }))
    .filter((section) => section.heading || section.body)
    .flatMap((section) => {
      const paragraphs = section.body.split(/\n{2,}/)
      const last = paragraphs[paragraphs.length - 1] ?? ''
      if (paragraphs.length < 2 || !TAKEAWAY.test(last)) return [{ ...section, kind: kindOf(section.heading) }]
      return [
        { heading: section.heading, body: paragraphs.slice(0, -1).join('\n\n'), kind: kindOf(section.heading) },
        { heading: null, body: last, kind: 'recap' as const },
      ]
    })
    .map((section, index) => ({ ...section, id: `part-${index}` }))
}

export function splitLabel(heading: string): { title: string; label: string | null } {
  const at = heading.indexOf(':')
  if (at < 0) return { title: heading, label: null }
  const label = heading.slice(at + 1).trim()
  return { title: heading.slice(0, at).trim(), label: label || null }
}

export function extractPassage(markdown: string): string[] {
  const lines: string[] = []
  let started = false
  for (const line of markdown.split('\n')) {
    const match = /^\s*>\s?(.*)$/.exec(line)
    if (match) {
      started = true
      if (match[1].trim()) lines.push(match[1].trim())
    } else if (started) break
  }
  return lines
}

export function wordCount(markdown: string) {
  return markdown.split(/\s+/).filter(Boolean).length
}

export function isMathy(text: string) {
  const value = text.trim()
  return value.length <= 28 && /[\d=]/.test(value) && !/[a-z]{3,}/i.test(value)
}

const EQUATION = /[=<>≤≥]/

export function splitPrompt(prompt: string): { lead: string | null; equation: string | null; question: string } {
  const text = prompt.trim()
  const colon = text.lastIndexOf(':')
  if (colon > 0) {
    const tail = text.slice(colon + 1).trim().replace(/^`|`$/g, '')
    if (tail && tail.length <= 40 && EQUATION.test(tail) && !/[a-z]{4,}/i.test(tail)) {
      return { lead: null, equation: tail, question: `${text.slice(0, colon).trim()}.`.replace(/\.\.$/, '.') }
    }
  }
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g)
  if (sentences && sentences.length > 1 && text.length > 110) {
    const question = sentences[sentences.length - 1].trim()
    return { lead: sentences.slice(0, -1).join('').trim(), equation: null, question }
  }
  return { lead: null, equation: null, question: text }
}

export function shortPrompt(prompt: string) {
  const { equation, question } = splitPrompt(prompt)
  return equation ?? question
}

export const LETTERS = ['A', 'B', 'C', 'D']
