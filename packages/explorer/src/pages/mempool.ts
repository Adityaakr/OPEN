// The encrypted mempool, live on Tempo. A DEX-style swap that, once sent, opens
// into a side-by-side of what happens to it in a public mempool versus the
// sealed Peal mempool — the same trade, sandwiched on one side and untouched on
// the other, with the real on-chain transactions behind both.
//
// Nothing here is simulated: both pools are real contracts, the searcher is a
// real bot, and the sealed order settles via PealMempool.executeBatch. The
// browser signs nothing; the relayer sponsors both lanes. The committee trust
// caveat lives in the FAQ.
import { BteClient } from 'bte-sdk';
import { API_BASE } from '../api';
import {
  commitSealed,
  encodeOrder,
  fromWad,
  getAmountOut,
  getConfig,
  getPealResult,
  getPublicResult,
  getState,
  submitPublicSwap,
  toWad,
  txUrl,
  type MempoolConfig,
} from '../mempool/chain';
import { createSandwichScene, createVaultScene, type Scene } from '../mempool/visuals';
import { esc, fmtCountdown } from '../util';

const ROUND_SECS = 30;
const POLL_MS = 1500;
const SLIP_BPS: Record<string, bigint> = { '0.001': 10n, '0.005': 50n, '0.01': 100n, '0.03': 300n };

type Sym = 'USDC' | 'ETH';
const COIN: Record<Sym, string> = {
  USDC: '<i class="mp-coin mp-coin-usdc"></i>USDC',
  ETH: '<i class="mp-coin mp-coin-eth"></i>ETH',
};
/** Sensible default pay amount per token, both ~ $250k so either direction
 * gets sandwiched on the deep pool. */
const DEFAULT_AMT: Record<Sym, string> = { USDC: '250000', ETH: '80' };

const usd2 = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const num = (s: string, dp = 4) => Number(s).toLocaleString(undefined, { maximumFractionDigits: dp });

