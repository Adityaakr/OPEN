// The recipient side of a shared seal: a dedicated page for ONE ciphertext.
// Before the cue: a countdown over unreadable ciphertext, plus ways to come
// back (tab title ticker, calendar, notification). After: the content.
// This is what a "seal link" opens.
import { getCondition, getReveal, type ConditionDetail } from '../api';
import {
  enableNotify,
  fmtCountdownShort,
  gcalUrl,
  icsHref,
  markSealRevealed,
  notifGranted,
  notifSupported,
  notifyReveal,
  rememberSeal,
  setTabState,
} from '../attention';
import { wireCopy } from '../playground';
import { decryptPrivate, isPrivatePayload } from '../privacy';
import { decodePayload, esc, fmtCountdown, fmtUnix, payloadBytes, truncMiddle } from '../util';

const POLL_MS = 2000;

export function renderSealView(
  root: HTMLElement,
  conditionId: string,
  ctHash: string,
  shareKey?: string,
): () => void {
  root.innerHTML = `
    <section class="seal-view">
      <p class="seal-kicker">someone sealed this for you</p>
      <div class="card seal-card">
        <div class="pg-sealed-row">
          <span class="sealed-label" id="sv-label">sealed</span>
          <span class="mono muted" title="${esc(ctHash)}">${esc(truncMiddle(ctHash, 14, 10))}</span>
        </div>
        <div id="sv-body">
          <div class="skeleton-row" style="margin-top:16px">
            <span class="skeleton" style="width:220px"></span>
          </div>
        </div>
      </div>
      <p class="seal-footnote">encrypted to a threshold committee. nobody could read it before the
      cue, the operators included. <a class="link" href="#/">seal your own</a></p>
    </section>
  `;

  const labelEl = root.querySelector<HTMLElement>('#sv-label')!;
  const bodyEl = root.querySelector<HTMLElement>('#sv-body')!;

  let condition: ConditionDetail | null = null;
  let revealed = false;
  let failed = false;
  let remembered = false;
  let renderedStatus = '';
  let pollTimer: number | undefined;
  let tickTimer: number | undefined;

  // The notify button lives inside re-renderable HTML; delegate the click.
  bodyEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('#sv-notify');
    if (!btn) return;
    void enableNotify().then((ok) => {
      btn.textContent = ok ? 'will notify you here' : 'notifications are blocked';
      btn.disabled = true;
    });
  });

  const notifyControl = (): string => {
    if (!notifSupported()) return '';
    if (notifGranted()) {
      return `<span class="muted sv-notify-on">notifies you here when it opens</span>`;
    }
    return `<button type="button" class="btn" id="sv-notify">notify me when it opens</button>`;
  };

  const pendingActions = (firesAt: number): string => {
    const url = location.href;
    return `<p class="sv-actions">
      ${notifyControl()}
      <a class="btn" download="bte-seal.ics"
         href="${esc(icsHref({ conditionId, firesAt, url }))}">add to calendar</a>
      <a class="btn" target="_blank" rel="noopener"
         href="${esc(gcalUrl({ firesAt, url }))}">google calendar</a>
    </p>
    <p class="field-hint">closing this tab is fine: the calendar event or the notification
    brings you back the moment it opens.</p>`;
  };

  const renderPending = () => {
    if (!condition || revealed || failed) return;
    if (condition.status === 'pending' && condition.fires_at != null) {
      const secs = condition.fires_at - Math.floor(Date.now() / 1000);
      if (renderedStatus !== 'pending') {
        renderedStatus = 'pending';
        bodyEl.innerHTML = `
          <p class="sv-countdown num" id="sv-cd"></p>
          <p class="muted">unlocks ${esc(fmtUnix(condition.fires_at))}. this page will open by itself.</p>
          ${pendingActions(condition.fires_at)}`;
      }
      bodyEl.querySelector('#sv-cd')!.textContent = fmtCountdown(secs);
      setTabState(secs > 0 ? `⏳ ${fmtCountdownShort(secs)}` : '⏳ opening', '🔒');
    } else if (condition.status === 'frozen') {
      renderedStatus = 'frozen';
      const batch = condition.batches?.[0];
      const verified = batch?.verified_shares ?? 0;
      bodyEl.innerHTML = `
        <p class="sv-countdown num">opening…</p>
        <p class="muted">the cue fired. committee shares: ${verified} verified.</p>`;
      setTabState('🔓 opening…', '🔓');
    } else if (condition.status === 'stalled') {
      renderedStatus = 'stalled';
      bodyEl.innerHTML = `
        <p class="error">the reveal stalled: not enough operator shares arrived yet. it completes
        automatically when they do.</p>`;
      setTabState('⏳ stalled', '🔒');
    }
  };

  const poll = async () => {
    try {
      condition = await getCondition(conditionId);
    } catch {
      failed = true;
      bodyEl.innerHTML = `<p class="error" style="margin-top:16px">this seal link does not match
        anything here. it may be for a different network, or the devnet was wiped.</p>`;
      return;
    }
    if (!remembered) {
      remembered = true;
      rememberSeal({
        conditionId,
        ctHash,
        firesAt: condition.fires_at,
        role: 'received',
        label: 'sealed for you',
        revealed: condition.status === 'revealed',
      });
    }
    renderPending();
    if (condition.status === 'revealed' && !revealed) {
      const reveal = await getReveal(conditionId).catch(() => null);
      if (!reveal) return;
      revealed = true;
      if (pollTimer !== undefined) clearInterval(pollTimer);
      if (tickTimer !== undefined) clearInterval(tickTimer);
      markSealRevealed(conditionId);
      setTabState('🔓 revealed', '🔓');
      const slot = reveal.slots.find((s) => s.ct_hash === ctHash);
      labelEl.textContent = 'revealed';
      labelEl.classList.add('sealed-label-open');
      if (!slot) {
        bodyEl.innerHTML = `<p class="error" style="margin-top:16px">this ciphertext is not part of
          that reveal. wrong link?</p>`;
        return;
      }
      if (!slot.valid) {
        bodyEl.innerHTML = `<p class="error" style="margin-top:16px">this slot was flagged corrupt at
          reveal time. the rest of the batch opened fine.</p>`;
        return;
      }
      notifyReveal('the countdown hit zero. click to read it.');
      // Private payloads carry their key only in this link's fragment.
      const bytes = payloadBytes(slot.payload_b64);
      let text: string;
      let isHex: boolean;
      if (isPrivatePayload(bytes)) {
        if (!shareKey) {
          bodyEl.innerHTML = `<p class="error" style="margin-top:16px">this seal is private. the
            content only opens with the full share link, and this one is missing its key part.
            ask the sender to resend the link.</p>`;
          return;
        }
        const plain = await decryptPrivate(bytes, shareKey);
        if (plain == null) {
          bodyEl.innerHTML = `<p class="error" style="margin-top:16px">the key in this link does not
            fit this seal. the link was probably truncated in transit. ask the sender to resend it.</p>`;
          return;
        }
        text = plain;
        isHex = false;
      } else {
        const decoded = decodePayload(slot.payload_b64);
        text = decoded.text;
        isHex = decoded.isHex;
      }
      bodyEl.innerHTML = `
        <p class="sv-content reveal-in ${isHex ? 'mono' : ''}">${esc(text)}</p>
        <p class="muted">revealed ${esc(fmtUnix(reveal.revealed_at))}, slot ${slot.position} of ${reveal.slots.length}.
          <a class="link" href="#/condition/${encodeURIComponent(conditionId)}">see the full batch,
          operator shares and timings</a></p>`;
      wireCopy(bodyEl);
    }
  };

  // Background tabs throttle timers to ~1/min; poll immediately on refocus so
  // a returning user sees the truth without waiting out the throttle.
  const onVisible = () => {
    if (!document.hidden) void poll();
  };
  document.addEventListener('visibilitychange', onVisible);

  void poll();
  pollTimer = window.setInterval(() => void poll(), POLL_MS);
  tickTimer = window.setInterval(renderPending, 1000);
  return () => {
    if (pollTimer !== undefined) clearInterval(pollTimer);
    if (tickTimer !== undefined) clearInterval(tickTimer);
    document.removeEventListener('visibilitychange', onVisible);
    setTabState(null);
  };
}
