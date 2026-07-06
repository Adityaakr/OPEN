# Brand: bte

_Status: active_ (source: phase-5 design spec in the original build prompt)

## Voice

Sentence case everywhere, including headings. Short, declarative, technical,
no hype, no emoji in UI, **no em-dashes anywhere in UI copy** (use periods or
commas). Headline: "seal now. reveal on cue." Trust banner is permanent:
"v0. dealer-trusted setup. testnet toy."

## Color

| token | value | use |
|---|---|---|
| background | `#ffffff` | page, always white |
| text | `#111827` | body |
| muted | `#6b7280` | captions, secondary |
| border | `#e5e7eb` | hairlines, cards |
| accent | `#2563eb` | THE single accent: links, focus rings, frozen state, primary buttons |
| green | `#16a34a` | revealed / success only |
| red | `#dc2626` | stalled / rejected / corrupt only |

No gradients, no shadows heavier than `0 1px 2px rgb(0 0 0 / 0.05)`, no dark
mode (white is part of the identity).

## Typography

- UI: Satoshi via Fontshare (400/500/700), system-ui fallback.
- Hashes, ids, numbers: `ui-monospace` stack; `tabular-nums` globally.
- Generous whitespace over boxes; hairline borders over fills.

## Motion

Purposeful only: state transitions (reveal flip, share arrival) and micro
feedback. Durations 100-300 ms, ease-out on enter, ease-in on exit, all
gated behind `prefers-reduced-motion: no-preference`.
