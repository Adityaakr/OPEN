# bte — project model
<!-- updated 2026-07-12 (timing trust hole; Railway volume fix; landing prompt handoff) -->
<!-- updated 2026-07-09 by prism-understand (OG/social-card feasibility for shared links) -->
<!-- updated 2026-07-07 by prism-understand (share-link recipient flow + engagement audit) -->

## What this is
Reveal-later encryption network ("seal now. reveal on cue.") on commonware's
batched threshold encryption. Built end to end 2026-07-06/07, phases 0-8 all
green. Contract: `spec/index.md`. Status + gates: `PROGRESS.md`, `REPORT.md`.

## Architecture (verified)
- `crates/bte-crypto` is the ONLY crate touching group elements; it wraps
  simple-bte pinned at git rev `147a0878` (Cargo.toml workspace dep). Payload
  path is the FO module (`fo.rs`), NOT the Schnorr/G_T path — see
  spec/API-MAP.md for the exact function map.
- Coordinator: axum /v0 + rusqlite (single Mutex<Connection>), engine tick
  500ms (`engine.rs:tick`), cross-terms cached in memory, recomputed after
  restart (`finalize_batch`).
- Nodes: outbound-only pollers, argon2id+ChaCha20 keystores
  (`bte-node/src/keystore.rs`).
- SDK: wasm inlined as base64 (`packages/sdk/scripts/build.mjs`), two wasm
  chunks (seal / verify). Anchor helpers are dependency-free (precomputed
  selectors, raw eth_call).

## Invariants (do not break)
- Positions: real cts sort by ct_hash, dummies fill the tail — a pure
  function of the real ct set (invariant 6 test).
- Wire types all start `BTE0` + type byte; golden files in
  `crates/bte-crypto/tests/golden/` (regenerate only with BTE_BLESS=1 and a
  version bump).
- KEM header and shares are exactly 48 bytes (tested).
- `/v0/reveals/:id` must 404 before reveal (invariant 4 test greps the db
  for plaintext bytes).
- Rejected shares are stored flagged and NEVER count toward t.

## Gotchas (hard-won)
- ark-std 0.6 re-exports rand 0.8; simple-bte also deps rand 0.9 (unused by
  its lib API). Use `bte_crypto::rand` / `bte_crypto::os_rng()` downstream —
  never a direct rand dep (version split bites).
- wasm builds need `.cargo/config.toml` cfg `getrandom_backend="wasm_js"`
  (getrandom 0.3 via rand 0.9) AND getrandom 0.2 "js" feature.
- Docker runtime user needs /data + /ceremony chown'd in the image (named
  volumes inherit image ownership).
- pnpm 11 blocks build scripts; `allowBuilds: esbuild: true` in
  pnpm-workspace.yaml.
- Shell cwd persists between Bash calls in this harness; watch relative paths.
- Piping `just …` through `tail` masks exit codes — verify demo results via
  API state, not pipe tails.

## Docs
- Standalone protocol article: docs/protocol.html (self-contained HTML, brand
  tokens inline, SVG architecture diagram). Same content spine as #/protocol;
  update BOTH when the protocol or SDK surface changes.
- Code-side deep-dive: docs/how-peal-is-built.html (self-contained HTML, Inter +
  JetBrains Mono, brand tokens inline, hand-authored SVG architecture diagram).
  Teaches the whole build crate-by-crate: bte-crypto (7-fn lifecycle), engine
  state machine, node/keystore, wasm bridge, SDK, merkle+anchor, trust trade-offs.
  Grounded 2026-07-08 in lib.rs/engine.rs/api.rs/merkle.rs/node/cli/wasm/sdk.
  Keep in sync when the crate surface or trust model changes.
