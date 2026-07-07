import {
  getCommittee,
  getCondition,
  getReveal,
  type Batch,
  type ConditionDetail,
  type Reveal,
} from '../api';
import { wireCopy } from '../playground';
import { isPrivatePayload } from '../privacy';
import {
  decodePayload,
  esc,
  fmtCountdown,
  fmtUnix,
  payloadBytes,
  statusChip,
  truncMiddle,
} from '../util';

const POLL_MS = 2000;

export function renderCondition(root: HTMLElement, id: string): () => void {
  root.innerHTML = `
    <p class="backlink-row"><a class="link" href="#/">&larr; all conditions</a></p>
    <section class="section">
      <h1>condition
        <button type="button" class="hash-copy mono" data-copy="${esc(id)}" title="copy condition id">${esc(
          truncMiddle(id, 14, 6),
        )}</button>
      </h1>
      <div id="meta" class="card">
        <div class="skeleton-row">
          <span class="skeleton" style="width:80px"></span>
          <span class="skeleton" style="width:140px"></span>
          <span class="skeleton" style="width:110px"></span>
        </div>
      </div>
      <div id="stage"></div>
    </section>
    <div id="reveal"></div>
  `;
  wireCopy(root);

  const metaEl = root.querySelector<HTMLElement>('#meta')!;
  const stageEl = root.querySelector<HTMLElement>('#stage')!;
  const revealEl = root.querySelector<HTMLElement>('#reveal')!;

  let condition: ConditionDetail | null = null;
  let committee: { n: number; t: number } | null = null;
  let revealed = false;
  let pollTimer: number | undefined;
  let tickTimer: number | undefined;

  void getCommittee()
    .then((c) => {
      committee = { n: c.n, t: c.t };
      renderStage();
    })
    .catch(() => {});

  /** Countdown or live share progress, depending on status. */
  const renderStage = () => {
    if (!condition || revealed) {
      stageEl.innerHTML = '';
      return;
    }
    if (condition.status === 'pending' && condition.fires_at != null) {
      const secs = condition.fires_at - Math.floor(Date.now() / 1000);
      stageEl.innerHTML = `
        <div class="stage-panel">
          <p class="stage-line">sealed board is dark. reveals in
            <span class="countdown-big num">${esc(fmtCountdown(secs))}</span></p>
        </div>`;
      return;
    }
    if (condition.status === 'frozen' || condition.status === 'stalled') {
      const t = committee?.t ?? 3;
      const n = committee?.n ?? 5;
      const verified = Math.max(0, ...condition.batches.map((b) => b.verified_shares ?? 0));
      const dots = Array.from({ length: n }, (_, i) =>
        i < verified
          ? '<span class="dot dot-done"></span>'
          : '<span class="dot dot-wait"></span>',
      ).join('');
      const stalledNote =
        condition.status === 'stalled'
          ? `<p class="error">stalled. fewer than ${t} verified shares arrived before the timeout. a late share still completes it.</p>`
          : '';
      stageEl.innerHTML = `
        <div class="stage-panel">
          <p class="stage-line">batch frozen. operator shares:
            <strong class="num">${verified}</strong> verified, <strong class="num">${t}</strong> needed</p>
          <div class="pg-operators">${dots}<span class="pg-operators-label">any ${t} of ${n} recover everything</span></div>
          ${stalledNote}
        </div>`;
    }
  };

  const poll = async () => {
    try {
      condition = await getCondition(id);
    } catch (e) {
      metaEl.innerHTML = `<p class="error">could not load this condition (${esc(String(e))}). <a class="link" href="#/">back to the list</a></p>`;
      return;
    }
    metaEl.innerHTML = metaCard(condition);
    renderStage();

    if (condition.status === 'revealed' && !revealed) {
      const reveal = await getReveal(id).catch(() => null);
      if (reveal) {
        revealed = true;
        renderStage();
        revealEl.innerHTML = revealSection(reveal, condition);
        wireCopy(revealEl);
        wireDummyToggle(revealEl);
        if (pollTimer !== undefined) clearInterval(pollTimer);
        if (tickTimer !== undefined) clearInterval(tickTimer);
      }
    } else if (!revealed) {
      revealEl.innerHTML = `<section class="section"><p class="muted">nothing to show yet. plaintexts appear here the moment the reveal lands.</p></section>`;
    }
  };

  void poll();
  pollTimer = window.setInterval(() => void poll(), POLL_MS);
  tickTimer = window.setInterval(renderStage, 1000);

  return () => {
    if (pollTimer !== undefined) clearInterval(pollTimer);
    if (tickTimer !== undefined) clearInterval(tickTimer);
  };
}

