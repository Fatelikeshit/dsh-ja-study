/**
 * dsh-ja-study — browser half.
 *
 * Registers the `ja-study` icon in `sidebar.panellist` and the matching `main`
 * panel. The look follows the LAN card table's design language: an ivory
 * playing-card face with ink text, a striped card back, a felt-table glow and
 * pill labels. The panel is plain React from the browser module table and reads
 * the host's `/api/ja-study/*` routes; it registers no tools.
 */
window.__ModuleLoader__.load({
  id: 'dsh-ja-study',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const API = {
      state: '/api/ja-study/state',
      card: '/api/ja-study/card',
      grade: '/api/ja-study/grade',
    }

    const TYPE_LABELS = { vocab: '词汇', quiz: '测验', concept: '概念', tip: '贴士' }

    /** Background tone: follow the host theme, or pin light/dark locally. */
    const TONE_KEY = 'dsh-ja-study:tone'
    const TYPING_KEY = 'dsh-ja-study:typing'
    const TONES = [
      { id: 'auto', label: '跟随' },
      { id: 'light', label: '浅色' },
      { id: 'dark', label: '深色' },
    ]

    /** Study levels; a deck declares one in its JSON (`level`). */
    const LEVELS = [
      { id: 'beginner', label: '初级' },
      { id: 'intermediate', label: '中级' },
      { id: 'advanced', label: '高级' },
    ]

    const OVERLAY_KEY = 'dsh-ja-study:overlay'
    const FLOAT_COLLAPSED_KEY = 'dsh-ja-study:float:collapsed'
    const FLOAT_POS_KEY = 'dsh-ja-study:float:pos'

    /** localStorage helpers that never throw (private mode, disabled storage). */
    function readLocal(key, fallback) {
      try {
        const value = window.localStorage.getItem(key)
        return value === null ? fallback : value
      } catch {
        return fallback
      }
    }

    function writeLocal(key, value) {
      try {
        window.localStorage.setItem(key, value)
      } catch {
        /* storage unavailable: the choice simply does not persist */
      }
    }

    /** Tiny module-level stores so the panel and the float stay in sync. */
    const shared = {
      tone: { value: readLocal(TONE_KEY, 'auto'), listeners: new Set() },
      overlay: { value: readLocal(OVERLAY_KEY, '1') !== '0', listeners: new Set() },
      typing: { value: readLocal(TYPING_KEY, '0') === '1', listeners: new Set() },
    }
    shared.tone.value = shared.tone.value === 'light' || shared.tone.value === 'dark' ? shared.tone.value : 'auto'

    function sharedSet(entry, next) {
      entry.value = next
      for (const listener of entry.listeners) listener(next)
    }

    /** Subscribe a component to a shared store entry. */
    function useSharedValue(entry) {
      const [value, setValue] = React.useState(entry.value)
      React.useEffect(() => {
        entry.listeners.add(setValue)
        return () => {
          entry.listeners.delete(setValue)
        }
      }, [])
      return value
    }

    /**
     * Keep today's numbers fresh: the count resets at midnight, and the float
     * can be open for days, so refresh on an interval, on focus and on tab
     * visibility instead of only at mount.
     * @param {() => Promise<unknown>} refresh
     */
    function useAutoRefresh(refresh) {
      React.useEffect(() => {
        const tick = () => {
          if (document.visibilityState === 'visible') void refresh()
        }
        const timer = window.setInterval(tick, 60_000)
        window.addEventListener('focus', tick)
        document.addEventListener('visibilitychange', tick)
        return () => {
          window.clearInterval(timer)
          window.removeEventListener('focus', tick)
          document.removeEventListener('visibilitychange', tick)
        }
      }, [refresh])
    }

    const CSS = `
      .jas-root {
        box-sizing: border-box; height: 100%; overflow: auto;
        padding: 22px 24px 26px;
        background: var(--dsw-alias-bg-base, #16181c);
        color: var(--dsw-alias-label-primary, #e6e8ec);
        font: 13px/1.6 system-ui, -apple-system, 'Segoe UI', 'Noto Sans CJK JP', sans-serif;
        /* Card palette: dark by default so the face never glares on a dark
           table; the light/dark tones below override these. In 跟随 mode the
           values come from the host theme tokens. */
        --jas-face-bg: var(--dsw-alias-bg-layer-2, #23272e);
        --jas-face-back: color-mix(in srgb, var(--dsw-alias-bg-layer-2, #23272e) 92%, var(--dsw-alias-label-primary, #e6e8ec));
        --jas-face-ink: var(--dsw-alias-label-primary, #e6e8ec);
        --jas-face-muted: var(--dsw-alias-label-secondary, #9aa1ad);
        --jas-face-line: var(--dsw-alias-border-l2, #3a4048);
        --jas-face-tag-bg: color-mix(in srgb, var(--dsw-alias-label-primary, #e6e8ec) 9%, transparent);
        --jas-face-tag-ink: var(--dsw-alias-label-secondary, #9aa1ad);
        --jas-face-pip: color-mix(in srgb, var(--dsw-alias-label-primary, #e6e8ec) 14%, transparent);
        --jas-face-shadow: 0 16px 36px rgba(2, 6, 23, .45);
      }
      /* The study surface borrows the card table's felt glow and hairline frame. */
      .jas-table {
        display: flex; flex-direction: column; gap: 14px;
        width: 100%; max-width: 940px; min-height: 460px;
        margin: 0 auto; box-sizing: border-box; padding: 20px 22px 18px;
        border-radius: 18px;
        background:
          radial-gradient(120% 90% at 50% 0%, rgba(34, 197, 94, .16), transparent 62%),
          var(--dsw-alias-bg-layer-1, #1b1e24);
        border: 1px solid var(--dsw-alias-border-l1, #2c3037);
        box-shadow: 0 18px 48px rgba(2, 6, 23, .28), inset 0 0 0 1px rgba(34, 197, 94, .06);
      }
      .jas-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; }
      .jas-title { font-size: 17px; font-weight: 650; letter-spacing: .01em; }
      .jas-sub { color: var(--dsw-alias-label-secondary, #9aa1ad); font-size: 12px; }
      .jas-pills { display: flex; flex-wrap: wrap; gap: 8px; margin-left: auto; }
      .jas-pill {
        display: inline-flex; align-items: center; gap: 4px;
        padding: 1px 10px; border-radius: 999px; font-size: 11.5px; line-height: 1.8;
        border: 1px solid var(--dsw-alias-border-l1, #2c3037);
        background: var(--dsw-alias-bg-layer-2, #23272e);
        color: var(--dsw-alias-label-secondary, #9aa1ad);
        white-space: nowrap; font-variant-numeric: tabular-nums;
      }
      .jas-pill strong { color: var(--dsw-alias-label-primary, #e6e8ec); font-weight: 600; }
      .jas-pill.is-good { background: rgba(34, 197, 94, .14); border-color: rgba(34, 197, 94, .38); color: #4ade80; }
      .jas-pill.is-good strong { color: #86efac; }
      .jas-pill.is-warn { background: rgba(245, 158, 11, .14); border-color: rgba(245, 158, 11, .38); color: #fbbf24; }
      .jas-pill.is-warn strong { color: #fde68a; }
      /* Tone switch: follow the host theme by default, or pin light/dark. */
      .jas-tone {
        display: inline-flex; align-items: center; gap: 2px; padding: 2px;
        border-radius: 8px; background: var(--dsw-alias-bg-layer-2, #23272e);
        border: 1px solid var(--dsw-alias-border-l1, #2c3037);
      }
      .jas-tone-btn {
        font: inherit; font-size: 11px; line-height: 1.5; padding: 2px 9px;
        border: none; border-radius: 6px; background: transparent; cursor: pointer;
        color: var(--dsw-alias-label-secondary, #9aa1ad);
      }
      .jas-tone-btn:hover { color: var(--dsw-alias-label-primary, #e6e8ec); }
      .jas-tone-btn[data-active='true'] {
        background: var(--dsw-alias-bg-layer-1, #1b1e24);
        color: var(--dsw-alias-label-primary, #e6e8ec); font-weight: 600;
        box-shadow: inset 0 0 0 1px var(--dsw-alias-brand-primary, #4d6bfe);
      }
      /* Level tabs: 初级 / 中级 / 高级, each holding its own decks. */
      .jas-levels { display: flex; flex-wrap: wrap; gap: 6px; }
      .jas-level {
        font: inherit; font-size: 12.5px; line-height: 1.4; padding: 6px 16px;
        border-radius: 8px; cursor: pointer; font-variant-numeric: tabular-nums;
        background: transparent; border: 1px solid var(--dsw-alias-border-l1, #2c3037);
        color: var(--dsw-alias-label-secondary, #9aa1ad);
      }
      .jas-level:hover:not(:disabled) { color: var(--dsw-alias-label-primary, #e6e8ec); border-color: var(--dsw-alias-border-l2, #3a4048); }
      .jas-level[data-active='true'] {
        background: var(--dsw-alias-bg-layer-2, #23272e);
        border-color: var(--dsw-alias-border-l2, #3a4048);
        color: var(--dsw-alias-label-primary, #e6e8ec); font-weight: 600;
      }
      .jas-level:disabled { opacity: .38; cursor: default; }
      /* Deck picker: the lobby's tab rhythm. */
      .jas-tabs {
        display: flex; flex-wrap: wrap; gap: 4px;
        border-bottom: 1px solid var(--dsw-alias-border-l1, #2c3037); padding-bottom: 2px;
      }
      .jas-tab {
        font: inherit; font-size: 12px; line-height: 1.4; padding: 5px 12px;
        border-radius: 8px 8px 0 0; cursor: pointer; border: 1px solid transparent;
        background: transparent; color: var(--dsw-alias-label-secondary, #9aa1ad);
        transition: color .15s ease, background .15s ease;
      }
      .jas-tab:hover { color: var(--dsw-alias-label-primary, #e6e8ec); }
      .jas-tab[data-active='true'] {
        background: var(--dsw-alias-bg-layer-2, #23272e);
        border-color: var(--dsw-alias-border-l1, #2c3037); border-bottom-color: transparent;
        color: var(--dsw-alias-label-primary, #e6e8ec); font-weight: 600;
      }
      .jas-stage {
        flex: 1; position: relative; display: flex; align-items: center; justify-content: center;
        padding: 14px 0 6px; perspective: 1400px;
      }
      .jas-deal { width: min(560px, 100%); animation: jas-deal .42s cubic-bezier(.2, .8, .2, 1); }
      @keyframes jas-deal {
        from { opacity: 0; transform: translateY(10px) scale(.985); }
        to { opacity: 1; transform: none; }
      }
      .jas-cardwrap { width: 100%; height: 300px; perspective: 1400px; }
      .jas-card3d {
        position: relative; width: 100%; height: 100%;
        transform-style: preserve-3d; cursor: pointer;
        transition: transform .45s cubic-bezier(.2, .8, .2, 1);
      }
      .jas-card3d[data-flipped='true'] { transform: rotateY(180deg); }
      /* Opacity mirrors the flip so the answer is visible even if a browser
         ignores backface-visibility on a scrollable face. */
      .jas-card3d[data-flipped='false'] .jas-back { opacity: 0; }
      .jas-card3d[data-flipped='true'] .jas-front { opacity: 0; }
      .jas-face {
        position: absolute; inset: 0; box-sizing: border-box;
        display: flex; flex-direction: column; gap: 12px;
        padding: 22px 26px 18px; border-radius: 12px;
        background: var(--jas-face-bg); color: var(--jas-face-ink);
        backface-visibility: hidden; -webkit-backface-visibility: hidden;
        box-shadow: var(--jas-face-shadow), inset 0 0 0 1px var(--jas-face-line);
        overflow-y: auto; transition: opacity .28s ease;
      }
      /* A suit pip in the corner, like a printed card. */
      .jas-face::after {
        content: ''; position: absolute; top: 16px; right: 18px;
        width: 9px; height: 9px; border-radius: 2px;
        background: var(--jas-face-pip); transform: rotate(45deg);
      }
      .jas-back { transform: rotateY(180deg); background: var(--jas-face-back); }
      .jas-ribbon {
        font-size: 10.5px; letter-spacing: .14em; text-transform: uppercase;
        color: var(--jas-face-muted); opacity: .85; font-weight: 600;
      }
      .jas-face-head { display: flex; align-items: center; gap: 8px; }
      .jas-speak {
        margin-left: auto; padding: 0 2px; border: none; background: transparent;
        color: var(--jas-face-muted); cursor: pointer; font-size: 15px; line-height: 1;
        filter: grayscale(.3); transition: filter .15s ease, transform .15s ease;
      }
      .jas-speak:hover { filter: none; transform: scale(1.1); }
      .jas-speak:active { transform: scale(.95); }
      .jas-prompt {
        margin: auto 0; font-size: 24px; line-height: 1.5; font-weight: 600;
        color: var(--jas-face-ink); overflow-wrap: anywhere;
      }
      .jas-hint { font-size: 12.5px; color: var(--jas-face-muted); }
      .jas-answer {
        margin-top: 4px; font-size: 21px; line-height: 1.5; font-weight: 600;
        color: var(--jas-face-ink); overflow-wrap: anywhere;
      }
      .jas-explain { font-size: 13px; line-height: 1.8; color: var(--jas-face-muted); overflow-wrap: anywhere; }
      .jas-tags { display: flex; flex-wrap: wrap; gap: 6px; }
      .jas-tag {
        font-size: 11px; line-height: 1.7; padding: 0 8px; border-radius: 6px;
        background: var(--jas-face-tag-bg); color: var(--jas-face-tag-ink);
      }
      .jas-flipnote { margin-top: auto; font-size: 11.5px; color: var(--jas-face-muted); opacity: .65; }
      /* Face-down draw pile, straight from the card table. */
      .jas-pile {
        position: relative; width: 132px; height: 168px; padding: 0;
        border: none; background: transparent; cursor: pointer;
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
      }
      .jas-backcard {
        position: absolute; top: 8px; left: 50%; width: 84px; height: 116px; box-sizing: border-box;
        border-radius: 8px; transform: translateX(-58%) rotate(-6deg);
        background: repeating-linear-gradient(135deg, #3b5b8f 0 6px, #27436f 6px 12px);
        box-shadow: 0 3px 10px rgba(2, 6, 23, .4), inset 0 0 0 1px rgba(255, 255, 255, .18);
      }
      .jas-backcard + .jas-backcard { transform: translateX(-42%) rotate(5deg); }
      .jas-pile-label { margin-top: 132px; font-size: 12px; color: var(--dsw-alias-label-secondary, #9aa1ad); }
      .jas-pile:hover .jas-backcard { filter: brightness(1.08); }
      .jas-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 10px; }
      .jas-btn {
        font: inherit; font-size: 12.5px; line-height: 1.4; padding: 7px 16px;
        border-radius: 8px; cursor: pointer;
        background: var(--dsw-alias-bg-layer-2, #23272e);
        border: 1px solid var(--dsw-alias-border-l1, #2c3037);
        color: var(--dsw-alias-label-primary, #e6e8ec);
        transition: border-color .15s ease, filter .15s ease, opacity .15s ease;
      }
      .jas-btn:hover:not(:disabled) { border-color: var(--dsw-alias-border-l2, #3a4048); }
      .jas-btn:disabled { opacity: .45; cursor: not-allowed; }
      .jas-btn[data-kind='good'] { background: rgba(34, 197, 94, .14); border-color: rgba(34, 197, 94, .42); color: #86efac; }
      .jas-btn[data-kind='bad'] { background: rgba(239, 68, 68, .13); border-color: rgba(239, 68, 68, .4); color: #fca5a5; }
      .jas-btn[data-kind='primary'] { background: rgba(77, 107, 254, .2); border-color: rgba(77, 107, 254, .5); color: #c7d2fe; font-weight: 600; }
      /* Typing drill, drawn on the card face so it inherits the face palette. */
      .jas-typebox { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
      .jas-typelabel { font-size: 12px; color: var(--jas-face-muted); }
      .jas-input {
        width: 100%; box-sizing: border-box; padding: 7px 10px; border-radius: 8px;
        font: inherit; font-size: 14px; letter-spacing: .02em; outline: none;
        background: var(--jas-face-tag-bg); border: 1px solid var(--jas-face-line);
        color: var(--jas-face-ink);
      }
      .jas-input:focus { border-color: var(--dsw-alias-brand-primary, #4d6bfe); }
      .jas-input::placeholder { color: var(--jas-face-muted); opacity: .7; }
      .jas-typeok { font-size: 12.5px; color: var(--dsw-alias-state-success-primary, #22c55e); }
      .jas-typeerr { font-size: 12.5px; color: var(--dsw-alias-state-error-primary, #f87171); }
      .jas-keys { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; font-size: 12px; color: var(--jas-face-muted); }
      .jas-keys code {
        font-family: ui-monospace, Consolas, monospace; font-size: 12.5px;
        color: var(--jas-face-ink); background: var(--jas-face-tag-bg);
        padding: 1px 6px; border-radius: 4px;
      }
      .jas-keyhint { opacity: .8; }
      /* Floating small-window mode, following the LAN card table's overlay. */
      .jas-float {
        position: fixed; right: 16px; bottom: 96px; z-index: 2147482000;
        width: 336px; max-width: calc(100vw - 32px); max-height: min(76vh, 520px);
        height: auto; box-sizing: border-box; display: flex; flex-direction: column; gap: 9px;
        padding: 12px 14px; border-radius: 14px;
        overflow: auto; overscroll-behavior: contain;
        background:
          radial-gradient(120% 90% at 50% 0%, rgba(34, 197, 94, .14), transparent 62%),
          var(--dsw-alias-bg-overlay, rgba(15, 23, 42, .94));
        border: 1px solid var(--dsw-alias-border-l1, #2c3037);
        box-shadow: 0 18px 48px rgba(2, 6, 23, .45);
        backdrop-filter: blur(14px); pointer-events: auto;
      }
      .jas-float.is-collapsed { width: auto; height: auto; max-height: none; padding: 6px 12px; cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none; }
      .jas-float.is-collapsed:active { cursor: grabbing; }
      .jas-float-head {
        display: flex; align-items: center; gap: 8px;
        cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none;
      }
      .jas-float-head:active { cursor: grabbing; }
      .jas-float-title { font-size: 13px; font-weight: 650; white-space: nowrap; }
      .jas-float-tools { margin-left: auto; display: flex; align-items: center; gap: 6px; }
      .jas-float-min {
        font-size: 11px; line-height: 1; padding: 4px 7px; border-radius: 6px;
        border: 1px solid var(--dsw-alias-border-l1, #2c3037);
        background: var(--dsw-alias-bg-layer-2, #23272e);
        color: var(--dsw-alias-label-secondary, #9aa1ad); cursor: pointer;
      }
      .jas-float-min[data-active='true'] {
        border-color: var(--dsw-alias-brand-primary, #4d6bfe);
        color: var(--dsw-alias-label-primary, #e6e8ec);
        box-shadow: inset 0 0 0 1px var(--dsw-alias-brand-primary, #4d6bfe);
      }
      .jas-select {
        width: 100%; box-sizing: border-box; padding: 5px 8px; border-radius: 8px;
        font: inherit; font-size: 12px; outline: none;
        background: var(--dsw-alias-bg-layer-2, #23272e);
        border: 1px solid var(--dsw-alias-border-l1, #2c3037);
        color: var(--dsw-alias-label-primary, #e6e8ec);
      }
      .jas-float .jas-stage { padding: 2px 0 0; }
      .jas-float .jas-cardwrap { height: 166px; }
      .jas-float .jas-prompt { font-size: 16.5px; }
      .jas-float .jas-answer { font-size: 15px; }
      .jas-float .jas-explain { font-size: 11.5px; line-height: 1.6; }
      .jas-float .jas-ribbon { font-size: 9.5px; }
      .jas-float .jas-face { padding: 14px 16px 12px; border-radius: 10px; gap: 8px; }
      .jas-float .jas-actions { gap: 6px; }
      .jas-float .jas-btn { padding: 5px 10px; font-size: 11.5px; }
      .jas-float .jas-flipnote { font-size: 10.5px; }
      .jas-float .jas-keys { font-size: 10.5px; }
      .jas-float .jas-keys code { font-size: 11px; }
      .jas-float .jas-typebox { gap: 6px; }
      .jas-float .jas-input { font-size: 12px; padding: 5px 8px; }
      .jas-meter-row { display: flex; align-items: center; gap: 10px; }
      .jas-meter { flex: 1; height: 4px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2, #23272e); overflow: hidden; }
      .jas-meter > i { display: block; height: 100%; background: linear-gradient(90deg, rgba(34, 197, 94, .85), rgba(34, 197, 94, .5)); }
      .jas-meter-label { font-size: 11.5px; color: var(--dsw-alias-label-secondary, #9aa1ad); white-space: nowrap; }
      .jas-empty, .jas-err { text-align: center; font-size: 13px; color: var(--dsw-alias-label-secondary, #9aa1ad); }
      .jas-err { color: var(--dsw-alias-state-error-primary, #f87171); }
      .jas-foot { margin: 10px auto 0; max-width: 940px; font-size: 11.5px; color: var(--dsw-alias-label-secondary, #9aa1ad); }
      .jas-root :focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe); outline-offset: 2px; }
      /* Pinned light palette: paper table, warm hairlines, ink text. */
      .jas-root[data-tone='light'] { background: #efece3; color: #1b1f27; }
      .jas-root[data-tone='light'] .jas-table {
        background: radial-gradient(120% 90% at 50% 0%, rgba(34, 197, 94, .14), transparent 62%), #faf7ef;
        border-color: #ddd6c6; box-shadow: 0 14px 36px rgba(60, 50, 30, .12);
      }
      .jas-root[data-tone='light'] .jas-sub,
      .jas-root[data-tone='light'] .jas-meter-label,
      .jas-root[data-tone='light'] .jas-foot,
      .jas-root[data-tone='light'] .jas-pile-label { color: #6b6659; }
      .jas-root[data-tone='light'] .jas-pill { background: #f1ecdf; border-color: #ddd6c6; color: #6b6659; }
      .jas-root[data-tone='light'] .jas-pill strong { color: #1b1f27; }
      .jas-root[data-tone='light'] .jas-pill.is-good { background: rgba(34, 197, 94, .16); border-color: rgba(34, 197, 94, .42); color: #1d7a3a; }
      .jas-root[data-tone='light'] .jas-pill.is-good strong { color: #166534; }
      .jas-root[data-tone='light'] .jas-pill.is-warn { background: rgba(245, 158, 11, .18); border-color: rgba(245, 158, 11, .45); color: #96620a; }
      .jas-root[data-tone='light'] .jas-pill.is-warn strong { color: #7c4a09; }
      .jas-root[data-tone='light'] .jas-tabs { border-bottom-color: #ddd6c6; }
      .jas-root[data-tone='light'] .jas-tab { color: #6b6659; }
      .jas-root[data-tone='light'] .jas-tab:hover { color: #1b1f27; }
      .jas-root[data-tone='light'] .jas-tab[data-active='true'] { background: #fffdf8; border-color: #ddd6c6; color: #1b1f27; }
      .jas-root[data-tone='light'] .jas-btn { background: #fffdf8; border-color: #d8d1c0; color: #1b1f27; }
      .jas-root[data-tone='light'] .jas-btn:hover:not(:disabled) { border-color: #b9b09a; }
      .jas-root[data-tone='light'] .jas-btn[data-kind='good'] { background: rgba(34, 197, 94, .16); border-color: rgba(34, 197, 94, .45); color: #1d7a3a; }
      .jas-root[data-tone='light'] .jas-btn[data-kind='bad'] { background: rgba(220, 38, 38, .1); border-color: rgba(220, 38, 38, .35); color: #b3261e; }
      .jas-root[data-tone='light'] .jas-btn[data-kind='primary'] { background: rgba(77, 107, 254, .14); border-color: rgba(77, 107, 254, .4); color: #3b4fd0; }
      .jas-root[data-tone='light'] .jas-meter { background: #e4ded0; }
      .jas-root[data-tone='light'] .jas-tone { background: #f1ecdf; border-color: #ddd6c6; }
      .jas-root[data-tone='light'] .jas-tone-btn { color: #6b6659; }
      .jas-root[data-tone='light'] .jas-tone-btn[data-active='true'] { background: #fffdf8; color: #1b1f27; }
      .jas-root[data-tone='light'] .jas-level { border-color: #ddd6c6; color: #6b6659; }
      .jas-root[data-tone='light'] .jas-level[data-active='true'] { background: #fffdf8; border-color: #cfc7b4; color: #1b1f27; }
      .jas-root[data-tone='light'] {
        --jas-face-bg: #f6f3ea;
        --jas-face-back: #fbf8f1;
        --jas-face-ink: #1b1f27;
        --jas-face-muted: #5c574c;
        --jas-face-line: rgba(120, 105, 70, .18);
        --jas-face-tag-bg: rgba(27, 31, 39, .07);
        --jas-face-tag-ink: #5c574c;
        --jas-face-pip: rgba(27, 31, 39, .14);
        --jas-face-shadow: 0 10px 24px rgba(60, 50, 30, .18);
      }
      /* Pinned dark palette: near-black felt with a stronger green pool. */
      .jas-root[data-tone='dark'] { background: #0b0d10; color: #edf1f2; }
      .jas-root[data-tone='dark'] .jas-table {
        background: radial-gradient(120% 90% at 50% 0%, rgba(34, 197, 94, .18), transparent 62%), #14181d;
        border-color: #2a3238; box-shadow: 0 18px 48px rgba(2, 6, 23, .45), inset 0 0 0 1px rgba(34, 197, 94, .07);
      }
      .jas-root[data-tone='dark'] .jas-sub,
      .jas-root[data-tone='dark'] .jas-meter-label,
      .jas-root[data-tone='dark'] .jas-foot,
      .jas-root[data-tone='dark'] .jas-pile-label { color: #98a3a9; }
      .jas-root[data-tone='dark'] .jas-pill { background: #1b2227; border-color: #2e373d; color: #98a3a9; }
      .jas-root[data-tone='dark'] .jas-pill strong { color: #edf1f2; }
      .jas-root[data-tone='dark'] .jas-tabs { border-bottom-color: #2a3238; }
      .jas-root[data-tone='dark'] .jas-tab { color: #98a3a9; }
      .jas-root[data-tone='dark'] .jas-tab:hover { color: #edf1f2; }
      .jas-root[data-tone='dark'] .jas-tab[data-active='true'] { background: #1b2227; border-color: #2e373d; color: #edf1f2; }
      .jas-root[data-tone='dark'] .jas-btn { background: #1b2227; border-color: #2e373d; color: #edf1f2; }
      .jas-root[data-tone='dark'] .jas-btn:hover:not(:disabled) { border-color: #3d474e; }
      .jas-root[data-tone='dark'] .jas-meter { background: #1b2227; }
      .jas-root[data-tone='dark'] .jas-tone { background: #1b2227; border-color: #2e373d; }
      .jas-root[data-tone='dark'] .jas-tone-btn { color: #98a3a9; }
      .jas-root[data-tone='dark'] .jas-tone-btn[data-active='true'] { background: #10161a; color: #edf1f2; }
      .jas-root[data-tone='dark'] .jas-level { border-color: #2e373d; color: #98a3a9; }
      .jas-root[data-tone='dark'] .jas-level[data-active='true'] { background: #1b2227; border-color: #3d474e; color: #edf1f2; }
      .jas-root[data-tone='dark'] {
        --jas-face-bg: #1c2228;
        --jas-face-back: #232b32;
        --jas-face-ink: #edf1f2;
        --jas-face-muted: #98a3a9;
        --jas-face-line: rgba(255, 255, 255, .08);
        --jas-face-tag-bg: rgba(255, 255, 255, .07);
        --jas-face-tag-ink: #b7c1c7;
        --jas-face-pip: rgba(255, 255, 255, .12);
        --jas-face-shadow: 0 16px 36px rgba(0, 0, 0, .5);
      }
      @media (max-width: 620px) {
        .jas-root { padding: 12px 12px 18px; }
        .jas-table { padding: 14px 14px 12px; min-height: 0; }
        .jas-cardwrap { height: 264px; }
        .jas-prompt { font-size: 20px; }
        .jas-answer { font-size: 18px; }
      }
      @media (prefers-reduced-motion: reduce) {
        .jas-card3d, .jas-deal, .jas-btn, .jas-tab { transition: none; animation: none; }
      }
    `

    /** Fetch a route; throws with the host's error text on a non-ok reply. */
    async function api(path, body) {
      const response = await fetch(path, {
        method: body === undefined ? 'GET' : 'POST',
        credentials: 'same-origin',
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      let data = null
      try {
        data = await response.json()
      } catch {
        data = null
      }
      if (data === null || data.ok === false || !response.ok) {
        throw new Error((data && data.error) || `request failed: HTTP ${response.status}`)
      }
      return data
    }

    /** Render `**bold**` inside deck text without pulling a markdown library. */
    function rich(text) {
      const parts = String(text).split(/\*\*(.+?)\*\*/g)
      return parts.map((part, index) => (index % 2 === 1 ? h('strong', { key: index }, part) : part))
    }

    /** Romaji → kana, the subset of IME rules a learner actually types. */
    const ROMAJI_KANA = {
      a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
      ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ',
      sa: 'さ', si: 'し', shi: 'し', su: 'す', se: 'せ', so: 'そ',
      ta: 'た', ti: 'ち', chi: 'ち', tu: 'つ', tsu: 'つ', te: 'て', to: 'と',
      na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の',
      ha: 'は', hi: 'ひ', hu: 'ふ', fu: 'ふ', he: 'へ', ho: 'ほ',
      ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も',
      ya: 'や', yu: 'ゆ', yo: 'よ',
      ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ',
      wa: 'わ', wo: 'を',
      ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご',
      za: 'ざ', zi: 'じ', ji: 'じ', zu: 'ず', ze: 'ぜ', zo: 'ぞ',
      da: 'だ', di: 'ぢ', du: 'づ', de: 'で', do: 'ど',
      ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ',
      pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ',
      kya: 'きゃ', kyu: 'きゅ', kyo: 'きょ',
      sha: 'しゃ', sya: 'しゃ', shu: 'しゅ', syu: 'しゅ', sho: 'しょ', syo: 'しょ',
      cha: 'ちゃ', tya: 'ちゃ', chu: 'ちゅ', tyu: 'ちゅ', cho: 'ちょ', tyo: 'ちょ',
      nya: 'にゃ', nyu: 'にゅ', nyo: 'にょ',
      hya: 'ひゃ', hyu: 'ひゅ', hyo: 'ひょ',
      mya: 'みゃ', myu: 'みゅ', myo: 'みょ',
      rya: 'りゃ', ryu: 'りゅ', ryo: 'りょ',
      gya: 'ぎゃ', gyu: 'ぎゅ', gyo: 'ぎょ',
      ja: 'じゃ', zya: 'じゃ', ju: 'じゅ', zyu: 'じゅ', jo: 'じょ', zyo: 'じょ',
      bya: 'びゃ', byu: 'びゅ', byo: 'びょ',
      pya: 'ぴゃ', pyu: 'ぴゅ', pyo: 'ぴょ',
      xa: 'ぁ', xi: 'ぃ', xu: 'ぅ', xe: 'ぇ', xo: 'ぉ',
      xya: 'ゃ', xyu: 'ゅ', xyo: 'ょ', xtu: 'っ', xtsu: 'っ', ltu: 'っ', lya: 'ゃ', lyu: 'ゅ', lyo: 'ょ',
    }

    /**
     * Convert what the user typed into kana so any valid spelling passes:
     * `si`/`shi`, `tu`/`tsu`, `hu`/`fu`, `xtu`/`ltu`, doubled consonants, etc.
     * @param {string} input
     */
    function romajiToKana(input) {
      const text = String(input).toLowerCase().replace(/\s+/g, '')
      let out = ''
      let index = 0
      while (index < text.length) {
        const rest = text.slice(index)
        if (rest.startsWith("n'")) {
          out += 'ん'
          index += 2
          continue
        }
        if (rest.startsWith('nn')) {
          out += 'ん'
          index += 1
          continue
        }
        if (rest[0] === 'n' && !/[aiueoy]/.test(rest[1] ?? '')) {
          out += 'ん'
          index += 1
          continue
        }
        if (rest[0] === '-' || rest[0] === 'ー') {
          out += 'ー'
          index += 1
          continue
        }
        if (rest.startsWith('tch')) {
          out += 'っ'
          index += 1
          continue
        }
        if (/[bcdfghjklmnpqrstvwxyz]/.test(rest[0]) && rest[0] === rest[1]) {
          out += 'っ'
          index += 1
          continue
        }
        let matched = false
        for (const length of [3, 2, 1]) {
          const piece = rest.slice(0, length)
          if (piece.length === length && ROMAJI_KANA[piece] !== undefined) {
            out += ROMAJI_KANA[piece]
            index += length
            matched = true
            break
          }
        }
        if (!matched) index += 1
      }
      return out
    }

    /**
     * Compare readings loosely: drop ー, collapse long vowels (おう/おお/えい) and
     * small-kana + vowel, so `koohii`, `ko-hii` and `こーひー` all match.
     * @param {string} kana
     */
    function normalizeKana(kana) {
      return String(kana)
        .replace(/[・\s]/g, '')
        .replace(/ー/g, '')
        .replace(/おう|おお/g, 'お')
        .replace(/えい|ええ/g, 'え')
        .replace(/ああ/g, 'あ')
        .replace(/いい/g, 'い')
        .replace(/うう/g, 'う')
        .replace(/([ゃゅょ])[あいうえお]/g, '$1')
    }

    /** Reverse map, preferring the canonical IME spelling (shi, chi, tsu, fu). */
    const KANA_ROMAJI = (() => {
      const prefer = ['shi', 'chi', 'tsu', 'fu', 'ji', 'sha', 'shu', 'sho', 'cha', 'chu', 'cho', 'ja', 'ju', 'jo']
      const map = {}
      for (const [romaji, kana] of Object.entries(ROMAJI_KANA)) {
        if (map[kana] !== undefined && !prefer.includes(romaji)) continue
        map[kana] = romaji
      }
      return map
    })()

    /** Kana → romaji for prompts that only carry a kana reading (old decks). */
    function kanaToRomaji(kana) {
      let out = ''
      const chars = Array.from(String(kana))
      for (let index = 0; index < chars.length; index += 1) {
        const ch = chars[index]
        if (ch === 'っ') {
          const next = KANA_ROMAJI[chars[index + 1]] ?? ''
          if (next.startsWith('ch')) out += 't'
          else if (/^[bcdfghjklmnpqrstvwxyz]/.test(next)) out += next[0]
          else out += 'xtu'
          continue
        }
        if (ch === 'ー') {
          out += '-'
          continue
        }
        if (ch === '・' || ch === ' ') continue
        if (ch === 'ゃ' || ch === 'ゅ' || ch === 'ょ') {
          const prev = chars[index - 1]
          const combined = KANA_ROMAJI[`${prev}${ch}`]
          if (combined !== undefined) {
            const prevRomaji = KANA_ROMAJI[prev] ?? ''
            out = out.slice(0, out.length - prevRomaji.length) + combined
            continue
          }
        }
        out += KANA_ROMAJI[ch] ?? ch
      }
      return out
    }

    /**
     * Pull a reading out of a deck prompt: `（かめら / kamera）` first, then the
     * kana-only form `（じょうたつ）` used by older decks, with romaji generated.
     * Cards with neither return null and keep the plain flip.
     * @param {string} prompt
     */
    function extractReading(prompt) {
      const match = String(prompt).match(/（\s*([^）\/]+?)\s*\/\s*([^）]+?)\s*）/u)
      if (match !== null) {
        const kana = match[1].trim()
        const romaji = match[2].trim()
        if (/^[ぁ-んー\s]+$/.test(kana) && /^[a-zA-Z\s,'-]+$/.test(romaji)) return { kana, romaji }
      }
      const plain = String(prompt).match(/（\s*([^）\/]+?)\s*）/u)
      if (plain !== null) {
        const kana = plain[1].trim()
        if (/^[ぁ-んー]+$/.test(kana)) {
          const romaji = kanaToRomaji(kana)
          if (romaji !== '') return { kana, romaji }
        }
        // Romaji-only card, e.g. **いらっしゃる**（irassharu）.
        if (/^[a-zA-Z\s'-]+$/.test(kana)) {
          const generated = romajiToKana(kana)
          if (generated !== '') return { kana: generated, romaji: kana }
        }
      }
      // Kana-only word, e.g. **きらきら** or the kana deck's **あ**.
      const boldKana = String(prompt).match(/\*\*([ぁ-んー]+)\*\*/u)
      if (boldKana !== null) {
        const romaji = kanaToRomaji(boldKana[1])
        if (romaji !== '') return { kana: boldKana[1], romaji }
      }
      return null
    }

    /** One-line hint about the keystrokes people get wrong. */
    function keystrokeHint(kana, romaji) {
      if (kana.includes('ー')) return 'ー 可以打 - 或重复前面的元音'
      if (kana.includes('っ')) {
        const doubled = romaji.match(/([bcdfghjklmnpqrstvwxyz])\1/i)
        return doubled !== null ? `っ 打两个 ${doubled[1].toLowerCase()}` : 'っ 打两个相同的辅音'
      }
      return ''
    }

    /**
     * Typing verdict shared by the panel and the float: the deck's spelling
     * verbatim, or any equivalent spelling once both sides are kana.
     * @param {string} typed
     * @param {{kana: string, romaji: string}|null} reading
     */
    function acceptsTyping(typed, reading) {
      if (reading === null || typed.trim() === '') return false
      const text = String(typed).trim()
      // Typed with a Japanese IME: the answer is already kana.
      const directKana = /[ぁ-んー]/.test(text) && normalizeKana(text) === normalizeKana(reading.kana)
      const clean = (value) => String(value).toLowerCase().replace(/[\s'’,，-]/g, '')
      const sameSpelling = clean(text) === clean(reading.romaji)
      const sameKana = normalizeKana(romajiToKana(text)) === normalizeKana(reading.kana)
      return directKana || sameSpelling || sameKana
    }

    function PanelIcon(props) {
      const size = typeof props?.size === 'number' && props.size > 0 ? props.size : 18
      const active = props?.active === true
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': 'true', style: { display: 'block', opacity: active ? 1 : 0.86 } },
        h('rect', { x: 8.5, y: 2.5, width: 11, height: 15, rx: 2.4, fill: 'currentColor', opacity: 0.32, transform: 'rotate(8 14 10)' }),
        h('rect', { x: 4, y: 6, width: 12.5, height: 16, rx: 2.4, fill: 'currentColor' }),
      )
    }

    function Panel() {
      const [info, setInfo] = React.useState(null)
      const [error, setError] = React.useState('')
      const [deck, setDeck] = React.useState('')
      const [card, setCard] = React.useState(null)
      const [revealed, setRevealed] = React.useState(false)
      const [busy, setBusy] = React.useState(false)
      const [level, setLevel] = React.useState('beginner')
      const tone = useSharedValue(shared.tone)
      const overlayVisible = useSharedValue(shared.overlay)
      const lastCardId = React.useRef('')
      const lastFlip = React.useRef(0)
      const typing = useSharedValue(shared.typing)
      const [typed, setTyped] = React.useState('')
      const [verdict, setVerdict] = React.useState('')

      const chooseTone = React.useCallback((value) => {
        sharedSet(shared.tone, value)
        writeLocal(TONE_KEY, value)
      }, [])

      const chooseTyping = React.useCallback((value) => {
        sharedSet(shared.typing, value)
        writeLocal(TYPING_KEY, value ? '1' : '0')
        setTyped('')
        setVerdict('')
      }, [])

      const chooseOverlay = React.useCallback((value) => {
        sharedSet(shared.overlay, value)
        writeLocal(OVERLAY_KEY, value ? '1' : '0')
      }, [])

      const refresh = React.useCallback(async () => {
        try {
          const data = await api(API.state)
          setInfo(data)
          setError('')
          return data
        } catch (failure) {
          setError(String(failure?.message ?? failure))
          return null
        }
      }, [])

      useAutoRefresh(refresh)

      const draw = React.useCallback(async (deckId, levelId) => {
        setBusy(true)
        try {
          const data = await api(API.card, { deck: deckId, level: levelId, lastCardId: lastCardId.current })
          lastCardId.current = data.card.id
          setCard(data.card)
          setRevealed(false)
          setTyped('')
          setVerdict('')
          setError('')
        } catch (failure) {
          setError(String(failure?.message ?? failure))
        } finally {
          setBusy(false)
        }
      }, [])

      React.useEffect(() => {
        void (async () => {
          const data = await refresh()
          if (data === null || data.decks.length === 0) return
          const first = LEVELS.find(item => data.decks.some(deck => deck.level === item.id)) ?? LEVELS[0]
          setLevel(first.id)
          await draw('', first.id)
        })()
      }, [refresh, draw])

      const grade = React.useCallback(async (correct) => {
        if (card === null) return
        setBusy(true)
        try {
          const data = await api(API.grade, { cardId: card.id, correct })
          setInfo((previous) => (previous === null ? previous : { ...previous, today: data.today, streak: data.streak }))
          await draw(deck, level)
        } catch (failure) {
          setError(String(failure?.message ?? failure))
          setBusy(false)
        }
      }, [card, deck, level, draw])

      const pickDeck = React.useCallback((deckId) => {
        setDeck(deckId)
        setCard(null)
        void draw(deckId, level)
      }, [draw, level])

      const pickLevel = React.useCallback((levelId) => {
        setLevel(levelId)
        setDeck('')
        setCard(null)
        void draw('', levelId)
      }, [draw])

      const decks = info === null ? [] : info.decks
      const levelDecks = decks.filter(item => item.level === level)
      const levelCount = levelDecks.reduce((sum, item) => sum + item.count, 0)
      const goal = info === null ? 10 : info.goal
      const today = info === null ? 0 : info.today
      const streak = info === null ? 0 : info.streak
      const seenTotal = info === null ? 0 : info.seenTotal
      const totalCards = info === null ? 0 : info.totalCards
      const percent = goal > 0 ? Math.min(100, Math.round((today / goal) * 100)) : 0
      const reading = card === null ? null : extractReading(card.prompt)
      const keyHint = reading === null ? '' : keystrokeHint(reading.kana, reading.romaji)

      const checkTyped = () => {
        const ok = acceptsTyping(typed, reading)
        setVerdict(ok ? 'ok' : 'ng')
        if (ok) setRevealed(true)
      }

      /** Flip once per gesture; a fast double click should not flip back. */
      const toggleReveal = () => {
        const now = Date.now()
        if (now - lastFlip.current < 180) return
        lastFlip.current = now
        setRevealed(value => !value)
      }

      return h(
        'div',
        { className: 'jas-root', 'data-tone': tone },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        h(
          'div',
          { className: 'jas-table' },
          h(
            'div',
            { className: 'jas-head' },
            h('span', { className: 'jas-title' }, '日语学习'),
            h('span', { className: 'jas-sub' }, '本地课程包 · 不调用模型'),
            h(
              'div',
              { className: 'jas-pills' },
              h('span', { className: 'jas-pill is-good' }, '今日 ', h('strong', null, `${today}/${goal}`)),
              h('span', { className: 'jas-pill is-warn' }, '连续 ', h('strong', null, `${streak}`), ' 天'),
              h('span', { className: 'jas-pill' }, '已见 ', h('strong', null, `${seenTotal}/${totalCards}`)),
            ),
            h(
              'div',
              { className: 'jas-tone', role: 'group', 'aria-label': '背景配色' },
              TONES.map(item => h(
                'button',
                {
                  key: item.id,
                  className: 'jas-tone-btn',
                  'data-active': tone === item.id,
                  title: item.id === 'auto' ? '跟随 DSH 主题色' : item.id === 'light' ? '始终使用浅色' : '始终使用深色',
                  onClick: () => chooseTone(item.id),
                },
                item.label,
              )),
            ),
            h(
              'div',
              { className: 'jas-tone' },
              h(
                'button',
                {
                  className: 'jas-tone-btn',
                  'data-active': typing,
                  title: '看词打罗马音，练键盘输入',
                  onClick: () => chooseTyping(!typing),
                },
                '键盘练习',
              ),
            ),
            h(
              'div',
              { className: 'jas-tone' },
              h(
                'button',
                {
                  className: 'jas-tone-btn',
                  'data-active': overlayVisible,
                  title: '悬浮小窗：边练习边看会话',
                  onClick: () => chooseOverlay(!overlayVisible),
                },
                '小窗',
              ),
            ),
          ),
          decks.length === 0
            ? h('div', { className: 'jas-empty' }, '没有可用牌组。检查 coursesDir 是否指向课程包根目录（里面要有 ja/*.json）。')
            : h(
                React.Fragment,
                null,
                h(
                  'div',
                  { className: 'jas-levels' },
                  LEVELS.map(item => {
                    const count = decks.filter(deckItem => deckItem.level === item.id).reduce((sum, deckItem) => sum + deckItem.count, 0)
                    return h(
                      'button',
                      {
                        key: item.id,
                        className: 'jas-level',
                        'data-active': level === item.id,
                        disabled: count === 0,
                        onClick: () => pickLevel(item.id),
                      },
                      `${item.label} · ${count}`,
                    )
                  }),
                ),
                h(
                  'div',
                  { className: 'jas-tabs' },
                  h('button', { className: 'jas-tab', 'data-active': deck === '', onClick: () => pickDeck('') }, `本阶段全部 · ${levelCount}`),
                  levelDecks.map(item => h(
                    'button',
                    { key: item.id, className: 'jas-tab', 'data-active': deck === item.id, onClick: () => pickDeck(item.id) },
                    `${item.name} · ${item.count}`,
                  )),
                ),
              ),
          error !== '' ? h('div', { className: 'jas-err' }, error) : null,
          h(
            'div',
            { className: 'jas-stage' },
            card === null
              ? h(
                  'button',
                  { className: 'jas-pile', onClick: () => void draw(deck, level), disabled: busy || levelCount === 0 },
                  h('span', { className: 'jas-backcard' }),
                  h('span', { className: 'jas-backcard' }),
                  h('span', { className: 'jas-pile-label' }, busy ? '抽卡中…' : '点击抽一张'),
                )
              : h(
                  'div',
                  { className: 'jas-deal', key: card.id },
                  h(
                    'div',
                    { className: 'jas-cardwrap' },
                    h(
                      'div',
                      {
                        className: 'jas-card3d',
                        'data-flipped': revealed,
                        role: 'button',
                        tabIndex: 0,
                        onClick: toggleReveal,
                        onKeyDown: (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            toggleReveal()
                          }
                        },
                      },
                      h(
                        'div',
                        { className: 'jas-face jas-front' },
                        h(
                          'div',
                          { className: 'jas-face-head' },
                          h('div', { className: 'jas-ribbon' }, `${TYPE_LABELS[card.type] ?? card.type} · ${card.deck}`),
                          reading !== null ? speakerNode(reading.kana) : null,
                        ),
                        h('div', { className: 'jas-prompt' }, rich(card.prompt)),
                        card.hint !== '' ? h('div', { className: 'jas-hint' }, card.hint) : null,
                        typing && reading !== null && !revealed
                          ? h(
                              'div',
                              { className: 'jas-typebox', onClick: (event) => event.stopPropagation() },
                              h('div', { className: 'jas-typelabel' }, `键入「${reading.kana}」的罗马音`),
                              h('input', {
                                className: 'jas-input',
                                value: typed,
                                placeholder: '输入后按 Enter 检查',
                                onChange: (event) => {
                                  setTyped(event.target.value)
                                  setVerdict('')
                                },
                                onKeyDown: (event) => {
                                  if (event.key === 'Enter') {
                                    event.preventDefault()
                                    checkTyped()
                                  }
                                },
                              }),
                              h(
                                'div',
                                { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
                                h('button', { className: 'jas-btn', disabled: typed.trim() === '', onClick: checkTyped }, '检查'),
                                verdict === 'ng' ? h('span', { className: 'jas-typeerr' }, `不对，应为 ${reading.romaji}（${reading.kana}）`) : null,
                                verdict === 'ok' ? h('span', { className: 'jas-typeok' }, `✓ ${reading.romaji}`) : null,
                              ),
                            )
                          : null,
                        h('div', { className: 'jas-flipnote' }, typing && !revealed
                          ? (reading === null ? '这张卡没有读音，点击翻面' : '也可以点卡片直接翻面')
                          : '点击卡片翻面'),
                      ),
                      h(
                        'div',
                        { className: 'jas-face jas-back' },
                        h(
                          'div',
                          { className: 'jas-face-head' },
                          h('div', { className: 'jas-ribbon' }, '答案'),
                          reading !== null ? speakerNode(reading.kana) : null,
                        ),
                        h('div', { className: 'jas-answer' }, rich(card.answer)),
                        h('div', { className: 'jas-explain' }, rich(card.explanation)),
                        card.tags.length > 0
                          ? h('div', { className: 'jas-tags' }, card.tags.map(tag => h('span', { key: tag, className: 'jas-tag' }, tag)))
                          : null,
                        reading !== null
                          ? h(
                              'div',
                              { className: 'jas-keys' },
                              '键入：',
                              h('code', null, reading.romaji),
                              keyHint !== '' ? h('span', { className: 'jas-keyhint' }, `（${keyHint}）`) : null,
                            )
                          : null,
                        h('div', { className: 'jas-flipnote' }, '点击返回正面'),
                      ),
                    ),
                  ),
                ),
          ),
          h(
            'div',
            { className: 'jas-actions' },
            card === null
              ? h('button', { className: 'jas-btn', 'data-kind': 'primary', disabled: busy || levelCount === 0, onClick: () => void draw(deck, level) }, '抽一张')
              : h(
                  React.Fragment,
                  null,
                  revealed ? null : h('button', { className: 'jas-btn', 'data-kind': 'primary', disabled: busy, onClick: () => setRevealed(true) }, '显示答案'),
                  h('button', { className: 'jas-btn', 'data-kind': 'good', disabled: busy, onClick: () => void grade(true) }, '记住了'),
                  h('button', { className: 'jas-btn', 'data-kind': 'bad', disabled: busy, onClick: () => void grade(false) }, '没记住'),
                  h('button', { className: 'jas-btn', disabled: busy, onClick: () => void draw(deck, level) }, '换一张'),
                ),
          ),
          h(
            'div',
            { className: 'jas-meter-row' },
            h('span', { className: 'jas-meter-label' }, `今日 ${today}/${goal}`),
            h('div', { className: 'jas-meter' }, h('i', { style: { width: `${percent}%` } })),
            h('span', { className: 'jas-meter-label' }, `${percent}%`),
          ),
        ),
        h('div', { className: 'jas-foot' }, '进度写入 $DSH_HOME/ja-study.json；改牌组 JSON 立即生效，无需重载。'),
      )
    }

    /** First level that actually has decks, as a `level|` selector. */
    function defaultSelection(data) {
      for (const item of LEVELS) {
        if (data.decks.some((deck) => deck.level === item.id)) return `${item.id}|`
      }
      return ''
    }

    /** Compact floating panel: same host routes, its own draw state. */
    function FloatPanel() {
      const visible = useSharedValue(shared.overlay)
      const tone = useSharedValue(shared.tone)
      const [collapsed, setCollapsed] = React.useState(() => readLocal(FLOAT_COLLAPSED_KEY, '0') === '1')
      const [pos, setPos] = React.useState(() => {
        const saved = readLocal(FLOAT_POS_KEY, '')
        if (saved === '') return null
        try {
          const parsed = JSON.parse(saved)
          if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') return { x: parsed.x, y: parsed.y }
        } catch {
          /* ignore a mangled position */
        }
        return null
      })
      const [info, setInfo] = React.useState(null)
      const [selection, setSelection] = React.useState('')
      const [card, setCard] = React.useState(null)
      const [revealed, setRevealed] = React.useState(false)
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      const typing = useSharedValue(shared.typing)
      const [typed, setTyped] = React.useState('')
      const [verdict, setVerdict] = React.useState('')
      const lastCardId = React.useRef('')
      const lastFlip = React.useRef(0)
      const dragRef = React.useRef(null)
      const reading = card === null ? null : extractReading(card.prompt)
      const keyHint = reading === null ? '' : keystrokeHint(reading.kana, reading.romaji)

      const checkTyped = () => {
        const ok = acceptsTyping(typed, reading)
        setVerdict(ok ? 'ok' : 'ng')
        if (ok) setRevealed(true)
      }

      const toggleTyping = () => {
        sharedSet(shared.typing, !typing)
        writeLocal(TYPING_KEY, typing ? '0' : '1')
        setTyped('')
        setVerdict('')
      }

      React.useEffect(() => {
        if (pos !== null) writeLocal(FLOAT_POS_KEY, JSON.stringify(pos))
      }, [pos])

      const refresh = React.useCallback(async () => {
        try {
          const data = await api(API.state)
          setInfo(data)
          setError('')
          return data
        } catch (failure) {
          setError(String(failure?.message ?? failure))
          return null
        }
      }, [])

      useAutoRefresh(refresh)

      const draw = React.useCallback(async (selector) => {
        if (selector === '') return
        const [levelId, deckId] = selector.split('|')
        setBusy(true)
        try {
          const data = await api(API.card, { deck: deckId ?? '', level: levelId, lastCardId: lastCardId.current })
          lastCardId.current = data.card.id
          setCard(data.card)
          setRevealed(false)
          setTyped('')
          setVerdict('')
          setError('')
        } catch (failure) {
          setError(String(failure?.message ?? failure))
        } finally {
          setBusy(false)
        }
      }, [])

      React.useEffect(() => {
        if (!visible) return
        void (async () => {
          const data = await refresh()
          if (data === null) return
          setSelection((previous) => (previous !== '' ? previous : defaultSelection(data)))
        })()
      }, [visible, refresh])

      React.useEffect(() => {
        if (!visible || selection === '') return
        void draw(selection)
      }, [visible, selection, draw])

      const grade = React.useCallback(async (correct) => {
        if (card === null) return
        setBusy(true)
        try {
          const data = await api(API.grade, { cardId: card.id, correct })
          setInfo((previous) => (previous === null ? previous : { ...previous, today: data.today, streak: data.streak }))
          await draw(selection)
        } catch (failure) {
          setError(String(failure?.message ?? failure))
          setBusy(false)
        }
      }, [card, selection, draw])

      /** Flip once per gesture; a fast double click should not flip back. */
      const toggleReveal = () => {
        const now = Date.now()
        if (now - lastFlip.current < 180) return
        lastFlip.current = now
        setRevealed((value) => !value)
      }

      const startDrag = (event) => {
        // Controls inside the header (collapse, select) must keep their own
        // clicks: capturing the pointer here would swallow them.
        const target = event.target
        if (target !== null && typeof target.closest === 'function' && target.closest('button, select, input, textarea, a') !== null) return
        const node = event.currentTarget.closest('.jas-float')
        if (node === null) return
        const rect = node.getBoundingClientRect()
        dragRef.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top }
        setPos({ x: rect.left, y: rect.top })
        event.currentTarget.setPointerCapture?.(event.pointerId)
      }
      const moveDrag = (event) => {
        if (dragRef.current === null) return
        setPos({ x: Math.max(8, event.clientX - dragRef.current.dx), y: Math.max(8, event.clientY - dragRef.current.dy) })
      }
      const endDrag = () => {
        dragRef.current = null
      }

      /** Collapsed capsule: drag to move, a click without movement expands. */
      const capsuleDragRef = React.useRef(null)
      const startCapsuleDrag = (event) => {
        const node = event.currentTarget.closest('.jas-float')
        if (node === null) return
        const rect = node.getBoundingClientRect()
        capsuleDragRef.current = {
          dx: event.clientX - rect.left,
          dy: event.clientY - rect.top,
          originX: event.clientX,
          originY: event.clientY,
          moved: false,
        }
        event.currentTarget.setPointerCapture?.(event.pointerId)
      }
      const moveCapsuleDrag = (event) => {
        const drag = capsuleDragRef.current
        if (drag === null) return
        if (!drag.moved && Math.abs(event.clientX - drag.originX) + Math.abs(event.clientY - drag.originY) < 4) return
        drag.moved = true
        setPos({ x: Math.max(8, event.clientX - drag.dx), y: Math.max(8, event.clientY - drag.dy) })
      }
      const endCapsuleDrag = () => {
        const drag = capsuleDragRef.current
        capsuleDragRef.current = null
        if (drag !== null && !drag.moved) {
          setCollapsed(false)
          writeLocal(FLOAT_COLLAPSED_KEY, '0')
          void refresh()
        }
      }

      if (!visible) return null

      const today = info === null ? 0 : info.today
      const goal = info === null ? 10 : info.goal
      const style = pos === null ? undefined : { left: `${pos.x}px`, top: `${pos.y}px`, right: 'auto', bottom: 'auto' }
      const options = []
      if (info !== null) {
        for (const item of LEVELS) {
          const list = info.decks.filter((deckItem) => deckItem.level === item.id)
          if (list.length === 0) continue
          const total = list.reduce((sum, deckItem) => sum + deckItem.count, 0)
          options.push(h('option', { key: `${item.id}|`, value: `${item.id}|` }, `${item.label} · 本阶段全部 · ${total}`))
          for (const deckItem of list) {
            options.push(h('option', { key: `${item.id}|${deckItem.id}`, value: `${item.id}|${deckItem.id}` }, `${item.label} · ${deckItem.name} · ${deckItem.count}`))
          }
        }
      }

      if (collapsed) {
        return h(
          'div',
          {
            className: 'jas-root jas-float is-collapsed',
            'data-tone': tone,
            style,
            role: 'button',
            tabIndex: 0,
            title: '拖动可移动，点击展开',
            onPointerDown: startCapsuleDrag,
            onPointerMove: moveCapsuleDrag,
            onPointerUp: endCapsuleDrag,
            onPointerCancel: endCapsuleDrag,
            onKeyDown: (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                setCollapsed(false)
                writeLocal(FLOAT_COLLAPSED_KEY, '0')
                void refresh()
              }
            },
          },
          h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
          h('div', { className: 'jas-float-head' }, h('span', { className: 'jas-float-title' }, `日语 ${today}/${goal}`)),
        )
      }

      return h(
        'div',
        { className: 'jas-root jas-float', 'data-tone': tone, style },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        h(
          'div',
          { className: 'jas-float-head', onPointerDown: startDrag, onPointerMove: moveDrag, onPointerUp: endDrag, onPointerCancel: endDrag },
          h('span', { className: 'jas-float-title' }, '日语练习'),
          h('span', { className: 'jas-pill is-good' }, `${today}/${goal}`),
          h(
            'div',
            { className: 'jas-float-tools' },
            h(
              'button',
              {
                className: 'jas-float-min',
                'data-active': typing,
                'aria-label': '键盘练习',
                title: typing ? '关闭键盘练习' : '键盘练习：看词打罗马音',
                onPointerDown: (event) => event.stopPropagation(),
                onClick: toggleTyping,
              },
              '键',
            ),
            h(
              'button',
              {
                className: 'jas-float-min',
                'aria-label': '收起小窗',
                title: '收起为胶囊',
                onPointerDown: (event) => event.stopPropagation(),
                onClick: () => {
                  setCollapsed(true)
                  writeLocal(FLOAT_COLLAPSED_KEY, '1')
                },
              },
              '—',
            ),
          ),
        ),
        h(
          'select',
          { className: 'jas-select', value: selection, onChange: (event) => setSelection(event.target.value) },
          options,
        ),
        error !== '' ? h('div', { className: 'jas-err' }, error) : null,
        h(
          'div',
          { className: 'jas-stage' },
          card === null
            ? h('div', { className: 'jas-empty' }, busy ? '抽卡中…' : '选一个牌组开始')
            : h(
                'div',
                { className: 'jas-deal', key: card.id },
                h(
                  'div',
                  { className: 'jas-cardwrap' },
                  h(
                    'div',
                    {
                      className: 'jas-card3d',
                      'data-flipped': revealed,
                      role: 'button',
                      tabIndex: 0,
                      onClick: toggleReveal,
                      onKeyDown: (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          toggleReveal()
                        }
                      },
                    },
                    h(
                      'div',
                      { className: 'jas-face jas-front' },
                      h(
                        'div',
                        { className: 'jas-face-head' },
                        h('div', { className: 'jas-ribbon' }, `${TYPE_LABELS[card.type] ?? card.type} · ${card.deck}`),
                        reading !== null ? speakerNode(reading.kana) : null,
                      ),
                      h('div', { className: 'jas-prompt' }, rich(card.prompt)),
                      card.hint !== '' ? h('div', { className: 'jas-hint' }, card.hint) : null,
                      typing && reading !== null && !revealed
                        ? h(
                            'div',
                            { className: 'jas-typebox', onClick: (event) => event.stopPropagation() },
                            h('input', {
                              className: 'jas-input',
                              value: typed,
                              placeholder: `键入 ${reading.kana} 的罗马音`,
                              onChange: (event) => {
                                setTyped(event.target.value)
                                setVerdict('')
                              },
                              onKeyDown: (event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault()
                                  checkTyped()
                                }
                              },
                            }),
                            h(
                              'div',
                              { style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' } },
                              h('button', { className: 'jas-btn', disabled: typed.trim() === '', onClick: checkTyped }, '检查'),
                              verdict === 'ng' ? h('span', { className: 'jas-typeerr' }, `应为 ${reading.romaji}（${reading.kana}）`) : null,
                              verdict === 'ok' ? h('span', { className: 'jas-typeok' }, `✓ ${reading.romaji}`) : null,
                            ),
                          )
                        : null,
                      h('div', { className: 'jas-flipnote' }, typing && !revealed
                        ? (reading === null ? '这张卡没有读音，点击翻面' : '也可以点卡片翻面')
                        : '点击翻面'),
                    ),
                    h(
                      'div',
                      { className: 'jas-face jas-back' },
                      h(
                        'div',
                        { className: 'jas-face-head' },
                        h('div', { className: 'jas-ribbon' }, '答案'),
                        reading !== null ? speakerNode(reading.kana) : null,
                      ),
                      h('div', { className: 'jas-answer' }, rich(card.answer)),
                      h('div', { className: 'jas-explain' }, rich(card.explanation)),
                      reading !== null
                        ? h(
                            'div',
                            { className: 'jas-keys' },
                            '键入：',
                            h('code', null, reading.romaji),
                            keyHint !== '' ? h('span', { className: 'jas-keyhint' }, `（${keyHint}）`) : null,
                          )
                        : null,
                      h('div', { className: 'jas-flipnote' }, '点击返回'),
                    ),
                  ),
                ),
              ),
        ),
        h(
          'div',
          { className: 'jas-actions' },
          card === null
            ? h('button', { className: 'jas-btn', 'data-kind': 'primary', disabled: busy, onClick: () => void draw(selection) }, '抽一张')
            : h(
                React.Fragment,
                null,
                revealed ? null : h('button', { className: 'jas-btn', 'data-kind': 'primary', disabled: busy, onClick: () => setRevealed(true) }, '显示答案'),
                h('button', { className: 'jas-btn', 'data-kind': 'good', disabled: busy, onClick: () => void grade(true) }, '记住了'),
                h('button', { className: 'jas-btn', 'data-kind': 'bad', disabled: busy, onClick: () => void grade(false) }, '没记住'),
                h('button', { className: 'jas-btn', disabled: busy, onClick: () => void draw(selection) }, '换一张'),
              ),
        ),
      )
    }

    /**
     * Speak a kana reading: the system Japanese voice when the browser has
     * one, otherwise a network TTS audio fallback (Electron often ships
     * speechSynthesis without voices).
     * @param {string} text
     */
    let speechPrimed = false
    function speakJapanese(text) {
      if (typeof text !== 'string' || text.trim() === '') return
      const spoken = text.trim()
      const synth = window.speechSynthesis
      if (synth !== undefined && synth !== null) {
        if (!speechPrimed) {
          synth.getVoices()
          speechPrimed = true
        }
        const japanese = synth.getVoices().find(voice => /^ja/i.test(voice.lang ?? ''))
        if (japanese !== undefined) {
          synth.cancel()
          const utterance = new window.SpeechSynthesisUtterance(spoken)
          utterance.voice = japanese
          utterance.lang = japanese.lang
          utterance.rate = 0.9
          synth.speak(utterance)
          return
        }
      }
      try {
        const audio = new window.Audio(`https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=ja&q=${encodeURIComponent(spoken)}`)
        void audio.play()
      } catch {
        /* no audio path available on this machine */
      }
    }

    /** A speaker button that never flips the card or steals the typing input. */
    function speakerNode(text) {
      return h(
        'button',
        {
          className: 'jas-speak',
          type: 'button',
          title: '朗读（系统日语语音，没有则用在线发音）',
          'aria-label': '朗读',
          onPointerDown: (event) => event.stopPropagation(),
          onClick: (event) => {
            event.stopPropagation()
            speakJapanese(text)
          },
        },
        '🔊',
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'ja-study',
          order: 20,
          label: () => '日语学习',
        }, PanelIcon))

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: 'ja-study',
        }, Panel))

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'ja-study-float',
          order: 1003,
        }, FloatPanel))
      },
    }
  },
})
