// Anchored sealed-bid auction: bids are committed onchain (BteAnchor), the
// condition fires at a block height, and the winner is asserted against the
// onchain reveal root.
//
// Chains: SEPOLIA_RPC_URL + ANCHOR_PRIVATE_KEY if set; otherwise a local
// anvil is spawned automatically (chainless users: `just demo` is unaffected).
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BteClient,
  anchorRevealRoot,
  verifyAnchor,
  type AnchorConfig,
} from 'bte-sdk';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const here = dirname(fileURLToPath(import.meta.url));
// anvil's well-known dev key 0 — dev chains only.
const ANVIL_KEY_0 = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

let anvil: ChildProcess | null = null;
let rpcUrl = process.env.SEPOLIA_RPC_URL;
let privateKey = (process.env.ANCHOR_PRIVATE_KEY ?? '') as Hex;

if (!rpcUrl) {
  console.log('SEPOLIA_RPC_URL not set: spawning a local anvil (chain 31337, 2s blocks).');
  console.log('To anchor on Sepolia: export SEPOLIA_RPC_URL=… ANCHOR_PRIVATE_KEY=0x…\n');
  anvil = spawn('anvil', ['--host', '0.0.0.0', '--block-time', '2', '--silent'], {
    stdio: 'ignore',
  });
  rpcUrl = 'http://127.0.0.1:8545';
  privateKey = ANVIL_KEY_0;
  await new Promise((r) => setTimeout(r, 1500));
} else if (!privateKey) {
  console.error('ANCHOR_PRIVATE_KEY required with SEPOLIA_RPC_URL');
  process.exit(1);
}

const cleanup = (code: number): never => {
  anvil?.kill();
  process.exit(code);
};

try {
  const transport = http(rpcUrl);
  const probe = createPublicClient({ transport });
  const chainId = await probe.getChainId();
  const chain = defineChain({
    id: chainId,
    name: `chain-${chainId}`,
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ account, chain, transport });
  console.log(`chain ${chainId}, coordinator/anchor key ${account.address}`);

  // Deploy BteAnchor with this key as the coordinator address.
  const artifact = JSON.parse(
    readFileSync(join(here, '..', '..', 'contracts', 'out', 'BteAnchor.sol', 'BteAnchor.json'), 'utf8'),
  );
  const deployHash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object as Hex,
    args: [account.address],
  });
  const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
  const contract = deployReceipt.contractAddress as `0x${string}`;
  console.log(`BteAnchor deployed at ${contract}\n`);

  const anchor: AnchorConfig = {
    contract,
    signer: {
      sendTransaction: async (tx) => {
        const hash = await walletClient.sendTransaction({ to: tx.to, data: tx.data });
        await publicClient.waitForTransactionReceipt({ hash });
        return hash;
      },
    },
  };

  const client = new BteClient({ url: process.env.BTE_DEVNET_URL ?? 'http://localhost:8080' });
  const head = await publicClient.getBlockNumber();
  // Room for 4 commit txs (each waits a receipt) before the cue: ~30s on
  // anvil's 2s blocks, ~72s on Sepolia's 12s blocks.
  const target = Number(head) + (chainId === 31337 ? 15 : 6);
  const conditionId = await client.condition({ atBlock: { chainId, height: target } });
  console.log(`condition ${conditionId} fires at block ${target} (head ${head})\n`);

  const bids = [
    { name: 'alice', bid: 420 },
    { name: 'bob', bid: 815 },
    { name: 'carol', bid: 233 },
    { name: 'dave', bid: 704 },
  ];
  console.log('sealing + anchoring commits onchain:');
  for (const bid of bids) {
    const { ctHash } = await client.seal(JSON.stringify(bid), conditionId, { anchor });
    console.log(`  ${bid.name.padEnd(6)} committed ${ctHash.slice(0, 16)}…`);
  }

  console.log('\nwaiting for the block-height cue…');
  const reveal = await client.waitForReveal(conditionId, { timeoutMs: 600_000 });
  console.log(`revealed. coordinator merkle root: ${reveal.merkleRoot}`);

  // The coordinator's key publishes the root onchain, then anyone verifies.
  await anchorRevealRoot(anchor, conditionId, reveal.merkleRoot);
  const check = await verifyAnchor(conditionId, client, { rpcUrl, contract });
  console.log(`onchain root:     ${check.onchainRoot}`);
  console.log(`recomputed root:  ${check.recomputedRoot}`);
  if (!check.matches) {
    console.error('FAIL: onchain root does not match recomputed reveal root');
    cleanup(1);
  }

  const revealed = reveal.slots
    .filter((s) => !s.isDummy && s.valid && s.text)
    .map((s) => JSON.parse(s.text!) as { name: string; bid: number })
    .sort((a, b) => b.bid - a.bid);
  const expected = [...bids].sort((a, b) => b.bid - a.bid);
  if (JSON.stringify(revealed) !== JSON.stringify(expected)) {
    console.error('FAIL: revealed bids do not match sealed bids');
    cleanup(1);
  }
  console.log(`\nwinner: ${revealed[0].name} with ${revealed[0].bid}, asserted against the onchain reveal root`);
  console.log('anchored demo PASS');
  cleanup(0);
} catch (e) {
  console.error(e);
  cleanup(1);
}