export function renderMempool(root: HTMLElement): () => void {
  const previousTitle = document.title;
  document.title = 'Peal Network. encrypted mempool';

  const client = new BteClient({ url: API_BASE });
  let cfg: MempoolConfig | null = null;
  let dead = false;
  let busy = false;
  /** true = pay USDC, receive ETH; false = pay ETH, receive USDC. */
  let usdcToEth = true;
  const timers: number[] = [];
  let sandwich: Scene | null = null;
  let vault: Scene | null = null;

  const payToken = (): Sym => (usdcToEth ? 'USDC' : 'ETH');
  const recvToken = (): Sym => (usdcToEth ? 'ETH' : 'USDC');
  /** Value an amount of `sym` in USD, given the pool mid price (USDC per ETH). */
  const toUsd = (amount: number, sym: Sym, price: number) => (sym === 'USDC' ? amount : amount * price);

  root.innerHTML = `
    <section class="mp">
      <header class="mp-hero">
        <h1 class="mp-title">encrypted mempool</h1>
        <p class="mp-tagline">swap on a live pool. watch MEV vanish.</p>
      </header>
      <div id="mp-boot" class="mp-boot">connecting to the live pool…</div>
      <div id="mp-app" hidden></div>
    </section>
  `;
  const bootEl = root.querySelector<HTMLElement>('#mp-boot')!;
  const appEl = root.querySelector<HTMLElement>('#mp-app')!;

  void boot();

  async function boot(): Promise<void> {
    try {
      cfg = await getConfig();
      await getState();
      if (dead) return;
      mountApp();
    } catch {
      bootEl.innerHTML = `
        <p class="error" style="margin-top:0">the live demo stack is not reachable.</p>
        <p class="muted">start the relayer, searcher and settler in
        <span class="mono">packages/mempool-agents</span>, then reload.</p>`;
    }
  }

  function mountApp(): void {
    const c = cfg!;
    bootEl.hidden = true;
    appEl.hidden = false;
    appEl.innerHTML = `
      <div class="mp-stage">
        <div class="mp-swap-wrap" id="mp-swap-wrap">
          <div class="mp-swap">
            <div class="mp-swap-head">
              <span>Swap</span>
              <span class="mp-swap-net" title="live on Tempo">chain ${c.chainId}</span>
            </div>

            <div class="mp-swap-field">
              <div class="mp-field-top"><span>You pay</span></div>
              <div class="mp-field-main">
                <input type="number" id="mp-pay" value="250000" min="0.0001" max="50000000" step="10000"
                       autocomplete="off" inputmode="decimal" />
                <span class="mp-token" id="mp-pay-token">${COIN.USDC}</span>
              </div>
            </div>

            <div class="mp-swap-mid">
              <button type="button" class="mp-swap-swapicon" id="mp-flip" aria-label="flip the pair"></button>
            </div>

            <div class="mp-swap-field">
              <div class="mp-field-top"><span>You receive</span></div>
              <div class="mp-field-main">
                <span class="mp-recv" id="mp-recv">0.0</span>
                <span class="mp-token" id="mp-recv-token">${COIN.ETH}</span>
              </div>
            </div>

            <div class="mp-swap-info">
              <div class="mp-info-row"><span>Rate</span><span id="mp-rate" class="mono">—</span></div>
              <div class="mp-info-row">
                <span>Max slippage</span>
                <select id="mp-slip" class="mp-slip">
                  <option value="0.001">0.1%</option>
                  <option value="0.005" selected>0.5%</option>
                  <option value="0.01">1%</option>
                  <option value="0.03">3%</option>
                </select>
              </div>
              <div class="mp-info-row"><span>Min received</span><span id="mp-min" class="mono">—</span></div>
            </div>

            <button type="button" class="mp-swap-btn" id="mp-go">Swap</button>
            <p class="mp-swap-foot">you sign nothing. the relayer sponsors the transaction.</p>
            <p class="error" id="mp-error" hidden></p>
          </div>
        </div>

        <div class="mp-compare" id="mp-compare" hidden>
          <div class="mp-lanes">
            <article class="mp-lane mp-lane-public">
              <header class="mp-lane-head"><h2>public mempool</h2><span class="mp-lane-chip mp-chip-red">readable</span></header>
              <div class="mp-visual" id="mp-vis-public"></div>
              <div class="mp-lane-result" id="mp-res-public"></div>
            </article>
            <article class="mp-lane mp-lane-peal">
              <header class="mp-lane-head"><h2>peal mempool</h2><span class="mp-lane-chip mp-chip-blue">sealed</span></header>
              <div class="mp-visual" id="mp-vis-peal"></div>
              <div class="mp-lane-result" id="mp-res-peal"></div>
            </article>
          </div>
          <div class="mp-diff" id="mp-diff" hidden></div>
          <button type="button" class="btn" id="mp-again" hidden>swap again</button>
        </div>
      </div>

      <section class="mp-faq">
        <h2 class="mp-faq-title">FAQ</h2>
        ${faqHtml(c.chainId)}
      </section>
    `;

    wireFaq(appEl);

    const payEl = appEl.querySelector<HTMLInputElement>('#mp-pay')!;
    const slipEl = appEl.querySelector<HTMLSelectElement>('#mp-slip')!;
    const recvEl = appEl.querySelector<HTMLElement>('#mp-recv')!;
    const rateEl = appEl.querySelector<HTMLElement>('#mp-rate')!;
    const minEl = appEl.querySelector<HTMLElement>('#mp-min')!;
    const payTokEl = appEl.querySelector<HTMLElement>('#mp-pay-token')!;
    const recvTokEl = appEl.querySelector<HTMLElement>('#mp-recv-token')!;
    const go = appEl.querySelector<HTMLButtonElement>('#mp-go')!;

    const refreshQuote = async () => {
      if (busy) return;
      try {
        const { pealPool } = await getState();
        // Direction: paying USDC spends base for quote; paying ETH spends quote
        // for base.
        const [rIn, rOut] = usdcToEth ? [pealPool.base, pealPool.quote] : [pealPool.quote, pealPool.base];
        const amountIn = toWad(Number(payEl.value) || 0);
        const out = getAmountOut(amountIn, rIn, rOut);
        const slip = SLIP_BPS[slipEl.value] ?? 50n;
        const floor = (out * (10000n - slip)) / 10000n;
        recvEl.textContent = num(fromWad(out));
        const price = Number(fromWad(pealPool.base)) / Number(fromWad(pealPool.quote));
        rateEl.textContent = `1 ETH = ${price.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC`;
        minEl.textContent = `${num(fromWad(floor))} ${recvToken()}`;
      } catch {
        /* transient */
      }
    };
    payEl.addEventListener('input', () => void refreshQuote());
    slipEl.addEventListener('change', () => void refreshQuote());
    void refreshQuote();

    appEl.querySelector<HTMLButtonElement>('#mp-flip')!.addEventListener('click', () => {
      if (busy) return;
      usdcToEth = !usdcToEth;
      payTokEl.innerHTML = COIN[payToken()];
      recvTokEl.innerHTML = COIN[recvToken()];
      payEl.value = DEFAULT_AMT[payToken()];
      void refreshQuote();
    });

    go.addEventListener('click', () => {
      if (busy) return;
      void run(Number(payEl.value) || 0, slipEl.value).catch((err) => showError(err));
    });

    appEl.querySelector<HTMLButtonElement>('#mp-again')!.addEventListener('click', () => reset());
  }

  function showError(err: unknown): void {
    const el = appEl.querySelector<HTMLElement>('#mp-error');
    if (el) {
      el.hidden = false;
      el.textContent = err instanceof Error ? err.message : String(err);
    }
    busy = false;
    const go = appEl.querySelector<HTMLButtonElement>('#mp-go');
    if (go) {
      go.disabled = false;
      go.textContent = 'Swap';
    }
  }

  function reset(): void {
    const compare = appEl.querySelector<HTMLElement>('#mp-compare')!;
    const swapWrap = appEl.querySelector<HTMLElement>('#mp-swap-wrap')!;
    compare.classList.remove('is-in');
    compare.hidden = true;
    swapWrap.hidden = false;
    // force reflow then animate back in
    void swapWrap.offsetWidth;
    swapWrap.classList.remove('is-out');
    sandwich?.destroy();
    vault?.destroy();
    sandwich = null;
    vault = null;
    busy = false;
    const go = appEl.querySelector<HTMLButtonElement>('#mp-go');
    if (go) {
      go.disabled = false;
      go.textContent = 'Swap';
    }
  }

  // ---- the run ----------------------------------------------------------

  async function run(amount: number, slipKey: string): Promise<void> {
    busy = true;
    const c = cfg!;
    const go = appEl.querySelector<HTMLButtonElement>('#mp-go')!;
    go.disabled = true;
    go.textContent = 'sending…';

    const { pealPool } = await getState();
    const [rIn, rOut] = usdcToEth ? [pealPool.base, pealPool.quote] : [pealPool.quote, pealPool.base];
    const amountIn = toWad(amount);
    const fair = getAmountOut(amountIn, rIn, rOut);
    const slip = SLIP_BPS[slipKey] ?? 50n;
    const minOut = (fair * (10000n - slip)) / 10000n;
    const midPrice = Number(fromWad(pealPool.base)) / Number(fromWad(pealPool.quote));
    const baseToQuote = usdcToEth;
    const recvUnit = recvToken();
    const payUnit = payToken();

    // Transition: swap card out, comparison in.
    const swapWrap = appEl.querySelector<HTMLElement>('#mp-swap-wrap')!;
    const compare = appEl.querySelector<HTMLElement>('#mp-compare')!;
    swapWrap.classList.add('is-out');
    setTimeout(() => {
      swapWrap.hidden = true;
    }, 420);
    compare.hidden = false;
    void compare.offsetWidth;
    compare.classList.add('is-in');

    // Mount the 3D scenes.
    sandwich = createSandwichScene();
    vault = createVaultScene();
    appEl.querySelector<HTMLElement>('#mp-vis-public')!.appendChild(sandwich.el);
    appEl.querySelector<HTMLElement>('#mp-vis-peal')!.appendChild(vault.el);
    sandwich.play();
    vault.play();

    const publicRes = appEl.querySelector<HTMLElement>('#mp-res-public')!;
    const pealRes = appEl.querySelector<HTMLElement>('#mp-res-peal')!;
    publicRes.innerHTML = laneStatus('the searcher is reading your order in the clear…');
    pealRes.innerHTML = laneStatus(`sealed. cue in ${ROUND_SECS}s. the searcher sees only a hash…`);

    // Seal the peal order through the real coordinator.
    const conditionId = await client.condition({ in: ROUND_SECS, tag: 'mempool' });
    const payload = encodeOrder({ trader: c.relayer, baseToQuote, amountIn, minOut, to: c.relayer });
    const sealed = await client.seal(payload, conditionId);
    if (dead) return;

    const commit = await commitSealed(conditionId, sealed.ctHash);
    pealRes.innerHTML = laneStatus(
      `committed on-chain as a hash (${link(commit.txHash)}). cue in ~${ROUND_SECS}s…`,
    );

    const pub = await submitPublicSwap({
      amountIn: String(amount),
      minOut: fromWad(minOut),
      baseToQuote,
    });

    const [pubOut, pealOut] = await Promise.all([
      pollPublic(pub.orderId, fair, { recvUnit, payUnit, price: midPrice }, publicRes),
      pollPeal(conditionId, fair, recvUnit, pealRes),
    ]);
    if (dead) return;

    // Difference banner.
    const diff = appEl.querySelector<HTMLElement>('#mp-diff')!;
    diff.hidden = false;
    if (pubOut.sandwiched) {
      const keptUsd = toUsd(Number(pealOut.fill) - Number(pubOut.victimOut), recvUnit, midPrice);
      diff.innerHTML =
        `<span class="mp-diff-kicker">same swap, two mempools</span>` +
        `<span class="mp-diff-num">${usd2(keptUsd)}</span>` +
        `<span class="mp-diff-cap">kept on Peal that the searcher took in the public mempool</span>`;
    } else {
      diff.innerHTML =
        `<span class="mp-diff-kicker">same swap, two mempools</span>` +
        `<span class="mp-diff-cap">too small to sandwich here — but the public lane leaks the moment the trade is worth wrapping. the sealed lane never does.</span>`;
    }
    appEl.querySelector<HTMLButtonElement>('#mp-again')!.hidden = false;
    busy = false;
  }

  // ---- lane polling / rendering -----------------------------------------

  function laneStatus(msg: string): string {
    return `<div class="mp-lane-status"><span class="mp-spinner" aria-hidden="true"></span>${esc(msg)}</div>`;
  }

  function link(hash: string): string {
    const u = txUrl(cfg!, hash);
    const short = `${hash.slice(0, 8)}…${hash.slice(-4)}`;
    return u
      ? `<a class="mono link" href="${u}" target="_blank" rel="noopener">${short}</a>`
      : `<span class="mono">${short}</span>`;
  }

  interface PubOut {
    sandwiched: boolean;
    victimOut: string;
    profit: string;
  }

  function pollPublic(
    orderId: string,
    fairWei: bigint,
    ctx: { recvUnit: Sym; payUnit: Sym; price: number },
    resEl: HTMLElement,
  ): Promise<PubOut> {
    return new Promise((resolve) => {
      const tick = async () => {
        if (dead) return resolve({ sandwiched: false, victimOut: fromWad(fairWei), profit: '0' });
        const r = await getPublicResult(orderId).catch(() => ({ done: false }) as never);
        if (!r.done) return;
        clearInterval(id);
        const fair = Number(fromWad(fairWei));
        if (r.sandwiched) {
          const lostUsd = toUsd(fair - Number(r.victimOut), ctx.recvUnit, ctx.price);
          // The searcher's profit is denominated in the victim's PAY token.
          const profitUsd = toUsd(Number(r.profit), ctx.payUnit, ctx.price);
          sandwich?.resolve({ lostUsd });
          resEl.innerHTML = resultHtml({
            tone: 'bad',
            got: r.victimOut ?? '',
            unit: ctx.recvUnit,
            line: `the searcher took <b>${usd2(profitUsd)}</b>`,
            tx: link(r.txHash ?? ''),
          });
        } else {
          sandwich?.resolve({ lostUsd: 0 });
          resEl.innerHTML = resultHtml({
            tone: 'ok',
            got: r.victimOut ?? '',
            unit: ctx.recvUnit,
            line: `filled in full — too small to sandwich`,
            tx: link(r.txHash ?? ''),
          });
        }
        resolve({ sandwiched: !!r.sandwiched, victimOut: r.victimOut ?? fromWad(fairWei), profit: r.profit ?? '0' });
      };
      const id = window.setInterval(() => void tick(), POLL_MS);
      timers.push(id);
      void tick();
    });
  }

  interface PealOut {
    fill: string;
  }

  function pollPeal(conditionId: string, fairWei: bigint, recvUnit: Sym, resEl: HTMLElement): Promise<PealOut> {
    return new Promise((resolve) => {
      let firesAt = Math.floor(Date.now() / 1000) + ROUND_SECS;
      const tick = async () => {
        if (dead) return resolve({ fill: fromWad(fairWei) });
        try {
          const st = await client.status(conditionId);
          if (st.firesAt) firesAt = st.firesAt;
        } catch {
          /* transient */
        }
        const secs = firesAt - Math.floor(Date.now() / 1000);
        const r = await getPealResult(conditionId).catch(() => ({ done: false }) as never);
        if (!r.done) {
          resEl.innerHTML = laneStatus(
            secs > 0
              ? `sealed. the batch opens in ${esc(fmtCountdown(secs))}. nothing to read.`
              : `the cue fired. opening the batch on-chain…`,
          );
          return;
        }
        clearInterval(id);
        const fill = r.fills?.[0]?.amountOut ?? fromWad(fairWei);
        vault?.resolve({ kept: true });
        resEl.innerHTML = resultHtml({
          tone: 'good',
          got: fill,
          unit: recvUnit,
          line: `the searcher took <b>$0</b>, opened by executeBatch`,
          tx: link(r.txHash ?? ''),
        });
        resolve({ fill });
      };
      const id = window.setInterval(() => void tick(), POLL_MS);
      timers.push(id);
      void tick();
    });
  }

  function resultHtml(o: { tone: 'bad' | 'ok' | 'good'; got: string; unit: Sym; line: string; tx: string }): string {
    const gotClass = o.tone === 'bad' ? 'mp-got-bad' : o.tone === 'good' ? 'mp-got-good' : 'mp-got-ok';
    const dp = o.unit === 'USDC' ? 2 : 4;
    return `
      <div class="mp-result-num ${gotClass}">${num(o.got, dp)}<span class="mp-result-unit">${o.unit}</span></div>
      <div class="mp-result-line">${o.line}. ${o.tx}</div>`;
  }

  return () => {
    dead = true;
    for (const t of timers) clearInterval(t);
    sandwich?.destroy();
    vault?.destroy();
    document.title = previousTitle;
  };
}

