# dsh-ja-study

A Japanese study panel for [DeepSeek Harness](https://github.com/deepseek-ai):
a sidebar icon opens a card panel that flips through local deck JSON, tracks
today's count and your streak, and never calls the model.

Bundled content: **20 decks / 427 cards** — kana, N5 vocabulary and grammar,
daily-life words, adjectives, counters, katakana loanwords, honorifics and body
idioms — split into 初级 / 中级 / 高级.

## Features

- **Sidebar panel** with 初级 / 中级 / 高级 tabs; each level lists only its own
  decks, so a beginner draw never mixes in advanced cards.
- **Card-table look**: a card face that flips in 3D, a striped draw pile, a
  felt-green table glow, pill counts. The face palette follows the host theme
  tokens (`--dsw-alias-*`), with a 跟随 / 浅色 / 深色 switch for when the theme is
  too dark or too light.
- **Typing drill**: type the romaji reading of the card and press Enter. The
  checker converts your input back to kana, so `si`/`shi`, `tu`/`tsu`,
  `hu`/`fu`, `xtu`/`ltu` and `-` for ー all pass, and kana produced by a
  Japanese IME (`ん` for `n`) is compared directly. Cards without a kana
  reading keep the plain flip.
- **Pronunciation**: a 🔊 button on each face speaks the kana through the system
  Japanese voice, with a network TTS fallback when the page has none.
- **Small window**: a draggable, collapsible floating panel (`shell.overlay`) for
  practising beside the conversation. It shares progress and the typing switch
  with the main panel.
- **No tools, no prompt injection**: the plugin only registers a panel and three
  loopback JSON routes.

## Install

```bash
# from a checkout, with the DeepSeek Harness CLI
dsh plugin --profile <profile> add /absolute/path/to/dsh-ja-study
```

or install the directory from the GUI: **Plugins → Add plugin → local
directory**. Progress lives in `$DSH_HOME/ja-study.json`.

## Using it

1. Open the sidebar icon 日语学习; pick a level, then a deck (or 本阶段全部).
2. Click the card to flip, then 记住了 / 没记住; 换一张 draws another.
3. Turn on 键盘练习 to type readings, 小窗 for the floating panel, 🔊 to hear the
   word.

## Deck format

A deck is one JSON file under `courses/ja/` (`level` defaults to `beginner`):

```json
{
  "id": "ja-greeting",
  "course": "ja",
  "level": "beginner",
  "name": "问候",
  "description": "最常用的问候语。",
  "cards": [
    {
      "id": "ja-greeting-001",
      "type": "vocab",
      "prompt": "**おはよう**（ohayou）",
      "answer": "早上好。",
      "explanation": "平假名词，没有汉字要记；「う」是长音。",
      "tags": ["问候", "N5"]
    }
  ]
}
```

Card types are `vocab`, `quiz`, `concept` and `tip`. For the typing drill, put a
reading in the prompt as `（かめら / kamera）` (kana + romaji) or `（じょうたつ）`
(kana only); the plugin extracts it and generates the other form when missing.

## Configuration

```yaml
- insert:
    - id: ja-study
      name: 'dsh-ja-study'
      config:
        # optional: your own course-pack root shaped like `ja/<deck>.json`
        # coursesDir: /absolute/path/to/courses
        dailyGoal: 10
```

Without `coursesDir` the plugin reads the decks bundled in `courses/`. Decks are
read on every request, so editing a deck file needs no reload.

## Data and privacy

- Progress: `$DSH_HOME/ja-study.json` (today's count, streak, per-card
  seen/correct/wrong). Deleting it resets the counts.
- The routes are plain web routes without the GUI token, fenced to loopback — the
  same exposure as the Harness listener itself.
- Pronunciation uses the system voice when available; otherwise the fallback
  sends only the word being read to `translate.google.com`.

## Development

```bash
node test/romaji.mjs    # romaji ⇄ kana and reading extraction
node test/coverage.mjs  # how many bundled cards expose a typing reading
```

## License

MIT. The `courses/ja/vocab.json`, `courses/ja/grammar.json` and
`courses/ja/culture.json` seed decks come from
[Smallballoons01/dsh-idle-scholar](https://github.com/Smallballoons01/dsh-idle-scholar)
(MIT); the rest were written for this plugin. The panel's card-table visual
language follows [dsh-card-lan](https://github.com/Fatelikeshit/dsh-card-lan).
