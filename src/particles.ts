interface Dot { x: number; y: number; vx: number; vy: number; sprite: number; alpha: number; r: number }

const GREEN = '44,255,154';
const SPRITE_BLURS = [0.15, 0.35, 0.6, 0.85];

/** Pre-rendered soft dots; blur level varies per sprite so the field has depth. */
function makeSprites(): HTMLCanvasElement[] {
  return SPRITE_BLURS.map((softness) => {
    const size = 64;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, `rgba(${GREEN},1)`);
    grad.addColorStop(Math.max(0.05, 1 - softness), `rgba(${GREEN},${0.55 - softness * 0.3})`);
    grad.addColorStop(1, `rgba(${GREEN},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return c;
  });
}

export function startParticles(canvas: HTMLCanvasElement, count = 150): void {
  const ctx = canvas.getContext('2d')!;
  const sprites = makeSprites();
  let w = 0, h = 0;
  const dots: Dot[] = [];

  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = innerWidth; h = innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  addEventListener('resize', resize);

  for (let i = 0; i < count; i++) {
    dots.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.18,
      vy: (Math.random() - 0.5) * 0.18 - 0.03,
      sprite: Math.floor(Math.random() * sprites.length),
      alpha: 0.3 + Math.random() * 0.4,
      r: 3 + Math.random() * 9,
    });
  }

  const frame = () => {
    ctx.clearRect(0, 0, w, h);
    for (const d of dots) {
      d.x += d.vx; d.y += d.vy;
      if (d.x < -20) d.x = w + 20; else if (d.x > w + 20) d.x = -20;
      if (d.y < -20) d.y = h + 20; else if (d.y > h + 20) d.y = -20;
      ctx.globalAlpha = d.alpha;
      ctx.drawImage(sprites[d.sprite], d.x - d.r, d.y - d.r, d.r * 2, d.r * 2);
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(frame);
  };
  frame();
}
