import { readFileSync } from 'node:fs'

const text = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const start = text.indexOf('const ROMAJI_KANA')
const hintStart = text.indexOf('function keystrokeHint')
const returnAt = text.indexOf("return ''", hintStart)
const end = text.indexOf('\n    }', returnAt) + '\n    }'.length
const code = text.slice(start, end)
const lib = new Function(`${code}\nreturn { romajiToKana, normalizeKana, extractReading, keystrokeHint, kanaToRomaji }`)()

const cleanRomaji = (t) => String(t).toLowerCase().replace(/[\s'’,，-]/g, '')
const accepts = (typed, reading) => {
  const sameSpelling = cleanRomaji(typed) === cleanRomaji(reading.romaji) && typed.trim() !== ''
  const sameKana = lib.normalizeKana(lib.romajiToKana(typed)) === lib.normalizeKana(reading.kana) && typed.trim() !== ''
  return sameSpelling || sameKana
}

const cases = [
  ['koohii', { kana: 'こーひー', romaji: 'koohii' }, true],
  ['ko-hi-', { kana: 'こーひー', romaji: 'koohii' }, true],
  ['kohii', { kana: 'こーひー', romaji: 'koohii' }, false],
  ['gakkou', { kana: 'がっこう', romaji: 'gakkou' }, true],
  ['gakko', { kana: 'がっこう', romaji: 'gakkou' }, false],
  ['sensei', { kana: 'せんせい', romaji: 'sensei' }, true],
  ['kyoo', { kana: 'きょう', romaji: 'kyou' }, true],
  ['kyou', { kana: 'きょう', romaji: 'kyou' }, true],
  ['si', { kana: 'し', romaji: 'shi' }, true],
  ['shi', { kana: 'し', romaji: 'shi' }, true],
  ['tu', { kana: 'つ', romaji: 'tsu' }, true],
  ['fu', { kana: 'ふ', romaji: 'fu' }, true],
  ['hu', { kana: 'ふ', romaji: 'fu' }, true],
  ['xtu', { kana: 'っ', romaji: 'tt' }, true],
  ['hon', { kana: 'ほん', romaji: 'hon' }, true],
  ["nan'youbi", { kana: 'なんようび', romaji: "nan'youbi" }, true],
  ['nanyoubi', { kana: 'なんようび', romaji: "nan'youbi" }, true],
  ['shinbun', { kana: 'しんぶん', romaji: 'shinbun' }, true],
  ['chotto', { kana: 'ちょっと', romaji: 'chotto' }, true],
  ['matcha', { kana: 'まっちゃ', romaji: 'matcha' }, true],
]

let bad = 0
for (const [typed, reading, want] of cases) {
  const got = accepts(typed, reading)
  if (got !== want) {
    bad++
    console.log(`FAIL: "${typed}" vs ${reading.kana}/${reading.romaji} -> ${got} (want ${want})`)
  }
}

const readings = [
  ['**水**（みず / mizu）', true],
  ['**カメラ**（かめら / kamera）', true],
  ['**上達（じょうたつ）** 是什么意思？', true],
  ['**約束（やくそく）** 是什么意思？', true],
  ['**こんにちは**（konnichiwa）', true],
  ['**きらきら**', true],
  ['**いらっしゃる**（irassharu）', true],
  ['**あ** ・ **ア**', true],
  ['**四**（よん・し / yon, shi）', false],
]
for (const [prompt, want] of readings) {
  const got = lib.extractReading(prompt)
  if ((got !== null) !== want) {
    bad++
    console.log(`extractReading(${prompt}) -> ${JSON.stringify(got)}`)
  }
}

const kanaCases = [
  ['こーひー', 'ko-hi-'],
  ['がっこう', 'gakkou'],
  ['まっちゃ', 'matcha'],
  ['じょうたつ', 'joutatsu'],
  ['やくそく', 'yakusoku'],
]
for (const [kana, want] of kanaCases) {
  const got = lib.kanaToRomaji(kana)
  if (got !== want) {
    bad++
    console.log(`kanaToRomaji(${kana}) -> ${got} (want ${want})`)
  }
}

console.log(bad === 0 ? 'ALL OK' : `${bad} FAILURES`)
