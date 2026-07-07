# Brand: OPEN

_Status: active_ (renamed from bte 2026-07-07; design spec from the original build prompt)

## Naming

- Product name: **OPEN**, the open programmable encryption network.
- The explorer is **Open Explorer**.
- Identity line: "the guaranteed reveal network"
- Headline: "your users commit. the network reveals."
- Supporting line: "commit-reveal without the second transaction."
- Speed line: "add fair reveals to your dapp in minutes."
- Description: "add fair reveals to your dapp in minutes. seal data to the OPEN
  committee; when the cue fires, the whole batch opens at once, guaranteed.
  nothing readable early, not even by operators. every share verified in
  public, every reveal on the record."
- Internal names stay: bte-* crates, bte-sdk on npm, /v0 API, wire magic BTE0.
  OPEN is the product; bte is the plumbing.

## Voice

Sentence case everywhere, including headings. Short, declarative, technical,
no hype, no emoji in UI, **no em-dashes anywhere in UI copy** (use periods or
commas). No trust banner in the UI (removed 2026-07-07); the v0 trust caveat
lives in the README and docs instead.

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

No gradients, no dark mode (white is part of the identity). Shadows are
layered and quiet: cards `0 1px 2px 4% + 0 1px 3px 3%`, raised surfaces
(playground, seal card) up to `0 4px 12px 5%`, primary buttons may carry a
small accent-tinted shadow. Never heavier.

Chrome (2026-07-07 refresh): sticky blurred header with the lock mark +
"Open Explorer" + right-aligned nav; quiet footer with the product line.
Micro-labels (table headers, stat labels, kickers) are 11-12px uppercase
with 0.05em tracking; everything else stays sentence case. Display type
(hero, countdowns) is 46-56px with -0.03em tracking. Focus rings are a
3px 14% accent ring. Data tables sit in bordered 12px-radius wraps with
washed headers.

## Typography

- UI: Satoshi via Fontshare (400/500/700), system-ui fallback.
- Hashes, ids, numbers: `ui-monospace` stack; `tabular-nums` globally.
- Generous whitespace over boxes; hairline borders over fills.

## Motion

Purposeful only: state transitions (reveal flip, share arrival) and micro
feedback. Durations 100-300 ms, ease-out on enter, ease-in on exit, all
gated behind `prefers-reduced-motion: no-preference`.
