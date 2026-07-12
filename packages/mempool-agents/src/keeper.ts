// The keeper: keeps the demo pools near $3,000/ETH so repeated swaps stay
// legible. Each demo swap buys ETH, so both pools slowly lose ETH and the price
// creeps up. The keeper tops up the short side (mints to the pool, then sync)
// to restore the target ratio. It only ever adds liquidity, so the pool drifts
// deeper over time but the price stays put — and a $250k swap keeps getting
// sandwiched well past any single demo session.
//
// Uses the deployer key (the DemoToken owner). Purely cosmetic: it touches only
// the demo pools' reserves, nothing in the protocol.
import { formatEther, type Address } from 'viem';
import { demoTokenAbi, swapPoolAbi } from './abi.js';
import { chainFor, loadDeployment, publicClient, requireKey, walletFor, writeGas } from './config.js';

const d = loadDeployment();
const pub = publicClient(d);
const wallet = walletFor(d, requireKey('DEPLOYER_PRIVATE_KEY'));

const TARGET_PRICE = 3000n; // USDC per ETH
const TOLERANCE = 0.02; // reseed when price drifts >2%
const CHECK_MS = 20_000;

async function reserves(pool: Address): Promise<{ base: bigint; quote: bigint }> {
  const [base, quote] = await Promise.all([
    pub.readContract({ address: pool, abi: swapPoolAbi, functionName: 'reserveBase' }),
    pub.readContract({ address: pool, abi: swapPoolAbi, functionName: 'reserveQuote' }),
  ]);
  return { base: base as bigint, quote: quote as bigint };
}

async function mintTo(token: Address, to: Address, amount: bigint): Promise<void> {
  const hash = await wallet.writeContract({
    address: token, abi: demoTokenAbi, functionName: 'mint', args: [to, amount],
    chain: chainFor(d), ...writeGas,
  });
  await pub.waitForTransactionReceipt({ hash });
}

async function keep(pool: Address, label: string): Promise<void> {
  const { base, quote } = await reserves(pool);
  if (quote === 0n) return;
  const price = Number(base) / Number(quote);
  const drift = Math.abs(price - Number(TARGET_PRICE)) / Number(TARGET_PRICE);
  if (drift < TOLERANCE) return;

  // Restore base/quote == TARGET_PRICE by topping up whichever side is short.
  const targetQuote = base / TARGET_PRICE;
  if (quote < targetQuote) {
    const add = targetQuote - quote;
    console.log(`[keeper] ${label} at $${price.toFixed(0)}: minting ${formatEther(add)} mETH`);
    await mintTo(d.eth, pool, add);
  } else {
    const add = quote * TARGET_PRICE - base;
    console.log(`[keeper] ${label} at $${price.toFixed(0)}: minting ${formatEther(add)} mUSDC`);
    await mintTo(d.usdc, pool, add);
  }
  const hash = await wallet.writeContract({
    address: pool, abi: swapPoolAbi, functionName: 'sync', args: [], chain: chainFor(d), ...writeGas,
  });
  await pub.waitForTransactionReceipt({ hash });
  const after = await reserves(pool);
  console.log(`[keeper] ${label} reseeded to $${(Number(after.base) / Number(after.quote)).toFixed(0)}/ETH`);
}

async function tick(): Promise<void> {
  try {
    await keep(d.publicPool, 'public');
    await keep(d.pealPool, 'peal');
  } catch (e) {
    console.error('[keeper]', e instanceof Error ? e.message : e);
  }
}

async function main(): Promise<void> {
  console.log(`[keeper] ${wallet.account.address} maintaining pools near $${TARGET_PRICE}/ETH`);
  await tick();
  setInterval(() => void tick(), CHECK_MS);
}

void main();
