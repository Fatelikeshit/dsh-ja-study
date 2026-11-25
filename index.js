/**
 * dsh-ja-study — host half.
 *
 * The Japanese study panel is a pure browser+host feature: no system-prompt
 * section and no model tools. This half does three things.
 *
 * - Loads deck JSON from `<coursesDir>/ja/*.json` on every request, so editing
 *   or adding a deck file shows up without a Harness reload.
 * - Keeps study progress in `$DSH_HOME/ja-study.json` (today's count, streak,
 *   per-card seen/correct/wrong), written through a temp file.
 * - Serves three loopback-only JSON routes that the panel calls:
 *   `GET /api/ja-study/state`, `POST /api/ja-study/card`, `POST /api/ja-study/grade`.
 *
 * @module dsh-ja-study
 */

import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Bundle-relative course packs, so the plugin works without any config. */
const PACKAGE_DIR = fileURLToPath(new URL('.', import.meta.url))
const BUNDLED_COURSES = join(PACKAGE_DIR, 'courses')

/** Stable cordis plugin name (matches the bundle patch row). */
export const name = 'dsh-ja-study'

/** Services required before the routes can mount. */
export const inject = ['webServer']

/** The only course this panel shows; decks live at `<coursesDir>/ja/`. */
const COURSE = 'ja'

const CARD_TYPES = ['vocab', 'quiz', 'concept', 'tip']

/** Level buckets a deck can declare; anything else falls back to beginner. */
const LEVELS = ['beginner', 'intermediate', 'advanced']

/**
 * No Config schema on purpose: a workspace plugin cannot resolve
 * `@deepseek-ai/schemastery` (the harness only resolves that package for
 * packages installed with their dependencies), and importing it fails at
 * activation. `apply` normalizes the raw config object instead, so the row
 * config stays `{ coursesDir, dailyGoal?, stateFile? }`.
 */

/** Default state file, beside the rest of the harness's per-user data. */
function defaultStatePath() {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, 'ja-study.json')
}

