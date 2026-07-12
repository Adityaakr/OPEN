# Deploying the encrypted-mempool demo to Railway

The demo (`#/encrypted-mempool`) is five moving parts. Deploy each as its own
Railway service so they scale and restart independently.

```
 explorer (static SPA)  ──/v0──▶  coordinator (existing devnet)
        │                              ▲
        └──── HTTP ────▶ relayer ──┐   │ reveals
                        searcher    │   │
                        settler ────┴───┘ (watches coordinator, settles on Tempo)
```

| service    | directory                 | what it is                                    |
|------------|---------------------------|-----------------------------------------------|
| coordinator| `docker/Dockerfile.railway` (root `railway.json`) | the BTE devnet (already deployed) |
| relayer    | `packages/mempool-agents` | sponsored, no-wallet gateway + `/prepare`     |
| searcher   | `packages/mempool-agents` | the real sandwich bot                         |
| settler    | `packages/mempool-agents` | opens the sealed batch on-chain               |
| explorer   | `packages/explorer`       | the DEX + comparison + pipelines (static SPA) |

All on-chain state lives on **Tempo Moderato (chain 42431)**; the contract
addresses are committed in `packages/mempool-agents/deployments/42431.json`.

## Secrets

The three keys are in `.secrets/tempo-keys.env` (gitignored, never pushed). Set
them as Railway **service variables**, not in the repo:

- relayer service: `RELAYER_PRIVATE_KEY`
- searcher service: `SEARCHER_PRIVATE_KEY`
- settler service: `DEPLOYER_PRIVATE_KEY` (deployer == coordinator/settler)

Each key needs pathUSD for gas on Tempo (the faucet gives 1M; that is plenty).

## 1-3. The agents (relayer, searcher, settler)

One image, one directory, three services. On Railway create three services, each
with **root directory `packages/mempool-agents`** (it has a `Dockerfile`), and
set the `START` variable to pick which agent runs.

Shared variables (all three):

```
CHAIN_ID=42431
TX_GAS=8000000
```

Per-service variables:

| service  | START      | key variable            | extra                                                   |
|----------|------------|-------------------------|---------------------------------------------------------|
| relayer  | `relayer`  | `RELAYER_PRIVATE_KEY`   | Railway injects `PORT`; expose the service publicly     |
| searcher | `searcher` | `SEARCHER_PRIVATE_KEY`  | none                                                    |
| settler  | `settler`  | `DEPLOYER_PRIVATE_KEY`  | `COORDINATOR_URL=<coordinator base url>`                |

The relayer is the only one that serves HTTP (`/config`, `/state`, `/prepare`,
`/public-swap`, `/commit`, `/public-result`, `/peal-result`). Give it a public
domain; note its URL for the explorer's `VITE_RELAYER_URL`.

Do NOT run the keeper in production: `/prepare` resets both pools before each
swap, and a background keeper would risk resetting them mid-swap.

## 4. The explorer (static SPA)

> The currently-live service (`bte-explorer-production`) is the **devnet-in-a-box**
> image (`docker/Dockerfile.railway`): it runs the coordinator + operators AND
> serves the explorer static build, with Caddy proxying `/v0` same-origin. If you
> keep that bundling, you do NOT deploy a separate explorer service. Instead set
> `VITE_RELAYER_URL` as a **build variable** on that one service and redeploy it;
> the Dockerfile now bakes it into the explorer build. `VITE_BTE_URL` stays empty
> (same-origin `/v0`). The standalone-explorer setup below is the alternative if
> you ever split them apart.


The explorer imports the `bte-sdk` workspace package, so its build needs the
whole repo. On Railway set this service's **root directory to the repo root**
and its Dockerfile path to `packages/explorer/Dockerfile`.

The coordinator and relayer URLs are inlined at build time, so set them as
**build variables** (Railway build args):

```
VITE_BTE_URL=<coordinator base url>        # e.g. https://<coordinator>.up.railway.app
VITE_RELAYER_URL=<relayer base url>        # the relayer service's public URL
```

It serves the built SPA on `PORT` with an SPA fallback so hash routes resolve.

## Order of operations

1. Coordinator is already live (existing devnet).
2. Deploy the **relayer**, give it a domain, note its URL.
3. Deploy **searcher** and **settler** (settler needs `COORDINATOR_URL`).
4. Build the **explorer** with `VITE_BTE_URL` (coordinator) and
   `VITE_RELAYER_URL` (relayer), then open its domain.

## Changing the sandwich threshold

The pool depth is a one-line dial in `packages/mempool-agents/src/relayer.ts`
(`TARGET_BASE` / `TARGET_QUOTE`); `/prepare` resets both pools to it before every
swap. Shallower pool = smaller swaps get sandwiched. Redeploy the relayer only;
no contract redeploy.
