// The encrypted-mempool landing page. Ported from the Peal design system's
// mempool-landing UI kit to vanilla TS: the split-mempool hero (public glass
// waiting room vs sealed batch, sandwich then bloom loop), the footnoted problem
// stats, the six-step pipeline, the batched-vs-others table, the capsule anatomy
// with the committee ring, the integration snippet, honest limits, roadmap
// status, and the CTA band. Chain-level mempool is labelled "in build".
import { mountScrollReveal } from '../reveal';

const reduced = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- small brand components (inline svg/html) --------------------------

function reticle(): string {
  return `<span class="ml-reticle" aria-hidden="true">
    <svg viewBox="0 0 26 26" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6">
      <circle cx="13" cy="13" r="8"/><path d="M13 1v5M13 20v5M1 13h5M20 13h5"/>
      <circle cx="13" cy="13" r="1.6" fill="currentColor" stroke="none"/>
    </svg>
    <span class="ml-reticle-x" aria-hidden="true">
      <svg viewBox="0 0 26 26" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 7l12 12M19 7L7 19"/></svg>
    </span>
  </span>`;
}

function cueTag(text: string): string {
  return `<span class="ml-cue"><span class="ml-cue-mark" aria-hidden="true">&#x2B21;</span>${text}</span>`;
}

const PUBLIC_TXS = [
  { from: '0x8a…f3', to: 'Uniswap', what: 'swap 12.4 ETH → USDC', meta: 'slippage 0.5% · gas 34 gwei' },
  { from: '0x41…9c', to: 'Aave', what: 'repay 8,200 USDC', meta: 'gas 22 gwei' },
  { from: '0xd2…07', to: 'Uniswap', what: 'swap 950 USDC → WBTC', meta: 'slippage 0.3% · gas 28 gwei' },
  { from: '0x6b…e1', to: 'ENS', what: 'register vault.eth', meta: 'gas 19 gwei' },
];

const SEALED = [
  { slot: 27, header: 'a1c9…e2', sender: '0x8a…f3', gas: '210k', size: '1.2 kb', open: 'swap 12.4 ETH → USDC · slippage 0.5%' },
  { slot: 9, header: '7f04…b8', sender: '0x41…9c', gas: '96k', size: '0.9 kb', open: 'repay 8,200 USDC to Aave' },
  { slot: 41, header: 'c35a…11', sender: '0xd2…07', gas: '184k', size: '1.4 kb', open: 'swap 950 USDC → WBTC · slippage 0.3%' },
  { slot: 55, header: '02de…9f', sender: '0x6b…e1', gas: '61k', size: '0.8 kb', open: 'register vault.eth' },
];

function publicCard(tx: (typeof PUBLIC_TXS)[number], victim = false): string {
  return `<div class="ml-pub-card${victim ? ' ml-pub-victim' : ''}">
    <div class="ml-pub-top"><span class="mono ml-muted">from ${tx.from}</span><span class="ml-arrow">→</span><span class="ml-strong">${tx.to}</span></div>
    <div class="ml-strong">${tx.what}</div>
    <div class="ml-pub-meta">${tx.meta}</div>
    ${victim ? `<span class="mono ml-loss">-$412</span>` : ''}
  </div>`;
}

function botCard(label: string): string {
  return `<div class="ml-bot"><span class="mono">bot 0xee…42</span><span class="ml-strong">${label}</span></div>`;
}

function sealedCard(s: (typeof SEALED)[number]): string {
  return `<div class="ml-sealed">
    <div class="ml-sealed-top">
      <span class="mono ml-slot">slot ${String(s.slot).padStart(2, '0')}</span>
      <span class="mono ml-hdr">&#x2B21; <b>${s.header}</b></span>
      ${cueTag('block 23,401,882')}
      <span class="mono ml-size">${s.size}</span>
    </div>
    <div class="ml-sealed-env mono">
      <span>sender ${s.sender}</span><span>gas ${s.gas}</span>
      <span class="ml-shares">shares <b class="ml-shares-n">0/5</b></span>
    </div>
    <div class="ml-sealed-payload">
      <span class="ml-payload-bars" aria-hidden="true"></span>
      <span class="mono ml-payload-label">payload sealed</span>
      <span class="ml-payload-open">${s.open}</span>
      <span class="ml-payload-verified">✓ verified</span>
    </div>
  </div>`;
}

