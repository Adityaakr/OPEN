// Independent verification of a revealed batch.
//
// The rule this file exists to enforce: a check that reads its expected value
// from the coordinator proves nothing. Recomputing the merkle root from the
// coordinator's plaintexts and comparing it to the coordinator's own published
// root only shows that one JSON blob is internally consistent. A coordinator
// that wanted to lie would publish tampered plaintexts and the matching root,
// and that check would go green.
//
// So every claim below is anchored to something the coordinator cannot retract:
// the chain (read straight from the public RPC, not through our relayer), the
// ciphertext bytes themselves, or a pairing equation. Where a claim CANNOT be
// anchored, we say so instead of quietly passing.
import type { CommitteeDetail, Reveal, RevealSlot } from './api';
import type { MempoolConfig } from './mempool/chain';
import { recomputeMerkleRoot, normalizeHex } from './merkle';
import { payloadBytes } from './util';

/** Dummy payloads are literally prefixed with this (bte-crypto dummy_payload). */
const DUMMY_PREFIX = 'BTE_DUMMY_V0:';

// cast sig "settledRoot(bytes32)"
const SEL_SETTLED_ROOT = '0x08afcebd';
// cast keccak "Sealed(bytes32,bytes32,address)"
const TOPIC_SEALED = '0x86be95f3b52fdb930db9e9d10e27c3524cc831a4d3b377693e6b0ebc8c1b4d23';
// cast keccak "BatchExecuted(bytes32,bytes32,uint256)"
const TOPIC_BATCH_EXECUTED = '0xe24d0a2c61ac81c2a105d160b44f0d4854b5e899809bed5d307285d03a2dfeec';

/** The RPC rejects eth_getLogs spans over 100k blocks. Every condition the demo
 * settles is minutes old, so a trailing window is plenty. */
const LOG_WINDOW = 90_000n;

const ZERO32 = `0x${'0'.repeat(64)}`;

export type CheckStatus = 'pass' | 'fail' | 'skip';

/** Where a check's expected value comes from. 'chain' is the only source the
 * coordinator cannot forge after the fact; the UI grades them differently. */
export type Anchor = 'chain' | 'crypto' | 'local' | 'none';

export interface Check {
  id: string;
  /** What this proves, in the user's words. */
  label: string;
  status: CheckStatus;
  anchor: Anchor;
  detail: string;
}

export interface SealedCommit {
  txHash: string;
  blockNumber: number;
}

export interface VerifyReport {
  checks: Check[];
  /** ct hash -> the on-chain commit that carried it, for per-slot links. */
  sealedCommits: Map<string, SealedCommit>;
  /** The executeBatch tx that settled this condition, if any. */
  settleTx: string | null;
  onchainRoot: string | null;
  recomputedRoot: string;
}

// ---- raw JSON-RPC (no chain library, no relayer) -------------------------

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const body = (await res.json()) as { result?: T; error?: { message: string } };
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result as T;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Condition ids are strings offchain, sha256(utf8(id)) onchain. */
async function conditionIdToBytes32(id: string): Promise<string> {
  return `0x${await sha256Hex(new TextEncoder().encode(id))}`;
}

// ---- the checks ----------------------------------------------------------

/** Each slot's ct hash, recomputed from the sealed bytes the coordinator served.
 * sha256 over the BTE_WIRE_V0 blob is exactly how the coordinator derives it, so
 * a mismatch means the bytes and the hash do not belong together. */
async function checkCtHashes(slots: RevealSlot[]): Promise<Check> {
  const withBytes = slots.filter((s) => s.sealed_b64);
  if (withBytes.length === 0) {
    return {
      id: 'ct-hash',
      label: 'every ct hash is derived from its ciphertext',
      status: 'skip',
      anchor: 'none',
      detail:
        'this coordinator did not serve the sealed ciphertexts, so the ct hashes cannot be re-derived here. they remain its unverified claim.',
    };
  }
  const bad: number[] = [];
  for (const s of withBytes) {
    const got = await sha256Hex(payloadBytes(s.sealed_b64!));
    if (normalizeHex(got) !== normalizeHex(s.ct_hash)) bad.push(s.position);
  }
  return {
    id: 'ct-hash',
    label: 'every ct hash is derived from its ciphertext',
    status: bad.length === 0 ? 'pass' : 'fail',
    anchor: 'crypto',
    detail:
      bad.length === 0
        ? `re-hashed all ${withBytes.length} sealed ciphertexts. each sha256 equals the ct hash shown in the table, so the "before" column is derived from real bytes, not asserted.`
        : `slots ${bad.join(', ')} carry a ct hash that is not the sha256 of the ciphertext served for them.`,
  };
}

