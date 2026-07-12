// The searcher: a real bot with its own key.
//
// On the PUBLIC lane it reads each pending order in the clear, sizes a sandwich
// to the victim's slippage floor, and if it is profitable submits real
// front-run and back-run transactions that extract value. If a swap is too
// small to beat the fee, it includes it honestly instead (the victim still gets
// filled). It is the block builder for that lane.
//
// On the PEAL lane it sees only Sealed(conditionId, ctHash) — a hash — so there
// is nothing to size and nothing to wrap. It logs that it is giving up. That
// failure is the demo: same bot, same intent, blind because the order is sealed.
import { formatEther, type Address } from 'viem';
import { erc20Abi, pealMempoolAbi, publicBuilderAbi, swapPoolAbi } from './abi.js';
import { chainFor, loadDeployment, publicClient, requireKey, serializer, walletFor, writeGas } from './config.js';
import { planSandwich, type Reserves } from './sandwich.js';

const d = loadDeployment();
const pub = publicClient(d);
const wallet = walletFor(d, requireKey('SEARCHER_PRIVATE_KEY'));
const searcher = wallet.account.address;
const tx = serializer();

async function reserves(): Promise<Reserves> {
  const [base, quote] = await Promise.all([
    pub.readContract({ address: d.publicPool, abi: swapPoolAbi, functionName: 'reserveBase' }),
    pub.readContract({ address: d.publicPool, abi: swapPoolAbi, functionName: 'reserveQuote' }),
  ]);
  return { base, quote };
}

async function ensureApproval(token: Address): Promise<void> {
  const allowance = await pub.readContract({
    address: token, abi: erc20Abi, functionName: 'allowance', args: [searcher, d.publicPool],
  });
  if (allowance > 10n ** 30n) return;
  const hash = await wallet.writeContract({
    address: token, abi: erc20Abi, functionName: 'approve', args: [d.publicPool, 2n ** 256n - 1n],
    chain: chainFor(d), ...writeGas,
  });
  await pub.waitForTransactionReceipt({ hash });
}

const handled = new Set<string>();

async function onPending(
  id: `0x${string}`,
  baseToQuote: boolean,
  amountIn: bigint,
  minOut: bigint,
): Promise<void> {
  if (handled.has(id)) return;
  handled.add(id);

  const r = await reserves();
  const plan = planSandwich(r, baseToQuote, amountIn, minOut);

  if (plan.worthIt) {
    console.log(
      `[searcher] pending ${id.slice(0, 10)} readable: ${formatEther(amountIn)} in, ` +
        `front-run ${formatEther(plan.frontIn)}, expected profit ${formatEther(plan.profit)}`,
    );
    const hash = await tx(() =>
      wallet.writeContract({
        address: d.publicBuilder, abi: publicBuilderAbi, functionName: 'sandwich',
        args: [id, plan.frontIn], chain: chainFor(d), ...writeGas,
      }),
    );
    const rcpt = await pub.waitForTransactionReceipt({ hash });
    console.log(`[searcher] SANDWICHED ${id.slice(0, 10)} in ${hash} (block ${rcpt.blockNumber})`);
  } else {
    console.log(
      `[searcher] pending ${id.slice(0, 10)} readable but not worth it ` +
        `(${formatEther(amountIn)} in) — including honestly`,
    );
    const hash = await tx(() =>
      wallet.writeContract({
        address: d.publicBuilder, abi: publicBuilderAbi, functionName: 'execute',
        args: [id], chain: chainFor(d), ...writeGas,
      }),
    );
    await pub.waitForTransactionReceipt({ hash });
  }
}

async function main(): Promise<void> {
  console.log(`[searcher] ${searcher} watching public lane ${d.publicBuilder}`);
  // Sequential: both approvals send from the searcher key.
  await ensureApproval(d.usdc);
  await ensureApproval(d.eth);

  pub.watchContractEvent({
    address: d.publicBuilder, abi: publicBuilderAbi, eventName: 'Pending', poll: true, pollingInterval: 1000,
    onLogs: (logs) => {
      for (const log of logs) {
        const a = log.args as { id: `0x${string}`; baseToQuote: boolean; amountIn: bigint; minOut: bigint };
        void onPending(a.id, a.baseToQuote, a.amountIn, a.minOut).catch((e) =>
          console.error(`[searcher] failed on ${a.id}:`, e instanceof Error ? e.message : e),
        );
      }
    },
  });

  // The blind lane: prove the bot sees only a hash and does nothing with it.
  pub.watchContractEvent({
    address: d.pealMempool, abi: pealMempoolAbi, eventName: 'Sealed', poll: true, pollingInterval: 1000,
    onLogs: (logs) => {
      for (const log of logs) {
        const a = log.args as { ctHash: `0x${string}` };
        console.log(
          `[searcher] sealed order ${a.ctHash.slice(0, 12)} on the peal lane — ` +
            `only a hash, no amount or direction. nothing to sandwich. giving up.`,
        );
      }
    },
  });
}

void main();
