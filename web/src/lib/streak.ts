import type { MascotPose } from '@/components/Mascot'

export type DayState = 'done' | 'frozen' | 'today' | 'missed' | 'ahead'
export type StreakState = 'done' | 'pending' | 'frozen' | 'none'

export type StreakInfo = {
  count: number
  best: number
  last: number
  state: StreakState
  doneToday: boolean
  freezeLeft: boolean
  frozenDay: string | null
  perfectWeek: boolean
  week: { letter: string; name: string; state: DayState }[]
  pose: MascotPose
}

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const LIMIT = 800

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
const weekdayOf = (date: Date) => (date.getDay() + 6) % 7
export const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
const weekKey = (date: Date) => dayKey(addDays(date, -weekdayOf(date)))

function runEndingAt(done: Set<string>, end: Date) {
  let count = 0
  const frozen: Date[] = []
  let pending: Date[] = []
  const usedWeeks = new Set<string>()
  let cursor = end

  for (let step = 0; step < LIMIT; step += 1) {
    if (done.has(dayKey(cursor))) {
      count += 1
      frozen.push(...pending)
      pending = []
    } else {
      const week = weekKey(cursor)
      if (count === 0 || usedWeeks.has(week)) break
      usedWeeks.add(week)
      pending.push(cursor)
    }
    cursor = addDays(cursor, -1)
  }

  return { count, frozen }
}

// A saved day (YYYY-MM-DD, the child's calendar) as a local date.
function fromDay(day: string) {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date)
}

/** The streak from the days the server saved (GET /children/:id/streak). */
export function streakOf(days: string[], now = new Date()): StreakInfo {
  const dates = days.map(fromDay)
  const done = new Set(dates.map(dayKey))

  const today = startOfDay(now)
  const yesterday = addDays(today, -1)
  const doneToday = done.has(dayKey(today))

  let current = runEndingAt(done, doneToday ? today : yesterday)
  let coveredYesterday = false
  if (!doneToday && current.count === 0) {
    const bridged = runEndingAt(done, addDays(today, -2))
    const sameWeekFreeze = bridged.frozen.some((day) => weekKey(day) === weekKey(yesterday))
    if (bridged.count > 0 && !sameWeekFreeze) {
      current = { count: bridged.count, frozen: [...bridged.frozen, yesterday] }
      coveredYesterday = true
    }
  }

  const frozenKeys = new Set(current.frozen.map(dayKey))
  const best = dates.reduce((max, date) => Math.max(max, runEndingAt(done, date).count), 0)

  let last = 0
  if (current.count === 0 && dates.length > 0) {
    const latest = dates.reduce((a, b) => (a > b ? a : b))
    last = runEndingAt(done, latest).count
  }

  const state: StreakState = doneToday
    ? 'done'
    : current.count === 0
      ? 'none'
      : coveredYesterday
        ? 'frozen'
        : 'pending'

  const weekday = weekdayOf(today)
  const monday = addDays(today, -weekday)
  const week = LETTERS.map((letter, at) => {
    const date = addDays(monday, at)
    const key = dayKey(date)
    const dayState: DayState = done.has(key)
      ? 'done'
      : frozenKeys.has(key)
        ? 'frozen'
        : at === weekday
          ? 'today'
          : at < weekday
            ? 'missed'
            : 'ahead'
    return { letter, name: NAMES[at], state: dayState }
  })

  const perfectWeek = week.every((day) => day.state === 'done')
  const pose: MascotPose = perfectWeek
    ? 'graduate'
    : state === 'done'
      ? 'cheer'
      : state === 'pending'
        ? 'keep-going'
        : state === 'frozen'
          ? 'sleep'
          : 'peek'

  return {
    count: current.count,
    best: Math.max(best, current.count),
    last,
    state,
    doneToday,
    freezeLeft: !current.frozen.some((day) => weekKey(day) === weekKey(today)),
    frozenDay: coveredYesterday ? NAMES[weekdayOf(yesterday)] : null,
    perfectWeek,
    week,
    pose,
  }
}

export const daysLabel = (count: number) => (count === 1 ? '1 day' : `${count} days`)

export function seenToday(kind: string, childId: string | null) {
  const key = `streak:${kind}:${childId ?? 'none'}`
  const today = dayKey(new Date())
  try {
    if (localStorage.getItem(key) === today) return true
    localStorage.setItem(key, today)
  } catch {}
  return false
}