/** The ct hashes that were committed on-chain BEFORE the reveal, read from the
 * Sealed logs. This is the one check that catches censorship: a real order whose
 * hash is on-chain but which the reveal dropped or relabelled as padding. */
function checkSealedOnChain(
  slots: RevealSlot[],
  cfg: MempoolConfig,
  commits: Map<string, SealedCommit>,
): Check {
  if (commits.size === 0) {
    return {
      id: 'sealed-onchain',
      label: 'each sealed order was committed on-chain before the reveal',
      status: 'skip',
      anchor: 'none',
      detail:
        'no Sealed log for this condition. it was never committed on-chain, so there is nothing to hold the reveal against. only conditions from the mempool demo are anchored.',
    };
  }
  const revealed = new Set(slots.map((s) => normalizeHex(s.ct_hash)));
  const missing = [...commits.keys()].filter((h) => !revealed.has(h));
  const dropped = [...commits.keys()].filter((h) => {
    const slot = slots.find((s) => normalizeHex(s.ct_hash) === h);
    return slot?.is_dummy === true;
  });
  const bad = missing.length + dropped.length;
  const link = `${cfg.explorerBase.replace(/\/$/, '')}/address/${cfg.pealMempool}`;
  return {
    id: 'sealed-onchain',
    label: 'each sealed order was committed on-chain before the reveal',
    status: bad === 0 ? 'pass' : 'fail',
    anchor: 'chain',
    detail:
      bad === 0
        ? `read ${commits.size} Sealed log${commits.size === 1 ? '' : 's'} from <a class="link" href="${link}" target="_blank" rel="noopener">PealMempool</a> on chain ${cfg.chainId}. every hash committed before the cue appears as a real slot in this reveal, so nothing was dropped or buried in the padding.`
        : `${missing.length} ct hash(es) committed on-chain are absent from this reveal and ${dropped.length} were relabelled as padding. that is censorship: the order was sealed but never opened.`,
  };
}

/** The merkle root the CHAIN settled, vs the root we recompute from the
 * plaintexts. The contract recomputes the tree itself in executeBatch and
 * reverts on mismatch, so a root in settledRoot is one the chain already
 * checked against the calldata it executed. */
function checkOnchainRoot(
  recomputed: string,
  onchainRoot: string | null,
  cfg: MempoolConfig,
): Check {
  if (!onchainRoot || onchainRoot === ZERO32) {
    return {
      id: 'onchain-root',
      label: 'the chain settled this exact set of plaintexts',
      status: 'skip',
      anchor: 'none',
      detail:
        'PealMempool.settledRoot is empty for this condition: it was never settled on-chain. the root below is the coordinator\'s claim and nothing independent backs it.',
    };
  }
  const ok = normalizeHex(onchainRoot) === normalizeHex(recomputed);
  const link = `${cfg.explorerBase.replace(/\/$/, '')}/address/${cfg.pealMempool}`;
  return {
    id: 'onchain-root',
    label: 'the chain settled this exact set of plaintexts',
    status: ok ? 'pass' : 'fail',
    anchor: 'chain',
    detail: ok
      ? `the root rebuilt in this browser from the plaintexts equals <a class="link" href="${link}" target="_blank" rel="noopener">settledRoot</a> read from the contract. the coordinator cannot change a plaintext now without breaking a root the chain already fixed.`
      : `the root rebuilt from these plaintexts does not match the one the chain settled. the reveal shown here is not what was executed.`,
  };
}

/** Padding must actually be padding. The merkle leaf covers only (position,
 * payload), NOT the is_dummy flag, so the root alone cannot stop the coordinator
 * from calling a real order padding. The dummy payload's literal prefix can. */
