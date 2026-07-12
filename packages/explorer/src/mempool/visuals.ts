// 3D scenes for the encrypted-mempool comparison, CSS transforms only (no
// three.js, CSP-safe) in the spirit of ceremony.ts. Two scenes:
//
//   sandwich — the public lane. Your trade is a slab; the searcher's front-run
//   and back-run are slabs above and below it. On "attack" they clamp together
//   and value ($) is siphoned out to the searcher.
//
//   vault — the peal lane. Your trade is a sealed cube the searcher can only
//   orbit. On "open" (the cue) it unlocks and the full value lands, untouched.
//
// Each returns { el, play, resolve, reset, destroy }. All motion is gated behind
// prefers-reduced-motion in the CSS.

export interface Scene {
  el: HTMLElement;
  /** Enter the "in flight" look (searcher circling / clamps loaded). */
  play(): void;
  /** Land the outcome. `lostUsd` (sandwich) or the fill is shown by the page. */
  resolve(opts: { lostUsd?: number; kept?: boolean }): void;
  reset(): void;
  destroy(): void;
}

function el(cls: string, html = ''): HTMLElement {
  const d = document.createElement('div');
  d.className = cls;
  if (html) d.innerHTML = html;
  return d;
}

// ---- public lane: the sandwich ----------------------------------------

export function createSandwichScene(): Scene {
  const root = el('mp3d mp3d-sandwich');
  root.dataset.phase = 'idle';
  const stage = el('mp3d-stage');
  const scene = el('mp3d-scene');

  const back = el('slab slab-attacker slab-back');
  const victim = el('slab slab-victim');
  const front = el('slab slab-attacker slab-front');
  scene.append(back, victim, front);

  // Value siphoned to the searcher.
  const coins = el('mp3d-coins');
  for (let i = 0; i < 6; i++) {
    const c = el('coin');
    c.style.setProperty('--i', String(i));
    coins.appendChild(c);
  }
  scene.appendChild(coins);

  const searcher = el('mp3d-searcher', '<span>searcher</span>');
  stage.append(scene, searcher);
  root.appendChild(stage);

  // Flat, crisp legend so the 3D stack is legible without skewed text on it.
  const legend = el(
    'mp3d-legend',
    `<span class="mp3d-leg"><i class="mp3d-dot mp3d-dot-red"></i>front-run</span>` +
      `<span class="mp3d-leg"><i class="mp3d-dot mp3d-dot-blue"></i>your swap</span>` +
      `<span class="mp3d-leg"><i class="mp3d-dot mp3d-dot-red"></i>back-run</span>`,
  );
  root.appendChild(legend);

  const loss = el('mp3d-loss');
  root.appendChild(loss);

  return {
    el: root,
    play() {
      root.dataset.phase = 'racing';
      loss.textContent = '';
    },
    resolve({ lostUsd }) {
      root.dataset.phase = 'attacked';
      if (lostUsd && lostUsd > 0) {
        loss.innerHTML = `<span class="mp3d-loss-num">-$${lostUsd.toFixed(0)}</span><span class="mp3d-loss-cap">taken by the searcher</span>`;
      } else {
        loss.innerHTML = `<span class="mp3d-loss-cap">too small to sandwich</span>`;
      }
    },
    reset() {
      root.dataset.phase = 'idle';
      loss.textContent = '';
    },
    destroy() {
      root.remove();
    },
  };
}

// ---- peal lane: the sealed vault --------------------------------------

export function createVaultScene(): Scene {
  const root = el('mp3d mp3d-vault');
  root.dataset.phase = 'idle';
  const stage = el('mp3d-stage');

  const cube = el('vault-cube');
  for (const face of ['front', 'back', 'right', 'left', 'top', 'bottom']) {
    const f = el(`vault-face vault-${face}`);
    if (face === 'front') f.innerHTML = '<span class="vault-lock" aria-hidden="true"></span>';
    cube.appendChild(f);
  }
  // The value that lands when it opens.
  const core = el('vault-core', '<span class="vault-core-eth">ETH</span>');
  cube.appendChild(core);

  const searcher = el('mp3d-searcher mp3d-searcher-orbit', '<span>searcher</span>');

  stage.append(cube, searcher);
  root.appendChild(stage);

  const kept = el('mp3d-kept');
  root.appendChild(kept);

  return {
    el: root,
    play() {
      root.dataset.phase = 'racing';
      kept.textContent = '';
    },
    resolve() {
      root.dataset.phase = 'opened';
      kept.innerHTML = `<span class="mp3d-kept-num">$0</span><span class="mp3d-kept-cap">taken. full amount kept.</span>`;
    },
    reset() {
      root.dataset.phase = 'idle';
      kept.textContent = '';
    },
    destroy() {
      root.remove();
    },
  };
}
