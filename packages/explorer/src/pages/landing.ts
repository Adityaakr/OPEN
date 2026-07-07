// The landing page: a full-screen video hero with a glassmorphic nav and
// content anchored bottom-left, staggered blur-fade entrance. Sora for
// everything here (the landing is its own visual world; the app keeps
// Josefin/DM Sans). The background supports HLS: point VIDEO_SRC at any
// .m3u8 and it attaches via hls.js (lazy-imported; Safari plays it natively).
// A plain .mp4 URL works too. The video is decorative: if it fails, the dark
// hero stands alone.
const VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260511_230229_7c9bc431-46cf-489a-948d-e8144d8eb5d4.mp4';

async function attachVideoSource(
  video: HTMLVideoElement,
  src: string,
): Promise<{ destroy(): void } | null> {
  if (!src.endsWith('.m3u8') || video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = src;
    return null;
  }
  const { default: Hls } = await import('hls.js');
  if (!Hls.isSupported()) return null;
  const hls = new Hls();
  hls.loadSource(src);
  hls.attachMedia(video);
  return hls;
}

export function renderLanding(root: HTMLElement): () => void {
  const previousTitle = document.title;
  document.title = 'Peal Network. Programmable disclosure';
  root.innerHTML = `
    <div class="landing">
      <nav class="landing-nav" aria-label="Landing navigation">
        <div class="landing-nav-glass">
          <a class="landing-logo" href="#/">PEAL</a>
          <div class="landing-links">
            <a href="#/philosophy">Philosophy</a>
            <a href="#/protocol">Protocol</a>
            <a href="#/app">Explorer</a>
            <a href="https://github.com/Adityaakr/peal-network" target="_blank" rel="noopener">Code</a>
          </div>
          <a class="landing-nav-cta" href="#/app">Launch App</a>
        </div>
      </nav>

      <section class="landing-hero">
        <video class="landing-video" autoplay muted loop playsinline aria-hidden="true"></video>
        <div class="landing-overlay" aria-hidden="true"></div>
        <div class="landing-content">
          <h1 class="landing-title" style="animation-delay:0.2s">Peal <span>Network</span></h1>
          <p class="landing-sub" style="animation-delay:0.4s">Encryption that opens on schedule, guaranteed.</p>
          <p class="landing-desc" style="animation-delay:0.55s">Seal bids, votes, moves, and
          intents to a threshold committee that no single operator controls. When the
          deadline fires, the entire batch opens at once, every share verified in public.
          No second transaction, no strategic non-reveals, usable in ten lines of
          TypeScript.</p>
          <div class="landing-ctas" style="animation-delay:0.7s">
            <a class="landing-btn landing-btn-primary" href="#/app">Launch App</a>
            <a class="landing-btn landing-btn-light" href="#/protocol">Read the Protocol</a>
          </div>
          <p class="landing-trust" style="animation-delay:0.85s">Batched threshold
          encryption. 5-operator committee, any 3 reveal. Public devnet live.</p>
        </div>
      </section>
    </div>
  `;

  const video = root.querySelector<HTMLVideoElement>('.landing-video')!;
  let hls: { destroy(): void } | null = null;
  let cancelled = false;
  void attachVideoSource(video, VIDEO_SRC)
    .then((instance) => {
      if (cancelled) {
        instance?.destroy();
        return;
      }
      hls = instance;
    })
    .catch(() => {});

  return () => {
    cancelled = true;
    hls?.destroy();
    video.removeAttribute('src');
    document.title = previousTitle;
  };
}