- In-app protocol reference at #/protocol (packages/explorer/src/pages/protocol.ts,
  nav in index.html): overview, use cases, lifecycle, cryptography (wire, FO,
  punctured setup, pipelined recovery, merkle commitment), private seals,
  architecture, production posture, integration (incl. tags), trust model.
  Grounded in spec/index.md + engine.rs/merkle.rs; keep in sync when the
  protocol or SDK surface changes. Styles live under .protocol-* in style.css.
  Restyled 2026-07-08 to match the philosophy design system: Josefin Sans
  400/500 headings, DM Sans body, hairline section separators, scroll-reveal
  motion on header + all sections via the shared src/reveal.ts helper
  (mountScrollReveal; .scroll-reveal/.is-visible classes in style.css).
- Landing page at #/ (packages/explorer/src/pages/landing.ts): light centered
  hero (Josefin/DM Sans, soft sky gradient), "Seal now. / Reveal on cue."
  headline, a seal-prompt pill that hands off to #/app, dark/light pill CTAs,
  and the real app screenshot (public/app-preview.png, regenerate by
  screenshotting peal.network/#/app at 2000px) in a CSS browser frame rising
  from the fold. Staggered blur-fade entrance. The EXPLORER moved to #/app
  (main.ts routes; unknown hashes still fall through to the explorer).
  body.landing-page hides the standard site header and unclamps main.
  History: v1 Spline 3D hero, v2 HLS video hero (both replaced 2026-07-08).
- Philosophy manifesto at #/philosophy (packages/explorer/src/pages/philosophy.ts,
  route in main.ts, sole visible header nav link — network/protocol/code links
  are hidden in index.html, 2026-07-08 user request). Copy is user-authored
  verbatim (epigraph + 6 tenets + "what this unlocks" + "seal now. reveal on
  cue." sign-off). Redesigned 2026-07-08 per user: sentence-case grammar
  (capitals restored), Josefin Sans 300-500 headings ("not too bold"), DM Sans
  body (both via Google Fonts in index.html), centered header, 64px numeral
  gutter, hairline tenet separators, scroll-reveal motion (blur 14px + rise +
  fade, 700ms ease-out; above-fold blocks stagger in on load 110ms apart,
  below-fold via IntersectionObserver; reduced-motion shows all instantly).
  Styles under .philosophy-* in style.css. NOTE: this page intentionally
  deviates from brand.md typography (Satoshi/Inter) at user request.

## Decision log
- 2026-07-07: product renamed OPEN then Peal (peal.network) same day;
  explorer is "Peal Explorer", identity "the guaranteed reveal network",
  headline "commit-reveal without the second transaction.", speed line "add
  fair reveals to your dapp in minutes." Display strings only (brand.md
  Naming section); bte-* crates, bte-sdk, /v0 API, BTE0 wire magic unchanged.
- 2026-07-07: private seals: AES-128-GCM layer over capsule payloads, key in
  the share-link fragment only (packages/explorer/src/privacy.ts, BTEP1 wire
  prefix). Default ON for time capsules; bids/votes stay public by design.
