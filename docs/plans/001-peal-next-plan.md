# 001 — Peal Network: the next plan

Date: 2026-07-08. Author: prism-plan (8-lens fan-out + 3-skeptic adversarial panel).
Source of direction: whitepaper Peal v4.0 (`~/Downloads/peal.pdf`), current code state,
`.prism/project-model.md`.

## Recommendation (lead)

Reframe the next phase around one sentence: **earn the network thesis on a single
painkiller.** Do not ship a serious product on the single-trusted-dealer committee and
call the trust hole a caveat, and do not disappear into a solo multi-month DKG build with
no user at the end. Both extremes were adversarially refuted. Run three tracks in parallel:

1. **Remove the single-dealer trust hole, de-risked, not solo-grinded.** This is the real
   unlock. Investigate a multi-party setup ceremony (powers-of-tau style, secure if one
   contributor is honest) as a lighter alternative to full live DKG, and get outside help
   or money for it (grant, or co-development with commonware whose research this builds on,
   or open-source it). This is what turns a centralized notary in crypto vocabulary into
   Peal.
2. **Validate ONE painkiller with a real design partner and an explicit kill-criterion.**
   The painkiller is sealed-bid auction rails / dark-block sealed order flow, where real
   willingness-to-pay exists, sold as a dedicated committee. It is NOT agent track records
   (a vitamin: months of history needed, adverse selection, market already routes around
   it). Kill-criterion: no serious pilot or LOI interest in roughly 8 weeks of focused
   outreach means the thesis is wrong, so pivot or stop.
3. **Cheap credibility finishers, week one:** Sepolia anchored run, npm publish of
   `bte-sdk`, Railway cleanup, one human visual pass on the explorer. Unrefuted, trivial,
   make it look shipped.

Token (`$PEAL` / `$sPEAL`) stays LAST. Stop any "reveal-later encryption, trust us tau is
gone" marketing until the dealer is gone. Over-claiming the trust model is the fastest way
to lose technical credibility.

## Why (load-bearing reasons)

- **Trust and demand are the same bottleneck, not two.** The only use with real budget
  (sealed order flow / auctions) is exactly the one that requires trust-minimization. Agent
  track records was the escape hatch that let you separate "ship now on weak trust" from
  "harden later." The adversarial panel closed it 3/3: for a trust product, a trusted dealer
  negates the value proposition, and near-term demand for the record is a mirage.
- **The trusted dealer is an integrity break, not just confidentiality.** A dealer that
  sampled tau can decrypt any sealed payload and its "tamper-evident" guarantee rests on the
  unverifiable claim that one machine deleted the master secret. That is the trusted third
  party the product exists to remove. Grounded: `crates/bte-crypto/src/lib.rs:192-233`
  (in-process tau), `crates/bte-cli/src/main.rs:20-115` (ceremony), `SECURITY.md`,
  `README.md:119-134`.
- **Full DKG solo is the wrong shape of hard.** simple-bte (pinned rev `147a0878`) has zero
  DKG or reshare code; the scheme needs Shamir shares of the powers tau^1..tau^B under a
  punctured CRS, not a stock single-secret DKG, so commonware's DKG primitives are only
  partially reusable and the powers-of-tau shape is bespoke integration plus a live
  multi-party protocol. Estimate weeks to months. A setup ceremony is a much smaller,
  well-trodden artifact that removes the single-dealer hole without a live committee
  protocol. Grounded: `crates/bte-crypto/src/lib.rs:57-73,192-233`, `vendor/simple-bte`,
  `spec/index.md:15-49`, `spec/ROADMAP.md`.