function committeeRing(n: number, t: number, lit: number): string {
  const cx = 75;
  const cy = 75;
  const r = 56;
  let dots = '';
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    const cls = i < lit ? 'ml-op-lit' : '';
    dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" class="ml-op ${cls}"/>`;
  }
  return `<div class="ml-ring">
    <svg viewBox="0 0 150 150" width="150" height="150">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--border)" stroke-width="1"/>
      ${dots}
      <circle cx="${cx}" cy="${cy}" r="20" class="ml-ring-core"/>
    </svg>
    <div class="ml-ring-cap"><b>${t} of ${n}</b> open it</div>
  </div>`;
}

function onDiagram(): string {
  return `<div class="ml-on">
    <div class="ml-on-ops">
      ${Array.from({ length: 5 }, (_, i) => `<span class="ml-on-op" style="--i:${i}"><span class="mono">op ${i + 1}</span><span class="ml-on-val">48b</span></span>`).join('')}
    </div>
    <div class="ml-on-arrow" aria-hidden="true"></div>
    <div class="ml-on-batch"><span class="mono">batch</span><b>B = 64</b><span class="ml-muted">opens at once</span></div>
    <p class="ml-on-cap">one 48-byte value per operator, whatever the batch size. <b>O(n)</b>, not O(n·B).</p>
  </div>`;
}

// ---- the page ----------------------------------------------------------

