import { readFileSync } from 'node:fs'

const text = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const start = text.indexOf('const ROMAJI_KANA')
const hintStart = text.indexOf('function keystrokeHint')
const returnAt = text.indexOf("return ''", hintStart)
const end = text.indexOf('\n    }', returnAt) + '\n    }'.length
const lib = new Function(`${text.slice(start, end)}\nreturn { extractReading }`)()

const dir = new URL('../courses/ja/', import.meta.url)
const { readdirSync } = await import('node:fs')
let total = 0
let withReading = 0
const missing = {}
for (const file of readdirSync(dir)) {
  const deck = JSON.parse(readFileSync(new URL(file, dir), 'utf8'))
  for (const card of deck.cards) {
    total += 1
    if (lib.extractReading(card.prompt) !== null) withReading += 1
    else missing[deck.id] = (missing[deck.id] ?? 0) + 1
  }
}
console.log(`cards with typing reading: ${withReading}/${total}`)
for (const [id, count] of Object.entries(missing)) console.log(`  no reading: ${id} ${count}`)