function checkPadding(slots: RevealSlot[]): Check {
  const liars = slots.filter((s) => {
    if (!s.valid) return false;
    const text = new TextDecoder().decode(payloadBytes(s.payload_b64).slice(0, DUMMY_PREFIX.length));
    return s.is_dummy !== (text === DUMMY_PREFIX);
  });
  const dummies = slots.filter((s) => s.is_dummy).length;
  return {
    id: 'padding',
    label: 'the padding is real padding, not a hidden order',
    status: liars.length === 0 ? 'pass' : 'fail',
    anchor: 'local',
    detail:
      liars.length === 0
        ? `all ${dummies} padding slots carry the ${DUMMY_PREFIX} marker and no real slot does. the plaintexts are fixed by the root above, so this cannot be edited after the fact.`
        : `slot(s) ${liars.map((s) => s.position).join(', ')} are labelled inconsistently with their payload. a real order may be hiding in the padding.`,
  };
}

/** Positions are a pure function of the ct hash set: real ciphertexts sorted
 * ascending by hash, padding appended. Nobody gets to pick their slot, so
 * nobody gets to buy priority. */
function checkOrdering(slots: RevealSlot[]): Check {
  const ordered = [...slots].sort((a, b) => a.position - b.position);
  const real = ordered.filter((s) => !s.is_dummy);
  const contiguous = real.every((s, i) => s.position === i);
  const sorted = real.every(
    (s, i) => i === 0 || normalizeHex(real[i - 1].ct_hash) <= normalizeHex(s.ct_hash),
  );
  const ok = contiguous && sorted;
  return {
    id: 'ordering',
    label: 'slot order was fixed by the ciphertext hashes, not chosen',
    status: ok ? 'pass' : 'fail',
    anchor: 'local',
    detail: ok
      ? `the ${real.length} real seal${real.length === 1 ? '' : 's'} occupy the first slots in ascending ct-hash order, padding fills the tail. the order is a function of hashes nobody could steer, so there is no priority to sell.`
      : 'the real slots are not in ascending ct-hash order. someone chose this ordering.',
  };
}

/** The only cryptographic proof that the committee actually did the work: run
 * each operator's share through the same pairing equation the coordinator ran.
 * Catches a coordinator that fabricated a reveal without a real t-of-n quorum,
 * and one that marked a bad share "verified". */
async function checkShares(r: Reveal, committee: CommitteeDetail | null): Promise<Check> {
  const headers = new Map(r.batches.map((b) => [b.batch_id, b.headers_b64]));
  const usable = r.shares.filter((s) => s.share_b64 && headers.get(s.batch_id));
  if (!committee?.params_b64 || usable.length === 0) {
    return {
      id: 'shares',
      label: 'a real quorum of operators opened this batch',
      status: 'skip',
      anchor: 'none',
      detail:
        'this coordinator did not serve the share bytes, so the pairing check cannot be rerun here. the "verified" marks below are its own claim.',
    };
  }
  const { verifyShare } = await import('bte-sdk/verify');
  let good = 0;
  const disputed: number[] = [];
  for (const s of usable) {
    let ok = false;
    try {
      ok = await verifyShare(committee.params_b64, headers.get(s.batch_id)!, s.share_b64!);
    } catch {
      ok = false;
    }
    if (ok) good++;
    if (ok !== s.verified) disputed.push(s.operator_id);
  }
  const t = committee.t;
  const enough = good >= t;
  const honest = disputed.length === 0;
  return {
    id: 'shares',
    label: 'a real quorum of operators opened this batch',
    status: enough && honest ? 'pass' : 'fail',
    anchor: 'crypto',
    detail:
      enough && honest
        ? `re-ran the pairing check on all ${usable.length} shares against the batch headers. ${good} of them are valid, and ${t} are needed. the committee really did the decryption: these shares cannot be forged without the operators' key shares.`
        : !enough
          ? `only ${good} shares pass the pairing check, but ${t} are needed. this reveal could not have come from an honest quorum.`
          : `operator(s) ${disputed.join(', ')} are marked differently by the coordinator than the pairing check says. it is lying about who verified.`,
  };
}

