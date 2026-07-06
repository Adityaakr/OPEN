/** Small formatting helpers shared by pages. */

export function esc(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Truncate a long hash in the middle, keeping head and tail. */
export function truncMiddle(s: string, head = 10, tail = 8): string {
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

export function fmtUnix(sec: number): string {
  return new Date(sec * 1000).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** "in 42s", "3m ago", falling back to the absolute date past a day. */
export function fmtRelative(sec: number): string {
  const delta = sec - Math.floor(Date.now() / 1000);
  const abs = Math.abs(delta);
  if (abs >= 86400) return fmtUnix(sec);
  const unit =
    abs >= 3600 ? `${Math.floor(abs / 3600)}h ${Math.floor((abs % 3600) / 60)}m` : abs >= 60 ? `${Math.floor(abs / 60)}m` : `${abs}s`;
  return delta >= 0 ? `in ${unit}` : `${unit} ago`;
}

export function statusChip(status: string): string {
  return `<span class="chip chip-${esc(status)}">${esc(status)}</span>`;
}

export function fmtCountdown(secs: number): string {
  if (secs <= 0) return 'firing now';
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (d > 0 || h > 0) parts.push(`${h}h`);
  if (d > 0 || h > 0 || m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

/** Decode a base64 payload to UTF-8 text where possible, else hex. */
export function decodePayload(b64: string): { text: string; isHex: boolean } {
  let bytes: Uint8Array;
  try {
    const bin = atob(b64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch {
    return { text: b64, isHex: true };
  }
  if (bytes.length === 0) return { text: '(empty)', isHex: true };
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    // Control characters (other than tab and newline) read as binary.
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw new Error('binary');
    return { text, isHex: false };
  } catch {
    let hex = '';
    for (const b of bytes) hex += b.toString(16).padStart(2, '0');
    return { text: hex, isHex: true };
  }
}
