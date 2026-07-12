// Recompute the batch merkle root in the browser from the revealed plaintexts,
// matching the coordinator's crates/bte-coordinator/src/merkle.rs exactly:
//   leaf   = sha256(position_le_u32 || payload)
//   parent = sha256(left || right)   (an odd node is promoted unchanged)
//   empty  = sha256("")
// so anyone can catch a tampered reveal without trusting the coordinator: the
// root is derived only from the public plaintexts and the fixed slot positions.
import { payloadBytes } from './util';

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return new Uint8Array(digest);
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function leafHash(position: number, payload: Uint8Array): Promise<Uint8Array> {
  const pos = new Uint8Array(4);
  new DataView(pos.buffer).setUint32(0, position >>> 0, true); // little-endian u32
  return sha256(concat(pos, payload));
}

/** Strip an optional 0x and lowercase, so two hex strings compare cleanly. */
export function normalizeHex(h: string): string {
  return h.replace(/^0x/i, '').toLowerCase();
}

/** Recompute the merkle root (lowercase hex, no 0x) over every slot's revealed
 * payload, in position order. Mirrors merkle.rs so a match proves the reveal
 * matches its committed root. */
export async function recomputeMerkleRoot(
  slots: { position: number; payload_b64: string }[],
): Promise<string> {
  const ordered = [...slots].sort((a, b) => a.position - b.position);
  if (ordered.length === 0) return toHex(await sha256(new Uint8Array(0)));
  let level = await Promise.all(
    ordered.map((s) => leafHash(s.position, payloadBytes(s.payload_b64))),
  );
  while (level.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(i + 1 < level.length ? await sha256(concat(level[i], level[i + 1])) : level[i]);
    }
    level = next;
  }
  return toHex(level[0]);
}