/** Local calendar date as `YYYY-MM-DD`. */
function todayKey(now = new Date()) {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** A fresh, empty progress state. */
function createState() {
  return { day: { date: '', count: 0 }, streak: { days: 0, last: '' }, cards: {} }
}

/**
 * Coerce a parsed state file into the expected shape; unknown fields are
 * dropped so a hand-edited file cannot break the panel.
 * @param {unknown} raw
 */
function normalizeState(raw) {
  const state = createState()
  if (raw === null || typeof raw !== 'object') return state
  const day = raw.day
  if (day && typeof day.date === 'string') state.day = { date: day.date, count: Number(day.count) || 0 }
  const streak = raw.streak
  if (streak && typeof streak.days === 'number') state.streak = { days: Math.max(0, Math.floor(streak.days)), last: String(streak.last ?? '') }
  const cards = raw.cards
  if (cards && typeof cards === 'object') {
    for (const [id, record] of Object.entries(cards)) {
      if (!record || typeof record !== 'object') continue
      state.cards[id] = {
        seen: Number(record.seen) || 0,
        correct: Number(record.correct) || 0,
        wrong: Number(record.wrong) || 0,
        last: Number(record.last) || 0,
      }
    }
  }
  return state
}

/**
 * Normalize one card so the panel never has to know about card types: a quiz
 * card's `answer` is an index into `choices`, everything else is a string.
 * @param {unknown} card
 * @param {string} deckId
 * @returns {object|null}
 */
function normalizeCard(card, deckId) {
  if (card === null || typeof card !== 'object') return null
  if (typeof card.id !== 'string' || typeof card.prompt !== 'string' || typeof card.explanation !== 'string') return null
  const type = CARD_TYPES.includes(card.type) ? card.type : 'concept'
  let answerText = ''
  let choices = null
  if (type === 'quiz') {
    if (!Array.isArray(card.choices) || typeof card.answer !== 'number') return null
    choices = card.choices.filter(choice => typeof choice === 'string')
    answerText = choices[card.answer] ?? ''
  } else if (typeof card.answer === 'string') {
    answerText = card.answer
  }
  if (answerText === '') return null
  return {
    id: card.id,
    deck: deckId,
    type,
    prompt: card.prompt,
    hint: typeof card.hint === 'string' ? card.hint : '',
    answer: answerText,
    explanation: card.explanation,
    tags: Array.isArray(card.tags) ? card.tags.filter(tag => typeof tag === 'string') : [],
  }
}

/**
 * Read every deck under `<coursesDir>/ja/`. A broken file is reported, not
 * fatal, so one bad deck cannot take the panel down.
 * @param {string} root
 */
async function loadDecks(root) {
  const result = { decks: [], errors: [] }
  if (typeof root !== 'string' || root === '') {
    result.errors.push('coursesDir is not configured')
    return result
  }
  const dir = join(root, COURSE)
  let entries
  try {
    entries = await readdir(dir)
  } catch (error) {
    result.errors.push(`cannot read ${dir}: ${error?.code ?? String(error)}`)
    return result
  }
  for (const file of entries.sort()) {
    if (!file.toLowerCase().endsWith('.json')) continue
    const path = join(dir, file)
    try {
      const parsed = JSON.parse(await readFile(path, 'utf8'))
      const deckId = typeof parsed.id === 'string' && parsed.id !== '' ? parsed.id : file.replace(/\.json$/i, '')
      const cards = []
      for (const raw of Array.isArray(parsed.cards) ? parsed.cards : []) {
        const card = normalizeCard(raw, deckId)
        if (card !== null) cards.push(card)
      }
      result.decks.push({
        id: deckId,
        name: typeof parsed.name === 'string' && parsed.name !== '' ? parsed.name : deckId,
        description: typeof parsed.description === 'string' ? parsed.description : '',
        level: LEVELS.includes(parsed.level) ? parsed.level : 'beginner',
        cards,
      })
    } catch (error) {
      result.errors.push(`${file}: ${String(error?.message ?? error)}`)
    }
  }
  return result
}

/**
 * Mount the study panel's data routes.
 * @param ctx - the host context.
 * @param config - the resolved composition configuration.
 */
export function apply(ctx, config) {
  const current = {
    coursesDir: typeof config?.coursesDir === 'string' && config.coursesDir !== '' ? config.coursesDir : BUNDLED_COURSES,
    dailyGoal: Number.isFinite(config?.dailyGoal) && config.dailyGoal > 0 ? Math.floor(config.dailyGoal) : 10,
    stateFile: typeof config?.stateFile === 'string' && config.stateFile !== '' ? config.stateFile : undefined,
  }

  const statePath = () => current.stateFile ?? defaultStatePath()
  let state = createState()
  let writes = Promise.resolve()

  /** Restore the progress file once; a missing file starts fresh. */
  const ready = (async () => {
    try {
      state = normalizeState(JSON.parse(await readFile(statePath(), 'utf8')))
    } catch (error) {
      if (error?.code !== 'ENOENT') ctx.logger.warn(`dsh-ja-study: state was not restored: ${String(error)}`)
      state = createState()
    }
  })()

  /** Write the state file through a temp file so a crash cannot truncate it. */
  function save() {
    const payload = `${JSON.stringify(state, null, 2)}\n`
    const target = statePath()
    writes = writes
      .then(async () => {
        await mkdir(dirname(target), { recursive: true })
        const temporary = `${target}.tmp`
        await writeFile(temporary, payload, 'utf8')
        await rename(temporary, target)
      })
      .catch(error => ctx.logger.warn(`dsh-ja-study: state was not saved: ${String(error)}`))
    return writes
  }

  /** Today's count, reading the stored day as zero once the date rolled over. */
  function todayCount() {
    return state.day.date === todayKey() ? state.day.count : 0
  }

  /** The streak, zeroed once a day was missed. */
  function streakDays() {
    const yesterday = todayKey(new Date(Date.now() - 86_400_000))
    if (state.day.date === todayKey() || state.day.date === yesterday) return state.streak.days
    return 0
  }

  /**
   * One card from the requested deck, level or the whole course: unseen cards
   * first, the previous card excluded so a draw never repeats immediately.
   * @param {{id: string, level: string, cards: object[]}[]} decks
   * @param {{deck: string, level: string, lastCardId: string}} options
   */
  function drawCard(decks, options) {
    const pool = []
    for (const deck of decks) {
      if (options.deck !== '' && deck.id !== options.deck) continue
      if (options.level !== '' && deck.level !== options.level) continue
      for (const card of deck.cards) pool.push(card)
    }
    if (pool.length === 0) return null
    const fresh = pool.filter(card => !(state.cards[card.id]?.seen > 0))
    const unseen = fresh.length > 0 ? fresh : pool
    const withoutRepeat = unseen.filter(card => card.id !== options.lastCardId)
    const list = withoutRepeat.length > 0 ? withoutRepeat : unseen
    return list[Math.floor(Math.random() * list.length)]
  }

  /** Record one graded card, rolling the day and streak over when needed. */
  function gradeCard(cardId, correct) {
    const today = todayKey()
    if (state.day.date !== today) {
      const yesterday = todayKey(new Date(Date.now() - 86_400_000))
      state.streak.days = state.day.date === yesterday ? state.streak.days + 1 : 1
      state.streak.last = today
      state.day = { date: today, count: 0 }
    }
    state.day.count += 1
    const record = state.cards[cardId] ?? { seen: 0, correct: 0, wrong: 0, last: 0 }
    record.seen += 1
    if (correct) record.correct += 1
    else record.wrong += 1
    record.last = Date.now()
    state.cards[cardId] = record
    void save()
  }

  /** The panel's `state` payload. */
  async function viewState() {
    await ready
    const loaded = await loadDecks(current.coursesDir)
    return {
      ok: true,
      course: COURSE,
      goal: current.dailyGoal,
      today: todayCount(),
      streak: streakDays(),
      seenTotal: Object.values(state.cards).filter(record => record.seen > 0).length,
      totalCards: loaded.decks.reduce((sum, deck) => sum + deck.cards.length, 0),
      decks: loaded.decks.map(deck => ({ id: deck.id, name: deck.name, level: deck.level, count: deck.cards.length })),
      errors: loaded.errors,
    }
  }

  /** Loopback-only fence: these routes are control surfaces, not content. */
  function fromLoopback(req) {
    const address = req.socket?.remoteAddress ?? ''
    return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
  }

  function writeJson(res, status, payload) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify(payload))
  }

  function readJsonBody(req, limit = 65_536) {
    return new Promise((resolve) => {
      let size = 0
      const chunks = []
      req.on('data', (chunk) => {
        size += chunk.length
        if (size > limit) {
          req.destroy()
          resolve(null)
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => {
        try {
          resolve(chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString('utf8')))
        } catch {
          resolve(null)
        }
      })
      req.on('error', () => resolve(null))
    })
  }

  /** Wrap a POST handler: loopback guard, method check, JSON body, JSON reply. */
  function post(path, run) {
    return {
      kind: 'exact',
      path,
      handler: (req, res) => {
        if (!fromLoopback(req)) {
          writeJson(res, 403, { ok: false, error: 'forbidden: loopback-only' })
          return
        }
        if (req.method !== 'POST') {
          writeJson(res, 405, { ok: false, error: 'method-not-allowed' })
          return
        }
        readJsonBody(req)
          .then(async (body) => {
            if (body === null) {
              writeJson(res, 400, { ok: false, error: 'invalid-body' })
              return
            }
            try {
              const result = await run(body)
              writeJson(res, result.ok === true ? 200 : 400, result)
            } catch (error) {
              writeJson(res, 500, { ok: false, error: String(error?.message ?? error) })
            }
          })
          .catch((error) => {
            writeJson(res, 500, { ok: false, error: String(error?.message ?? error) })
          })
      },
    }
  }

  const routes = [
    {
      kind: 'exact',
      path: '/api/ja-study/state',
      handler: (req, res) => {
        if (!fromLoopback(req)) {
          writeJson(res, 403, { ok: false, error: 'forbidden: loopback-only' })
          return
        }
        if (req.method !== 'GET') {
          writeJson(res, 405, { ok: false, error: 'method-not-allowed' })
          return
        }
        viewState()
          .then(payload => writeJson(res, 200, payload))
          .catch(error => writeJson(res, 500, { ok: false, error: String(error?.message ?? error) }))
      },
    },
    post('/api/ja-study/card', async (body) => {
      await ready
      const deckId = typeof body?.deck === 'string' ? body.deck : ''
      const level = LEVELS.includes(body?.level) ? body.level : ''
      const lastCardId = typeof body?.lastCardId === 'string' ? body.lastCardId : ''
      const loaded = await loadDecks(current.coursesDir)
      const card = drawCard(loaded.decks, { deck: deckId, level, lastCardId })
      if (card === null) {
        return {
          ok: false,
          error: loaded.errors.length > 0 ? loaded.errors.join('; ') : 'no cards in this selection',
          decks: loaded.decks.map(deck => ({ id: deck.id, name: deck.name, level: deck.level, count: deck.cards.length })),
        }
      }
      return { ok: true, card, today: todayCount(), streak: streakDays(), goal: current.dailyGoal }
    }),
    post('/api/ja-study/grade', async (body) => {
      await ready
      const cardId = typeof body?.cardId === 'string' ? body.cardId : ''
      if (cardId === '') return { ok: false, error: 'cardId is required' }
      gradeCard(cardId, body?.correct === true)
      return { ok: true, cardId, today: todayCount(), streak: streakDays(), goal: current.dailyGoal }
    }),
  ]

  ctx.effect(() => {
    const disposers = routes.map(route => ctx.webServer.register(route))
    return () => {
      for (const dispose of disposers) dispose()
    }
  }, 'dsh-ja-study: routes')
}
