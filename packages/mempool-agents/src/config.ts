// Shared config for the mempool agents: deployment addresses + viem clients.
//
// Addresses come from deployments/<chainId>.json (written by the deploy step).
// Keys come from the environment; for Tempo they are sourced from
// .secrets/tempo-keys.env, for local anvil from the anvil test keys.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Chain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const here = dirname(fileURLToPath(import.meta.url));

export interface Deployment {
  chainId: number;
  rpcUrl: string;
  explorerBase: string;
  usdc: Address;
  eth: Address;
  publicPool: Address;
  publicBuilder: Address;
  pealPool: Address;
  pealMempool: Address;
}

/** CHAIN_ID selects the deployment file; defaults to local anvil. */
export function loadDeployment(): Deployment {
  const chainId = process.env.CHAIN_ID ?? '31337';
  const path = join(here, '..', 'deployments', `${chainId}.json`);
  return JSON.parse(readFileSync(path, 'utf8')) as Deployment;
}

export function chainFor(d: Deployment): Chain {
  return {
    id: d.chainId,
    name: `chain-${d.chainId}`,
    nativeCurrency: { name: 'gas', symbol: 'GAS', decimals: 18 },
    rpcUrls: { default: { http: [d.rpcUrl] } },
  };
}

export function publicClient(d: Deployment) {
  return createPublicClient({ chain: chainFor(d), transport: http(d.rpcUrl) });
}

/** A wallet client for one role. `key` is a 0x-prefixed private key. */
export function walletFor(d: Deployment, key: string) {
  const account = privateKeyToAccount(key as `0x${string}`);
  return createWalletClient({ account, chain: chainFor(d), transport: http(d.rpcUrl) });
}

/** Tempo charges ~1000 gas/byte to deploy and 250k per new storage slot, and
 * its eth_estimateGas returns a standard-EVM number that under-provisions every
 * write. Set TX_GAS to a generous fixed limit there (unused gas is not charged);
 * leave it unset on chains that estimate correctly (anvil). Spread the result
 * into every writeContract. */
export const gasOverride: bigint | undefined = process.env.TX_GAS
  ? BigInt(process.env.TX_GAS)
  : undefined;

export const writeGas: { gas?: bigint } = gasOverride ? { gas: gasOverride } : {};

export function requireKey(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name} (source it from .secrets/tempo-keys.env)`);
  return v.startsWith('0x') ? v : `0x${v}`;
}

/** Wait for a receipt but never hang forever: Tempo's testnet mempool can stall
 * a transaction, and an unbounded wait would wedge the whole service behind it.
 * Rejects after `timeoutMs` so the caller can surface an error and move on. */
export async function waitReceipt(
  pub: ReturnType<typeof publicClient>,
  hash: `0x${string}`,
  timeoutMs = 60_000,
): Promise<void> {
  await pub.waitForTransactionReceipt({ hash, timeout: timeoutMs });
}

/** Serialize writes from one key: two transactions fetched the same nonce
 * concurrently get one rejected as "nonce too low". Returns a run() that
 * chains calls so only one is in flight at a time. */
export function serializer(): <T>(fn: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const run = tail.then(fn, fn);
    tail = run.then(
      () => {},
      () => {},
    );
    return run as Promise<T>;
  };
}