function wireDummyToggle(scope: HTMLElement): void {
  const btn = scope.querySelector<HTMLButtonElement>('.dummy-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!expanded));
    const count = scope.querySelectorAll('.dummy-hidden, .dummy-shown').length;
    scope.querySelectorAll('.dummy-hidden, .dummy-shown').forEach((row) => {
      row.classList.toggle('dummy-hidden', expanded);
      row.classList.toggle('dummy-shown', !expanded);
    });
    btn.textContent = expanded
      ? `show ${count} dummy padding slots`
      : `hide ${count} dummy padding slots`;
  });
}

function metaCard(c: ConditionDetail): string {
  const fires =
    c.fires_at != null
      ? esc(fmtUnix(c.fires_at))
      : c.height != null
        ? `block ${c.height} on chain ${c.chain_id}`
        : '<span class="muted">unknown</span>';
  return `
    <dl class="stats">
      <div><dt>status</dt><dd>${statusChip(c.status)}</dd></div>
      <div><dt>kind</dt><dd>${esc(c.kind)}</dd></div>
      <div><dt>fires at</dt><dd>${fires}</dd></div>
      <div><dt>sealed</dt><dd class="num">${c.real_count}<span class="muted"> real / ${c.ciphertext_count} total</span></dd></div>
      <div><dt>created</dt><dd>${esc(fmtUnix(c.created_at))}</dd></div>
    </dl>
  `;
}

function revealSection(r: Reveal, c: ConditionDetail): string {
  const real = r.slots.filter((s) => !s.is_dummy).length;
  const finalizeMs = Math.max(0, ...r.batches.map((b) => b.finalize_ms ?? 0));
  return `
    <section class="section reveal-in">
      <h2>revealed</h2>
      <div class="card reveal-card">
        <dl class="stats">
          <div><dt>opened</dt><dd>${esc(fmtUnix(r.revealed_at))}</dd></div>
          <div><dt>real seals</dt><dd class="num">${real}<span class="muted"> of ${r.slots.length} slots</span></dd></div>
          <div><dt>reveal took</dt><dd class="num">${finalizeMs} ms</dd></div>
          <div><dt>merkle root</dt><dd>
            <button type="button" class="hash-copy mono" data-copy="${esc(r.merkle_root)}"
                    title="copy merkle root">${esc(truncMiddle(r.merkle_root, 12, 10))}</button>
          </dd></div>
        </dl>
        <p class="trust-note">the merkle root commits to every slot below. anyone can recompute it
        from the plaintexts and catch a tampered reveal.</p>
        ${slotGrid(r)}
      </div>
      ${boardTable(r)}
    </section>
    <section class="section reveal-in">
      <h2>operator shares</h2>
      ${shareTable(r)}
    </section>
    <section class="section reveal-in">
      <h2>batch timings</h2>
      <p class="muted">the pre-decrypt work ran while shares were still in flight, so the
      reveal only had to wait for finalize.</p>
      ${timingBars(r.batches.length ? r.batches : c.batches)}
    </section>
  `;
}

/** The whole batch at a glance: one cell per slot, real seals pop out of the
 * dummy padding, corrupt slots go red, private ones carry a lock. */
function slotGrid(r: Reveal): string {
  const cells = r.slots
    .map((s) => {
      const priv = !s.is_dummy && s.valid && isPrivatePayload(payloadBytes(s.payload_b64));
      const cls = !s.valid
        ? 'slot-cell slot-corrupt'
        : s.is_dummy
          ? 'slot-cell slot-dummy'
          : priv
            ? 'slot-cell slot-real slot-private'
            : 'slot-cell slot-real';
      const what = !s.valid ? 'corrupt' : s.is_dummy ? 'dummy padding' : priv ? 'private seal' : 'revealed seal';
      return `<span class="${cls}" title="slot ${s.position}: ${what}"></span>`;
    })
    .join('');
  return `
    <div class="slot-grid" role="img" aria-label="batch of ${r.slots.length} slots">${cells}</div>
    <p class="slot-legend muted">
      <span class="slot-cell slot-real"></span> revealed
      <span class="slot-cell slot-real slot-private"></span> private
      <span class="slot-cell slot-dummy"></span> dummy padding
    </p>`;
}

