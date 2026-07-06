import { getCommittee, listConditions, type ConditionSummary } from '../api';
import { renderPlayground } from '../playground';
import { esc, fmtRelative, statusChip, truncMiddle } from '../util';

const POLL_MS = 2000;

export function renderHome(root: HTMLElement): () => void {
  root.innerHTML = `
    <section class="hero">
      <h1 class="hero-title">seal now. reveal on cue.</h1>
      <p class="hero-sub">encrypt anything to this committee. when the cue fires, the whole
      batch becomes public at once. nothing is readable early, not even by the operators.</p>
      <div id="playground"></div>
    </section>
    <section class="section">
      <h2>committee</h2>
      <div id="committee" class="card">
        <div class="skeleton-row">
          <span class="skeleton" style="width:72px"></span>
          <span class="skeleton" style="width:96px"></span>
          <span class="skeleton" style="width:80px"></span>
          <span class="skeleton" style="width:180px"></span>
        </div>
      </div>
    </section>
    <section class="section">
      <h2>conditions</h2>
      <div id="conditions" class="table-wrap">
        <div class="skeleton-row">
          <span class="skeleton" style="width:100%"></span>
        </div>
      </div>
    </section>
  `;

  const cleanupPlayground = renderPlayground(root.querySelector<HTMLElement>('#playground')!);
  const committeeEl = root.querySelector<HTMLElement>('#committee')!;
  const conditionsEl = root.querySelector<HTMLElement>('#conditions')!;

  void loadCommittee(committeeEl);

  let lastRendered = '';
  const poll = async () => {
    try {
      const conditions = await listConditions();
      const html = conditionsTable(conditions);
      if (html !== lastRendered) {
        conditionsEl.innerHTML = html;
        lastRendered = html;
      }
    } catch (e) {
      if (!lastRendered) {
        conditionsEl.innerHTML = `<p class="error">could not reach the coordinator (${esc(String(e))}). start it with <span class="mono">just compose-up</span>, then reload.</p>`;
      }
    }
  };
  void poll();
  const timer = setInterval(() => void poll(), POLL_MS);
  return () => {
    clearInterval(timer);
    cleanupPlayground();
  };
}

async function loadCommittee(committeeEl: HTMLElement): Promise<void> {
  try {
    const c = await getCommittee();
    const roster = Array.from(
      { length: c.n },
      (_, i) => `<span class="operator">operator ${i + 1}</span>`,
    ).join('');
    committeeEl.innerHTML = `
      <dl class="stats">
        <div><dt>operators</dt><dd class="num">${c.n}</dd></div>
        <div><dt>threshold</dt><dd class="num">${c.t} of ${c.n}</dd></div>
        <div><dt>batch size</dt><dd class="num">${c.b}</dd></div>
        <div><dt>params digest</dt><dd>
          <button type="button" class="hash-copy mono" data-copy="${esc(c.params_digest)}"
                  title="copy params digest">${esc(truncMiddle(c.params_digest, 12, 10))}</button>
        </dd></div>
      </dl>
      <div class="roster">${roster}</div>
      <p class="trust-note">${esc(c.trust_model)}</p>
    `;
    import('../playground').then(({ wireCopy }) => wireCopy(committeeEl));
  } catch (e) {
    committeeEl.innerHTML = `<p class="error">could not load the committee (${esc(String(e))}). is a committee registered?</p>`;
  }
}

function conditionsTable(conditions: ConditionSummary[]): string {
  if (conditions.length === 0) {
    return '<p class="muted">no conditions yet. seal something above to create the first one.</p>';
  }
  const rows = conditions
    .map((c) => {
      const fires =
        c.fires_at != null ? esc(fmtRelative(c.fires_at)) : '<span class="muted">at block</span>';
      return `<tr>
        <td><a class="mono link" href="#/condition/${encodeURIComponent(c.id)}">${esc(truncMiddle(c.id, 14, 6))}</a></td>
        <td>${statusChip(c.status)}</td>
        <td>${fires}</td>
        <td class="num">${c.real_count}<span class="muted"> / ${c.ciphertext_count}</span></td>
        <td class="muted">${esc(fmtRelative(c.created_at))}</td>
      </tr>`;
    })
    .join('');
  return `<table>
    <thead><tr>
      <th>condition</th><th>status</th><th>fires</th>
      <th>sealed</th><th>created</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}
