// The playground: seal a secret in this browser tab, watch the network
// reveal it on cue. Sealing runs in bte-sdk's wasm; only the ciphertext
// leaves the tab.
import { BteClient } from 'bte-sdk';
import { API_BASE, getCondition, getReveal, type ConditionDetail } from './api';
import { esc, fmtCountdown, truncMiddle } from './util';

const POLL_MS = 1500;

interface PlaygroundRun {
  conditionId: string;
  ctHash: string;
  secret: string;
  n: number;
  t: number;
}

export function renderPlayground(host: HTMLElement): () => void {
  const client = new BteClient({ url: API_BASE });
  let run: PlaygroundRun | null = null;
  let pollTimer: number | undefined;
  let tickTimer: number | undefined;
  let condition: ConditionDetail | null = null;
  let done = false;

  host.innerHTML = `
    <div class="playground card" id="pg">
      <form id="pg-form" autocomplete="off">
        <label class="field-label" for="pg-secret">your secret</label>
        <div class="pg-row">
          <input id="pg-secret" name="secret" type="text" maxlength="200" required
                 placeholder="a bid, a vote, a prediction…" />
          <select id="pg-delay" aria-label="reveal delay">
            <option value="30">reveal in 30s</option>
            <option value="60" selected>reveal in 60s</option>
            <option value="120">reveal in 2m</option>
          </select>
          <button type="submit" class="btn btn-primary" id="pg-seal">seal it</button>
        </div>
        <p class="field-hint">encrypted in this tab with wasm. nobody can read it early, us included.</p>
        <p class="error" id="pg-error" hidden></p>
      </form>
      <div id="pg-live" hidden></div>
    </div>
  `;

  const form = host.querySelector<HTMLFormElement>('#pg-form')!;
  const input = host.querySelector<HTMLInputElement>('#pg-secret')!;
  const delaySel = host.querySelector<HTMLSelectElement>('#pg-delay')!;
  const sealBtn = host.querySelector<HTMLButtonElement>('#pg-seal')!;
  const errorEl = host.querySelector<HTMLElement>('#pg-error')!;
  const liveEl = host.querySelector<HTMLElement>('#pg-live')!;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void seal();
  });

  async function seal(): Promise<void> {
    const secret = input.value.trim();
    if (!secret) return;
    errorEl.hidden = true;
    sealBtn.disabled = true;
    sealBtn.setAttribute('aria-busy', 'true');
    sealBtn.textContent = 'sealing…';
    try {
      const committee = await client.committee();
      const conditionId = await client.condition({ in: Number(delaySel.value) });
      const { ctHash } = await client.seal(secret, conditionId);
      run = { conditionId, ctHash, secret, n: committee.n, t: committee.t };
      done = false;
      condition = null;
      form.hidden = true;
      renderLive();
      startPolling();
    } catch (err) {
      errorEl.textContent = `sealing failed. ${String(err)}. is the devnet up? try: just compose-up`;
      errorEl.hidden = false;
    } finally {
      sealBtn.disabled = false;
      sealBtn.removeAttribute('aria-busy');
      sealBtn.textContent = 'seal it';
    }
  }

  function startPolling(): void {
    stopPolling();
    pollTimer = window.setInterval(() => void poll(), POLL_MS);
    tickTimer = window.setInterval(renderLive, 1000);
    void poll();
  }

  function stopPolling(): void {
    if (pollTimer !== undefined) clearInterval(pollTimer);
    if (tickTimer !== undefined) clearInterval(tickTimer);
    pollTimer = tickTimer = undefined;
  }

  async function poll(): Promise<void> {
    if (!run || done) return;
    try {
      condition = await getCondition(run.conditionId);
    } catch {
      return; // transient; next poll retries
    }
    if (condition.status === 'revealed') {
      const reveal = await getReveal(run.conditionId).catch(() => null);
      if (reveal) {
        done = true;
        stopPolling();
        const mine = reveal.slots.find((s) => s.ct_hash === run!.ctHash);
        renderRevealed(mine != null && mine.valid);
        return;
      }
    }
    renderLive();
  }

  /** Stage line + operator share dots while waiting for the cue. */
  function renderLive(): void {
    if (!run || done) return;
    liveEl.hidden = false;
    const status = condition?.status ?? 'pending';
    const firesAt = condition?.fires_at ?? null;
    const secs = firesAt != null ? firesAt - Math.floor(Date.now() / 1000) : null;

    const batch = condition?.batches?.[0];
    const verified = batch?.verified_shares ?? 0;

    let stage: string;
    if (status === 'stalled') {
      stage = `<span class="error">stalled. fewer than ${run.t} shares arrived in time. it recovers if late shares show up.</span>`;
    } else if (status === 'frozen') {
      stage = `batch frozen. operators are posting their 48-byte shares: <strong class="num">${verified}</strong> verified, <strong class="num">${run.t}</strong> needed`;
    } else if (secs != null && secs > 0) {
      stage = `sealed. reveals in <strong class="num accent">${esc(fmtCountdown(secs))}</strong>`;
    } else {
      stage = 'cue reached. freezing the batch…';
    }

    const dots = Array.from({ length: run.n }, (_, i) => {
      const cls =
        status === 'frozen' || status === 'revealed'
          ? i < verified
            ? 'dot dot-done'
            : 'dot dot-wait'
          : 'dot';
      return `<span class="${cls}" title="operator ${i + 1}"></span>`;
    }).join('');

    liveEl.innerHTML = `
      <div class="pg-stage">
        <div class="pg-sealed-row">
          <span class="sealed-label">sealed</span>
          <button type="button" class="hash-copy mono" data-copy="${esc(run.ctHash)}"
                  title="copy ciphertext hash">${esc(truncMiddle(run.ctHash, 14, 10))}</button>
        </div>
        <p class="pg-status">${stage}</p>
        <div class="pg-operators" role="img" aria-label="${verified} of ${run.n} operator shares verified">
          ${dots}
          <span class="pg-operators-label">committee, any ${run.t} of ${run.n} reveal</span>
        </div>
        <p class="pg-links">
          <a class="link" href="#/condition/${encodeURIComponent(run.conditionId)}">watch it in the explorer</a>
        </p>
      </div>
    `;
    wireCopy(liveEl);
  }

  function renderRevealed(valid: boolean): void {
    if (!run) return;
    liveEl.innerHTML = `
      <div class="pg-stage pg-revealed reveal-in">
        <div class="pg-sealed-row">
          <span class="sealed-label sealed-label-open">revealed</span>
          <span class="mono muted">${esc(truncMiddle(run.ctHash, 14, 10))}</span>
        </div>
        <p class="pg-secret-out">${valid ? esc(run.secret) : '<span class="error">slot flagged corrupt</span>'}</p>
        <p class="muted">everyone can read it now. that is the whole trick: unreadable before the cue, public after.</p>
        <p class="pg-links">
          <a class="link" href="#/condition/${encodeURIComponent(run.conditionId)}">see the full reveal, shares and timings</a>
          <button type="button" class="btn" id="pg-again">seal another</button>
        </p>
      </div>
    `;
    liveEl.querySelector<HTMLButtonElement>('#pg-again')?.addEventListener('click', () => {
      run = null;
      liveEl.hidden = true;
      liveEl.innerHTML = '';
      form.hidden = false;
      input.value = '';
      input.focus();
    });
  }

  return () => stopPolling();
}

/** Copy-to-clipboard with a 1.5s transient "copied" state. */
export function wireCopy(scope: HTMLElement): void {
  scope.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((btn) => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = '1';
    const original = btn.innerHTML;
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy ?? '');
        btn.classList.add('copied');
        btn.textContent = 'copied';
        setTimeout(() => {
          btn.classList.remove('copied');
          btn.innerHTML = original;
        }, 1500);
      } catch {
        // clipboard unavailable (http origin): leave the hash visible
      }
    });
  });
}