export function renderMempoolLanding(root: HTMLElement): () => void {
  const previousTitle = document.title;
  document.title = 'Peal Network. the mempool goes dark';

  root.innerHTML = `
    <div class="ml">
      <section class="ml-hero" id="ml-stage">
        <p class="ml-kicker scroll-reveal">encrypted mempool · in build</p>
        <h1 class="ml-h1 scroll-reveal">the mempool goes dark.</h1>
        <p class="ml-sub scroll-reveal">transactions travel as 48-byte sealed capsules. builders order what they
        cannot read. when the block is final, the whole batch opens at once, and the sandwich never had anything to see.</p>
        <div class="ml-hero-ctas scroll-reveal">
          <a class="ml-btn ml-btn-dark" href="#/encrypted-mempool">try the playground</a>
          <a class="ml-btn" href="#/philosophy">read the whitepaper</a>
        </div>

        <div class="ml-stage scroll-reveal">
          <div class="ml-col ml-col-public">
            <div class="ml-col-head"><span class="ml-col-title">public mempool · today</span>${reticle()}</div>
            ${botCard('buy first · same pool')}
            ${publicCard(PUBLIC_TXS[0], true)}
            ${botCard('sell after · pockets the spread')}
            ${publicCard(PUBLIC_TXS[1])}
            ${publicCard(PUBLIC_TXS[2])}
            ${publicCard(PUBLIC_TXS[3])}
            <div class="ml-micro">everything readable · anyone can act first</div>
          </div>
          <div class="ml-col ml-col-peal">
            <div class="ml-col-head">
              <span class="ml-col-title">peal mempool</span>
              <span class="ml-peal-status">
                <span class="ml-cue-live">${cueTag('cue: block 23,401,882')}</span>
                <span class="ml-open-live">batch open · everyone hears it at once</span>
                ${reticle()}
              </span>
            </div>
            ${SEALED.map(sealedCard).join('')}
            <div class="ml-micro">
              <span class="ml-micro-sealed">envelope visible · payload sealed · nothing to front-run</span>
              <span class="ml-micro-open">opened together · already in fixed order</span>
            </div>
          </div>
        </div>

        <p class="ml-thesis scroll-reveal">the searcher's problem is not made harder. <b>it is made empty.</b></p>
      </section>

      <section class="ml-section">
        <div class="ml-wrap ml-stats scroll-reveal">
          <div class="ml-stat"><div class="ml-stat-big">$1.8B+<sup>1</sup></div><div class="ml-stat-small">drained from ethereum users since 2020 via MEV</div></div>
          <div class="ml-stat"><div class="ml-stat-big">$100B+<sup>2</sup></div><div class="ml-stat-small">volume already routed through paid, private (not encrypted) protection</div></div>
          <div class="ml-stat"><div class="ml-stat-big">~3 min<sup>3</sup></div><div class="ml-stat-small">today's only live threshold mempool's average inclusion time</div></div>
        </div>
        <p class="ml-wrap ml-foot scroll-reveal">¹ Shutter / Primev, 2025 (cumulative since 2020) · ² Flashbots Protect + MEV Blocker protected volume · ³ Shutter on Gnosis, Oct 2025</p>
      </section>

      <section class="ml-section">
        <div class="ml-wrap scroll-reveal">
          <p class="ml-sec-kicker">how it works</p>
          <h2 class="ml-h2">six steps, one moment of disclosure</h2>
          <div class="ml-steps">
            ${[
              ['01', 'sign', 'the user signs the tx in their wallet.'],
              ['02', 'seal', 'encrypted to the committee: 48-byte header plus opaque payload. one call.'],
              ['03', 'order, blind', 'builders order ciphertexts they cannot read.'],
              ['04', 'finalize', 'block inclusion is the cue. position is irrevocable.'],
              ['05', 'open', 'one tiny value per operator; the whole batch decrypts at once.'],
              ['06', 'execute', 'in the already-fixed order. nothing to front-run ever existed.'],
            ]
              .map(
                ([n, t, d], i) =>
                  `<div class="ml-step${i >= 1 && i <= 3 ? ' ml-step-hot' : ''}"><div class="mono ml-step-n">${n}</div><div class="ml-step-t">${t}</div><div class="ml-step-d">${d}</div></div>`,
              )
              .join('')}
          </div>
          <div class="ml-brackets">
            <div class="ml-bracket ml-bracket-hot">opaque to builders and searchers (02 to 04)</div>
            <div class="ml-bracket">ordering already irrevocable (05 to 06)</div>
          </div>
        </div>
      </section>

      <section class="ml-section">
        <div class="ml-wrap scroll-reveal">
          <p class="ml-sec-kicker">why batched</p>
          <h2 class="ml-h2">the moat is one 48-byte value</h2>
          <div class="ml-table-wrap">
            <table class="ml-table">
              <thead><tr><th></th><th>per-transaction threshold</th><th>per-epoch threshold</th><th class="ml-th-peal">batched threshold (peal)</th></tr></thead>
              <tbody>
                <tr><td class="ml-td-key">committee traffic</td><td class="ml-muted">one share per tx · O(n·B)</td><td class="ml-muted">one key per epoch</td><td class="ml-strong">one 48-byte value per operator · O(n)</td></tr>
                <tr><td class="ml-td-key">unincluded txs</td><td class="ml-muted">stay private</td><td class="ml-muted">exposed at epoch key drop</td><td class="ml-strong">stay private</td></tr>
                <tr><td class="ml-td-key">slot/epoch binding</td><td class="ml-muted">none</td><td class="ml-muted">required</td><td class="ml-strong">none</td></tr>
                <tr><td class="ml-td-key">reveal latency</td><td class="ml-muted">grows with load</td><td class="ml-muted">epoch-bound</td><td class="ml-strong">~1s finalize · precompute hidden</td></tr>
              </tbody>
            </table>
          </div>
          <div class="ml-why-bottom">
            ${onDiagram()}
            <blockquote class="ml-quote">
              <p>"batched threshold encryption addresses the drawbacks of both per-epoch and per-transaction schemes."</p>
              <cite>the team behind today's only live threshold mempool</cite>
            </blockquote>
          </div>
        </div>
      </section>

      <section class="ml-section">
        <div class="ml-wrap scroll-reveal">
          <p class="ml-sec-kicker">the capsule, up close</p>
          <h2 class="ml-h2">what a sealed transaction shows the world</h2>
          <div class="ml-anatomy">
            <div class="ml-anatomy-left">
              ${sealedCard(SEALED[0])}
              <div class="ml-anatomy-rows">
                <span class="ml-anatomy-key ml-anatomy-key-accent">48-byte header</span><span>one G1 point (BLS12-381). the only cryptographic overhead, shown as short hex.</span>
                <span class="ml-anatomy-key">opaque payload</span><span>the transaction itself. unreadable below the committee threshold.</span>
                <span class="ml-anatomy-key">cue tag</span><span>what opens it. for the mempool: inclusion itself.</span>
                <span class="ml-anatomy-key">pairing check</span><span>every operator's share verified in public, one equation. that's the ✓.</span>
              </div>
            </div>
            ${committeeRing(16, 11, 12)}
          </div>
          <p class="ml-note">visible before the reveal: ciphertext size, gas limit, sender. hidden: everything the sandwich needs.</p>
        </div>
      </section>

      <section class="ml-section" id="ml-integration">
        <div class="ml-wrap scroll-reveal">
          <p class="ml-sec-kicker">integration</p>
          <h2 class="ml-h2">two lines in front of any signer</h2>
          <div class="ml-code-wrap">
            <span class="ml-code-tab">ts</span>
            <pre class="ml-code"><code><span class="ml-k">const</span> raw = <span class="ml-k">await</span> wallet.signTransaction(tx);
<span class="ml-k">await</span> peal.seal(raw, cues.atInclusion(<span class="ml-s">"ethereum"</span>), { lane: <span class="ml-s">"mempool"</span> });</code></pre>
          </div>
          <p class="ml-note">wallets · RPCs · rollup sequencers · LUCID key-provider ready</p>
        </div>
      </section>

      <section class="ml-section">
        <div class="ml-wrap ml-narrow scroll-reveal">
          <p class="ml-sec-kicker">honest limits</p>
          <h2 class="ml-h2">what this does, and what it doesn't</h2>
          <p class="ml-p"><strong>what this does:</strong> removes mempool-stage MEV, front-running, sandwiching, and real-time censorship, by removing the visibility they require.</p>
          <p class="ml-p"><strong>what it doesn't:</strong> metadata (size, gas, sender) stays visible before the reveal; post-reveal, state-based strategies are out of scope. guarantees hold under an honest-threshold committee, which is exactly what staking and slashing exist to price.</p>
        </div>
      </section>

      <section class="ml-section">
        <div class="ml-wrap scroll-reveal">
          <p class="ml-sec-kicker">status</p>
          <div class="ml-status-chips">
            <span class="ml-chip ml-chip-live">live: playground + app-level sealed lanes</span>
            <span class="ml-chip ml-chip-build">in build: chain-level encrypted mempool</span>
          </div>
          <p class="ml-p ml-narrow">live today: the peal playground and app-level sealed lanes. this page: the chain-level integration we're building on the same engine. the current stage is always stated at peal.network.</p>
          <p class="ml-note">ethereum · L2s · LUCID-ready</p>
        </div>
      </section>

      <section class="ml-section ml-cta">
        <div class="ml-wrap scroll-reveal">
          <p class="ml-cta-title">seal now. reveal on cue.</p>
          <div class="ml-hero-ctas">
            <a class="ml-btn ml-btn-dark" href="#/encrypted-mempool">try the playground</a>
            <a class="ml-btn" href="#/philosophy">read the whitepaper</a>
            <a class="ml-btn" href="#/philosophy">partner with us</a>
          </div>
        </div>
      </section>
    </div>
  `;

  // The hero loop: 10 beats, ~1.1s each. Toggle phase classes on the stage.
  const stage = root.querySelector<HTMLElement>('#ml-stage')!;
  let t = reduced() ? 6 : 0;
  const paint = () => {
    stage.classList.toggle('is-scan', t === 3);
    stage.classList.toggle('is-attack', t >= 4 && t <= 8);
    stage.classList.toggle('is-dissolved', t >= 4);
    stage.classList.toggle('is-finalize', t >= 7);
    stage.classList.toggle('is-bloom', t >= 8);
  };
  paint();
  let timer = 0;
  if (!reduced()) {
    timer = window.setInterval(() => {
      t = (t + 1) % 10;
      paint();
    }, 1100);
  }

  const cleanupReveal = mountScrollReveal(root);

  return () => {
    if (timer) clearInterval(timer);
    cleanupReveal();
    document.title = previousTitle;
  };
}