// ---- FAQ ----------------------------------------------------------------

function faqHtml(chainId: number): string {
  const items: Array<[string, string]> = [
    [
      'Is any of this simulated?',
      `No. Both pools are real contracts on chain ${chainId}. The searcher is a real bot with its own key; on the public lane it submits real front-run and back-run transactions, and on the peal lane it sees only a ciphertext hash and does nothing. Your order is sealed through the real committee and settled by <span class="mono">PealMempool.executeBatch</span>, which re-derives the batch's merkle root and refuses anything that is not the revealed batch.`,
    ],
    [
      'Do I need a wallet or gas?',
      `No. You sign nothing. A relayer holds a funded key and sponsors both submissions on your behalf, so you can try it with one click.`,
    ],
    [
      'How does the searcher take money on the public side?',
      `It reads your pending swap in the clear, buys ahead of you to push the price up (the front-run), lets your swap fill at the worse price, then sells back (the back-run). It sizes the front-run to push you to exactly your slippage floor and no further — so your tolerance is really the quote you hand the searcher.`,
    ],
    [
      'Why can it not do that on the peal side?',
      `Because it never sees the order. The commitment on-chain is just a hash: no amount, no direction, nothing to wrap a sandwich around. The whole batch opens at once at the cue, after the ordering is already fixed.`,
    ],
    [
      "What's the honest gap today?",
      `The committee is dealer-trusted and its operators do not yet verify the cue for themselves, so today a dishonest operator could read the sealed order early. That is the decentralisation work still on the roadmap. The cryptography and the settlement are real; the committee's trust model is not there yet.`,
    ],
  ];
  return items
    .map(
      ([q, a], i) => `
      <div class="mp-faq-item" data-faq="${i}">
        <button type="button" class="mp-faq-q" aria-expanded="false">
          <span>${esc(q)}</span><span class="mp-faq-caret" aria-hidden="true"></span>
        </button>
        <div class="mp-faq-a"><p>${a}</p></div>
      </div>`,
    )
    .join('');
}

function wireFaq(scope: HTMLElement): void {
  scope.querySelectorAll<HTMLButtonElement>('.mp-faq-q').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.mp-faq-item')!;
      const open = item.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(open));
    });
  });
}