- **A token is not required for revenue or for a credible committee.** Metered reveal fees,
  dedicated-committee subscriptions, and auction take-rates are B2B SaaS cash with no
  securities surface. Bonding can be fiat or USDC plus contractual SLA. `$sPEAL`, a
  yield-bearing ERC-4626 derivative whose rate rises with fees, is the highest regulatory
  risk (profit-from-others'-efforts framing). Defer it past the permissionless stage and
  behind counsel. The whitepaper already commits to legal review before issuance.

## Steelman of the rejected option (agent track records as the wedge, defer DKG)

Strongest case: it is the one flagship buildable on the current stack with zero new
cryptography (`packages/sdk/src/anchor.ts` already has the commit/verify seam; the `tag`
field at `packages/sdk/src/index.ts:157` is the agent-namespace seam), it rides the
strongest current narrative (agent economy, x402 on Base with ~100M agent tx, AP2), and its
early-read harm looked reputational rather than custodial, so a weak committee seemed
acceptable. Practitioner and UX lenses both scoped a smallest-lovable version at 2 to 3
weeks.

Why I still passed: the panel showed the early-read harm is not merely reputational. Reading
a sealed prediction that is a live trading signal is worth money the instant it leaks, and
the record's completeness rests on a committee you cannot trust, so the product's one promise
("a record you cannot fake") is unverifiable exactly where it must be strongest. And the
demand is a mirage on an 8-week horizon: no meaningful track record accrues that fast, and
adverse selection means only agents with nothing to hide opt in. It remains a plausible
*second* product once the committee is trust-minimized, not the wedge.

## Assumptions and falsifiers

- **Assumes** a multi-party setup ceremony is compatible with the punctured-powers CRS. If
  the ceremony turns out to be as hard as full DKG (open question, see below), track 1's cost
  estimate is wrong and the "get help / grant" path becomes mandatory, not optional.
- **Assumes** sealed order flow / auctions has a reachable design partner. If 8 weeks of
  outreach produce nothing, the painkiller thesis is falsified and the honest move is a hard
  pivot, not more building.
- **Assumes** the goal is to build the network. If the goal is instead a fast acqui-hire or a
  narof demo for a grant, deferring the hard crypto and shipping the vitamin could be
  rational, since the trust hole is then someone else's problem. Name the goal.
- **Changes the answer if:** a design partner arrives who will pay for the *current*
  dealer-trusted stack for a genuinely low-stakes, non-adversarial use (time capsules,
  internal coordination). Then ship that immediately and let it fund track 1.

## Chain note (grounded 2026-07-08)

- On-chain share verification (whitepaper Stage 2, EIP-2537 pairing check) is buildable on
  **Ethereum mainnet today** (Pectra shipped EIP-2537). It removes only *detectable*
  coordinator trust, so it ranks BELOW removing the dealer. Not the next move.
- **Solana** BLS12-381 syscalls are SIMD-0388, pending devnet in Agave v4.0.0-beta, pending
  mainnet. The cheap anchor tier (a PDA storing the reveal root) works on Solana now; a
  Solana on-chain verifier becomes possible when SIMD-0388 activates. Track it; do not bet
  the plan on it. If the agent-economy angle ever revives, its rails live on Base/Solana, so
  the anchor tier there is the natural home.

## Open questions for the human (Aditya)

1. What is the real goal for the next 3 months: build the decentralized network, or land one
   paying pilot, or produce a fundable milestone (grant)? This picks the emphasis across the
   three tracks.
2. Do you already have any warm design-partner lead (a launchpad, DAO desk, auction venue)?
   If yes, track 2 starts today and the kill-criterion tightens.
3. Appetite for outside crypto help on the setup ceremony / DKG (grant-funded contractor,
   commonware collaboration, or open-source contributors)? This is the single biggest lever
   on whether track 1 is 3 weeks or 3 months.

## Telemetry

```
- divergence: 0.62 (evidence 0.80, conclusion 0.35) | threshold 0.30 UNCALIBRATED
- models: draft=opus · skeptics=2x-opus+1x-sonnet (cross-tier; version axis unavailable)
- fan-out: 8 lenses (first-principles, adversary, practitioner, security, regulatory,
  cost, UX/DX, scale/ops)
- claims:
    C1 "trusted dealer negates value for every serious use incl. agent records" — grounded
       (lib.rs:192-233, cli, SECURITY.md) AND 3/3 skeptics refuted the counter-claim
    C2 "agent track records has reachable near-term demand" — REFUTED (2 opus + 1 sonnet)
    C3 "full DKG is weeks-to-months, not commonware reuse" — grounded (lib.rs, simple-bte)
    C4 "token not required for revenue or committee; sPEAL highest reg risk" — grounded
       (ROADMAP items 4,6; no token infra exists), cross-tier survived
    C5 "EIP-2537 live on ETH mainnet; Solana BLS12-381 = SIMD-0388 pending" — grounded
       (live web: eips.ethereum.org, solana SIMD-0388)
```

Cross-tier verification reduces instance-/tier-level error correlation but not shared-lineage
blind spots. Treat cross-tier survival as weaker evidence than grounding.