- 2026-07-07: FO transform as DEM + CCA (spec allowed it; DEVIATIONS #1/#2).
- 2026-07-07: per-slot validity via bandwidth-optimized hints `[k_i]_1==ct0`
  (public API only) so mauled cts never poison a batch.
- 2026-07-07: revealRoot tx sent by key-holder script, coordinator stays
  chain-free (DEVIATIONS #6).
- 2026-07-07: explorer needed hand-rolled CORS in api.rs (no new deps).

## Frontend (playground, 2026-07-07)
- Explorer is a playground: seal in-browser via bte-sdk wasm (packages/explorer/src/playground.ts),
  live share dots from `verified_shares` per batch (api.rs get_condition), reveal flip.
- brand.md at repo root is the design source of truth (white, Satoshi, #2563eb, sentence case, no em-dashes).
- SDK gotcha FIXED: `fetch` must be bound to globalThis (bare reference = Illegal invocation in browsers).
- Dockerfile.web builds the pnpm workspace in 3 stages (wasm-pack -> pnpm -> caddy); .dockerignore added.
- Browser e2e pattern: playwright script in scratchpad drives seal->reveal with screenshots; port 8080
  may be held by the user's other projects (cusp-fi vite) — use a compose port override (18080) for tests.

## Condition tags + round segregation (2026-07-07)
- conditions carry an optional `tag` TEXT column (db.rs schema + ALTER
  migration in db.rs open()); create_condition validates <=32 chars of
  [a-z0-9:_-] (api.rs); returned by list/get. SDK condition() takes tag.
- Playground tags: `round:bid`, `round:vote` (shared, joinable), `capsule`
  (never joined). findOpenRound(tag) matches tag exactly — untagged/legacy
  conditions are never joined (playground.ts). Round length: first sealer's
  #pg-round-secs select (30s..1h) sets it; joiners inherit.
- INVARIANT: never join a condition whose tag you did not create for that
  purpose — joining someone's capsule strands the entry until the capsule
  fires (the original bug).

## Dummy padding (mapped 2026-07-07)
- WHY: B=64 is baked into the ceremony CRS (punctured powers-of-tau, FFT domain,
  spec/index.md:32,39-42); every batch MUST be exactly B slots, so the
  coordinator pads with self-sealed dummies at freeze (engine.rs:135-143).
- Each dummy is a REAL FO ciphertext sealing "BTE_DUMMY_V0:" + 16 random bytes
  (bte-crypto/src/lib.rs:449-455); unique ct_hash per batch; committed in the
  merkle root with all slots (engine.rs:407-430); operators do real work on them.
- Reveal API exposes per slot ONLY: position, ct_hash, is_dummy, valid,
  payload_b64 (engine.rs:19-25, api.ts:50-56). Dummy rows are visually
  identical except position/hash — the expandable 63-row table in
  condition.ts boardTable duplicates what the slot grid already shows.
- Classification logic (corrupt/dummy/private/real) is duplicated between
  slotGrid (condition.ts:211-219) and slotRow (condition.ts:234-245).

## Share-link recipient flow (mapped 2026-07-07)
- Link format: `${origin}${pathname}#/s/<conditionId>/<ctHash>` (packages/explorer/src/playground.ts:70);
  router regex requires exact 64-hex ctHash (packages/explorer/src/main.ts:16).
- Recipient page packages/explorer/src/pages/seal-view.ts: 2s status poll + 1s countdown tick
  (seal-view.ts:99-100); reveal detected purely by `status === 'revealed'` (seal-view.ts:69), then
  getReveal + slot match by ct_hash (seal-view.ts:75).
- Deployment: hash routes never reach the server; Caddy is static try_files fallback
  (docker/Caddyfile:11-15) so per-link OG previews are impossible without a server route.
- Coordinator: CORS `*` (api.rs:70), rate limit 50 rps / 400 burst per IP (state.rs:16) — polling
  is a non-issue. NO push machinery anywhere (no WS/SSE/webhook/email); only pull. The one hook
  point for future push is the reveal write in engine.rs finalize_ready.
- Engagement primitives ABSENT (all confirmed by grep): document.title never updated, no
  favicon/OG/manifest in index.html, no service worker/Notification API, no localStorage
  (no "my seals" persistence), no visibilitychange handling (background tabs throttle the
  2s poll to ~1/min, so "opens by itself" is unreliable when hidden), no sender name/label
  (conditions table has no creator/memo column, db.rs:16-25; kicker hardcoded seal-view.ts:13).

## Social / OG link cards — feasibility (mapped 2026-07-09)
- ASK: show a LIVE ticking reveal timer inside an X/Twitter link preview when a Peal link is pasted.
- EXTERNAL VERDICT: impossible on X. In-timeline cards are a static image (twitter:image/og:image,
  JPG/PNG/WebP; GIF flattened to first frame; NO JS/video/animation; Twitterbot doesn't run JS).
  Best achievable = a dynamic PNG "reveals in Xh Ym" SNAPSHOT frozen at scrape time; X caches it
  ~7 days and doesn't re-scrape on a schedule, so it can go stale (show a card that reads sanely
  after the reveal too). Live in-feed refresh is a Farcaster Frame capability, not X.
- CURRENT STATE: pure Vite SPA, no SSR/edge. Single static index.html for all routes
  (docker/Caddyfile try_files → /index.html). Meta tags are global + static in
  packages/explorer/index.html:6-13 — has og:title/description + `twitter:card=summary` (not
  large_image) and NO og:image/twitter:image at all. No OG-image/screenshot/satori/resvg code
  anywhere (grep-confirmed). Coordinator serves JSON only under /v0.
- STRUCTURAL BLOCKER (the real one): all shareable ids live in the URL FRAGMENT (after `#`),
  which scrapers never receive. Router is hash-based (main.ts:13-38). Share link builder
  `sealLink()` playground.ts:92-95 → `…#/s/<conditionId>/<ctHash>/<shareKey>`. So an edge/scraper
  literally can't tell which seal a link points to.
- PRIVACY CONSTRAINT: the trailing `<shareKey>` fragment segment is the AES-128-GCM decryption key
  (privacy.ts:26-38, "travels ONLY in the hash fragment, never sent to any server"). Moving seal
  identifiers to a server-visible path to enable OG would LEAK the key. Per-SEAL private-capsule OG
  is therefore off the table by design.
- WHAT IS ACHIEVABLE: a per-CONDITION snapshot card. The condition id is PUBLIC (shown on home list,
  GET /v0/conditions/:id) and the countdown source `fires_at` (unix secs) is available server-side
  (db.rs:20, returned api.rs:265; NULL for at_block conditions — no absolute time). REQUIRES:
  (1) a server-visible id — new path/query like `/c/<id>` or `?c=<id>` (not just `#/condition/<id>`);
  (2) an edge/serverless renderer (none today) that reads fires_at and renders a PNG; (3) per-request
  <head> meta injection for that route. This is net-new infra, not a tweak.
- No "share to X"/intent UI exists today; only a "copy share link" button (playground.ts:653,788).

## Decision log
- 2026-07-08 (prism-plan): next-phase direction = "earn the network thesis on ONE
  painkiller." Refuted BOTH extremes: (a) traction-first on agent track records while
  deferring DKG (3/3 adversarial skeptics refuted: trusted dealer is an INTEGRITY break
  for a trust product, not a low-harm caveat; near-term demand is a mirage; the deferral
  gate is circular), and (b) solo multi-month DKG with no user (round-1 lenses). Plan =
  3 parallel tracks: (1) remove single-dealer trust hole de-risked (investigate multi-party
  SETUP CEREMONY as lighter alt to full DKG; get grant / commonware co-dev / open-source
  help), (2) validate ONE painkiller = sealed-bid/dark-block sealed order flow sold as a
  dedicated committee, with an 8-week demand kill-criterion (NOT agent records = vitamin),
  (3) cheap finishers: Sepolia run, npm publish, Railway cleanup. Token ($PEAL/$sPEAL) LAST;
  $sPEAL = highest reg risk. Full doc: docs/plans/001-peal-next-plan.md.
- Chain (grounded 2026-07-08): EIP-2537 BLS12-381 precompile is LIVE on ETH mainnet
  (Pectra) so Stage-2 on-chain verify is buildable on ETH today; Solana BLS12-381 =
  SIMD-0388, pending devnet (Agave v4.0.0-beta) + mainnet, so Solana anchor tier works now
  but on-chain verify is not yet available to programs.

## INVARIANT (2026-07-08)
- Peal's whole value is trust-minimization, so the SINGLE-TRUSTED-DEALER ceremony
  (bte-cli samples tau in one process, lib.rs:192-233) negates the value prop for EVERY
  serious use, including "low-value" reputational ones. Do not market "reveal-later
  encryption / tau is gone" or onboard any real-value or trust-selling product until the
  single-dealer hole is removed (setup ceremony or DKG). It is a launch-blocker, not a
  caveat.

## INVARIANT (2026-07-12): the deadline is NOT enforced, it is asserted
- SECOND trust hole, distinct from the single-dealer one above and NOT documented in
  spec/index.md (which only names the dealer at line 15) or #/protocol (which says "the
  cue fires: wall clock or block height" without saying WHOSE clock).
- at_time: the ONLY thing gating a reveal is `fires_at <= unix_now()` in the coordinator's
  own process (engine.rs:29-39, db.rs:85 SystemTime::now). Nothing else checks it.
- OPERATORS NEVER CHECK A CLOCK. bte-node polls /v0/work, decodes the 48-byte headers it is
  handed, calls partial(), posts the share (node/src/main.rs:150-193). It never reads
  fires_at, never fetches the condition, never looks at a clock or chain. It signs whatever
  it is given. /v0/work does not even filter on status='frozen' — only "a batch row exists
  and is not finalized" (api.rs:377-379).
- CONSEQUENCE: t-of-n buys NOTHING on timing. It only stops the coordinator decrypting with
  ZERO cooperation, and cooperation is free — a compromised/buggy coordinator inserts a batch
  row and t honest nodes cheerfully reveal a capsule whose deadline is a week out.
- at_block is WEAKER, not stronger: one unauthenticated `eth_blockNumber` POST (engine.rs:97-113)
  read by the coordinator alone. Takes the LATEST head at face value (no finalized tag, no
  confirmations, no block hash, no reorg handling, no second source). freeze is irreversible,
  so a reorg or a lying RPC = permanent early reveal. It ADDS a trusted party (the RPC) without
  removing the coordinator. NOT running a node — just reqwest posting one JSON-RPC method.
  No RPC configured for a chain id => condition stays pending FOREVER, silently (engine.rs:75-77).
- Honest guarantee ladder today: (1) no reveal without t shares — CRYPTO. (2) operators only
  share after the deadline — NOTHING. (3) revealed payloads match what was committed — merkle
  root, if anchored. (4) ciphertext existed before block N — chain, if commit() was called.
- TO CLOSE IT (both halves required, either alone is useless): (a) node evaluates the condition
  itself before partial()ing — /v0/work returns kind/fires_at/height and the node refuses until
  ITS OWN clock/RPC agrees; AND (b) the condition record must be immutable + identical for every
  operator, else a malicious coordinator just tells each node a different fires_at — so sign the
  condition at creation under a key nodes pin, or publish conditionId=>fires_at on-chain.
  THE DEADLINE IS THE ONE PROTOCOL INPUT THAT LIVES ONLY IN THE COORDINATOR'S SQLITE FILE.

## Railway persistence — SOLVED 2026-07-12 (do not regress)
- ROOT CAUSE of "every deploy wipes all conditions": /bte-state was a bare `mkdir` in the image
  (Dockerfile.railway:60) with NO volume. Railway gives each deploy a fresh container fs, so
  /bte-state came back empty every time. That empties bte.db (start-railway.sh:10) AND deletes
  ceremony/params.bin, which trips the `if [ ! -f ... ]` guard (start-railway.sh:27) and RE-RUNS
  THE TRUSTED-DEALER CEREMONY => brand-new committee id. Old conditions weren't just hidden, they
  became permanently unrevealable (their committee's operator keys no longer exist anywhere).
- FIX (applied): Railway volume mounted at `/bte-state` on the bte-explorer service. Volumes are
  DASHBOARD-ONLY (not expressible in railway.json) and are created from the PROJECT CANVAS
  (Cmd+K / right-click canvas), NOT the service Settings tab — Settings search for "volume"
  finds nothing, which is what made this hard to find.
- The mount path MUST equal STATE_DIR in docker/start-railway.sh:7 (`${BTE_STATE_DIR:-/bte-state}`).
  Change one without the other and the ceremony re-runs and orphans every seal.
- VERIFIED 2026-07-12: committee 2d7ce50d097b08665ceab77f735967bc45e0a1179803d76fec50f445b8738f9b
  (created_at 1783801633) survived a redeploy unchanged => ceremony skipped => volume holding.
  THE PERSISTENCE TEST IS: `curl -sS https://peal.adibuilds.in/v0/committees` before and after a
  deploy. Same id = good. New id = state was wiped. A fresh committee id is ALSO what a broken
  volume looks like, so one deploy alone proves nothing — you need the id to survive a SECOND one.
- Attaching the volume cost a one-time reset: committee c36dec96 + 21 conditions were lost. This
  was unavoidable (the volume starts empty, so the ceremony ran once more into it).
- WHAT WOULD STILL WIPE IT: deleting/detaching the volume; changing the mount path; deleting and
  recreating the service; setting BTE_STATE_DIR to anything but /bte-state.
- NOW-PERMANENT RISKS (previously masked by the constant wipes): the 5 operator keystores now sit
  on that volume encrypted with the DEFAULT passphrase `railway-devnet-v0` (start-railway.sh:9,
  BTE_KEYSTORE_PASS unset on the service) which is hardcoded in a public repo; and there is NO
  BACKUP — one SQLite file on one volume, lose it and every seal is unrevealable forever.
- docs/deploy-railway.md IS STALE: it describes a 7-service topology (1 coordinator + 5 nodes +
  1 web, private networking) and claims root railway.json targets Dockerfile.web. The LIVE shape
  is the all-in-one Dockerfile.railway (coordinator + in-container ceremony + 5 nodes + Caddy in
  ONE container, start-railway.sh). The doc never mentions the volume at all — the exact gap that
  cost the 21 conditions. bte-sdk / bte-examples / bte-demo-* are a library and scripts, NOT
  servers; only bte-explorer needs a domain (Caddy proxies /v0 -> localhost:8090, Caddyfile:6-14).

## Landing prompt -> capsule handoff (2026-07-12)
- The hero prompt used to DISCARD what the visitor typed (landing.ts just set location.hash),
  despite a comment claiming it "rides the hash into the app" — so they answered "what should
  stay sealed?" twice, once on the hero and again at the playground's #pg-secret.
- Now: landing.ts stashes the trimmed text via putSealDraft(); playground.ts calls takeSealDraft()
  right after renderFields(), selects the time-capsule tab, prefills #pg-secret, focuses it, and
  scrolls it into view.
- The draft rides sessionStorage (packages/explorer/src/draft.ts), NOT the URL: the text is the
  user's SECRET, and the hash would persist it in browser history and in any copied link. Cleared
  on read so a reload never resurrects it. Landing input capped at maxlength=200 to match #pg-secret.
- Reveal timing still defaults to 60s on arrival from the landing page (may be wrong for someone
  sealing a launch date — open question).

## Open items
- Remote IS live now: github.com/Adityaakr/peal-network (main deploys to Railway ->
  peal.adibuilds.in). Supersedes the old "no GitHub remote yet" note.
- Live devnet has NO chain contact: SEPOLIA_RPC_URL is unset on the service, so every condition
  actually firing today is at_time on the coordinator's wall clock. fire_at_block is dead code in
  prod until an RPC is configured.
- Sepolia run of the anchored demo pending SEPOLIA_RPC_URL +
  funded ANCHOR_PRIVATE_KEY (anvil path verified).
- Set BTE_KEYSTORE_PASS on the Railway service (currently the public default) and get a backup
  story for the /bte-state volume — both are now permanent risks, see the persistence section.
- Harden start-railway.sh: a missing params.bin is treated as "first boot, run the ceremony" when
  it actually means "the volume is gone and I am about to orphan every seal". Should fail loudly.
- Rewrite docs/deploy-railway.md to match the live all-in-one shape + the required volume.
- Public devnet: DEVNET_URL in the SDK is a placeholder
  (`https://devnet.bte.invalid`); update when a devnet exists + set the
  playground URL in docs/launch.md.
- Explorer: agent-built and gate-verified; do one human visual pass.

## Telemetry (final run)
- divergence: n/a (execution build; spec was the approved plan)
- models: main loop + 1 explorer subagent; gates (executable) replaced skeptic panels
- claims: all DoD rows verified in-session except "CI green" (supported: same commands local)
- fleet: 1 subagent · overhead vs single-pass ≈ 1.1x