// ---- driver --------------------------------------------------------------

/** Read the chain directly (never through the relayer) for the two facts that
 * anchor everything else: the settled root, and the pre-reveal Sealed commits. */
async function readChain(
  conditionId: string,
  cfg: MempoolConfig,
): Promise<{ onchainRoot: string | null; commits: Map<string, SealedCommit>; settleTx: string | null }> {
  const cond32 = await conditionIdToBytes32(conditionId);
  const commits = new Map<string, SealedCommit>();
  let onchainRoot: string | null = null;
  let settleTx: string | null = null;

  const latest = BigInt(await rpc<string>(cfg.rpcUrl, 'eth_blockNumber', []));
  const from = `0x${(latest > LOG_WINDOW ? latest - LOG_WINDOW : 0n).toString(16)}`;

  const [root, sealedLogs, batchLogs] = await Promise.all([
    rpc<string>(cfg.rpcUrl, 'eth_call', [
      { to: cfg.pealMempool, data: `${SEL_SETTLED_ROOT}${cond32.slice(2)}` },
      'latest',
    ]),
    rpc<{ topics: string[]; transactionHash: string; blockNumber: string }[]>(
      cfg.rpcUrl,
      'eth_getLogs',
      [{ address: cfg.pealMempool, topics: [TOPIC_SEALED, cond32], fromBlock: from }],
    ),
    rpc<{ transactionHash: string }[]>(cfg.rpcUrl, 'eth_getLogs', [
      { address: cfg.pealMempool, topics: [TOPIC_BATCH_EXECUTED, cond32], fromBlock: from },
    ]),
  ]);

  onchainRoot = root;
  for (const log of sealedLogs) {
    // Sealed(conditionId, ctHash, from): all three indexed, so ctHash is topic2.
    commits.set(normalizeHex(log.topics[2]), {
      txHash: log.transactionHash,
      blockNumber: Number(BigInt(log.blockNumber)),
    });
  }
  if (batchLogs.length > 0) settleTx = batchLogs[0].transactionHash;
  return { onchainRoot, commits, settleTx };
}

/** Run every check we can, in parallel where possible. Never throws: a chain
 * that cannot be reached downgrades the on-chain checks to 'skip' rather than
 * silently passing them. */
export async function verifyReveal(
  r: Reveal,
  cfg: MempoolConfig | null,
  committee: CommitteeDetail | null,
): Promise<VerifyReport> {
  const recomputedRoot = await recomputeMerkleRoot(r.slots);

  let onchainRoot: string | null = null;
  let commits = new Map<string, SealedCommit>();
  let settleTx: string | null = null;
  let chainError: string | null = null;

  if (cfg?.rpcUrl && cfg.pealMempool) {
    try {
      const read = await readChain(r.condition_id, cfg);
      onchainRoot = read.onchainRoot;
      commits = read.commits;
      settleTx = read.settleTx;
    } catch (e) {
      chainError = e instanceof Error ? e.message : String(e);
    }
  } else {
    chainError = 'no chain endpoint is configured for this explorer.';
  }

  const checks: Check[] = [];

  if (chainError) {
    const detail = `could not read the chain (${chainError}), so the on-chain anchors could not be checked. nothing below is being taken on the coordinator's word instead.`;
    checks.push(
      { id: 'onchain-root', label: 'the chain settled this exact set of plaintexts', status: 'skip', anchor: 'none', detail },
      { id: 'sealed-onchain', label: 'each sealed order was committed on-chain before the reveal', status: 'skip', anchor: 'none', detail },
    );
  } else {
    checks.push(checkOnchainRoot(recomputedRoot, onchainRoot, cfg!));
    checks.push(checkSealedOnChain(r.slots, cfg!, commits));
  }

  checks.push(await checkCtHashes(r.slots));
  checks.push(await checkShares(r, committee));
  checks.push(checkPadding(r.slots));
  checks.push(checkOrdering(r.slots));

  return { checks, sealedCommits: commits, settleTx, onchainRoot, recomputedRoot };
}