function slotRow(s: Reveal['slots'][number], stagger: number, hidden: boolean): string {
  const tags: string[] = [];
  const priv = !s.is_dummy && s.valid && isPrivatePayload(payloadBytes(s.payload_b64));
  if (s.is_dummy) tags.push('<span class="tag tag-dummy">dummy</span>');
  if (!s.valid) tags.push('<span class="tag tag-corrupt">corrupt</span>');
  if (priv) tags.push('<span class="tag tag-private">private</span>');
  const decoded = decodePayload(s.payload_b64);
  const payload = !s.valid
    ? '<span class="muted">unrecoverable</span>'
    : s.is_dummy
      ? '<span class="muted">dummy padding</span>'
      : priv
        ? '<span class="muted">🔒 opens only with its share link</span>'
        : `<span class="${decoded.isHex ? 'mono' : 'payload-text'}">${esc(decoded.text)}</span>`;
  return `<tr class="${s.is_dummy ? 'dummy-row' : ''} board-row${hidden ? ' dummy-hidden' : ''}" style="--stagger:${stagger}ms">
    <td class="num">${s.position}</td>
    <td><span class="mono" title="${esc(s.ct_hash)}">${esc(truncMiddle(s.ct_hash, 12, 10))}</span></td>
    <td>${payload} ${tags.join(' ')}</td>
  </tr>`;
}

/** Real (and corrupt) slots up front; healthy dummy padding collapses into
 * one expandable line so one real secret is not buried under 63 filler rows. */
function boardTable(r: Reveal): string {
  const interesting = r.slots.filter((s) => !s.is_dummy || !s.valid);
  const padding = r.slots.filter((s) => s.is_dummy && s.valid);

  const shown = interesting
    .map((s, i) => slotRow(s, Math.min(i, 12) * 18, false))
    .join('');
  const collapsed = padding.map((s) => slotRow(s, 0, true)).join('');
  const toggle =
    padding.length > 0
      ? `<tr class="dummy-toggle-row"><td colspan="3">
           <button type="button" class="dummy-toggle link" aria-expanded="false">
             show ${padding.length} dummy padding slots</button>
           <span class="muted">batches are fixed at ${r.slots.length} slots, so the
           coordinator pads the rest with self-sealed dummies. they carry nothing.</span>
         </td></tr>`
      : '';
  return `<div class="table-wrap"><table>
    <thead><tr><th>slot</th><th>before, sealed (ct hash)</th><th>after, revealed</th></tr></thead>
    <tbody>${shown}${toggle}${collapsed}</tbody>
  </table></div>`;
}

function shareTable(r: Reveal): string {
  if (r.shares.length === 0) return '<p class="muted">no shares recorded.</p>';
  const first = Math.min(...r.shares.map((s) => s.submitted_at_ms));
  const rows = r.shares
    .map(
      (s) => `<tr class="${s.verified ? '' : 'share-rejected'}">
        <td>operator ${s.operator_id}</td>
        <td class="num">+${s.submitted_at_ms - first} ms</td>
        <td>${s.verified ? '<span class="ok">verified</span>' : '<strong>rejected</strong>'}</td>
      </tr>`,
    )
    .join('');
  return `<div class="table-wrap"><table>
    <thead><tr><th>operator</th><th>submitted</th><th>pairing check</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

/** Proportional bars: pre-decrypt (pipelined away) vs finalize (user-felt). */
function timingBars(batches: Batch[]): string {
  if (batches.length === 0) return '<p class="muted">no batch timings recorded.</p>';
  const max = Math.max(1, ...batches.map((b) => Math.max(b.predecrypt_ms ?? 0, b.finalize_ms ?? 0)));
  return batches
    .map((b) => {
      const pre = b.predecrypt_ms ?? 0;
      const fin = b.finalize_ms ?? 0;
      return `
      <div class="timing">
        <div class="timing-row">
          <span class="timing-label">pre-decrypt (pipelined)</span>
          <div class="timing-track"><div class="timing-bar timing-bar-pre" style="width:${Math.max(2, (pre / max) * 100)}%"></div></div>
          <span class="num timing-ms">${pre} ms</span>
        </div>
        <div class="timing-row">
          <span class="timing-label">finalize</span>
          <div class="timing-track"><div class="timing-bar timing-bar-fin" style="width:${Math.max(2, (fin / max) * 100)}%"></div></div>
          <span class="num timing-ms">${fin} ms</span>
        </div>
      </div>`;
    })
    .join('');
}
