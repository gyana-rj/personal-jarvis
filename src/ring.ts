import { store, type JState } from './state';

const CORE = '#d9fff0';
const HALO = '#2cff9a';
const HALO_RGB = '44,255,154';

interface Look { bloom: number; width: number; spin: number; dim: number; sweep: number; ripple: number; ticks: number }

// Each state gets a distinct silhouette, not just a different color.
const LOOKS: Record<JState, Look> = {
  idle:      { bloom: 0.55, width: 7,  spin: 0.12, dim: 0.85, sweep: 0, ripple: 0, ticks: 0 },
  listening: { bloom: 0.95, width: 11, spin: 0.35, dim: 1,    sweep: 0, ripple: 1, ticks: 0 },
  thinking:  { bloom: 0.6,  width: 5,  spin: 1.5,  dim: 0.8,  sweep: 1, ripple: 0, ticks: 0 },
  speaking:  { bloom: 1.2,  width: 13, spin: 0.5,  dim: 1,    sweep: 0, ripple: 0, ticks: 1 },
};

export function startRing(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!;
  let size = 0, dpr = 1;
  const cur: Look = { ...LOOKS.idle };
  let t0 = performance.now();
  let lvl = 0;
  let angle = 0;

  const resize = () => {
    dpr = Math.min(devicePixelRatio || 1, 2);
    size = Math.min(innerWidth, innerHeight, 760);
    canvas.style.width = canvas.style.height = `${size}px`;
    canvas.width = canvas.height = Math.round(size * dpr);
  };
  resize();
  addEventListener('resize', resize);

  const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

  const frame = (now: number) => {
    const dt = Math.min((now - t0) / 1000, 0.05);
    t0 = now;
    const time = now / 1000;
    const target = LOOKS[store.state];
    for (const k of Object.keys(target) as (keyof Look)[]) cur[k] = lerp(cur[k], target[k], 0.08);
    lvl = lerp(lvl, (window as unknown as { __level?: number }).__level ?? store.level, 0.25);
    angle += dt * cur.spin;

    const s = size * dpr;
    const cx = s / 2, cy = s / 2;
    const unit = s / 760; // design units are authored at 760px
    const breathe = store.state === 'idle' ? Math.sin(time * 1.2) * 0.02 : 0;
    const R = 120 * unit * (1 + breathe + lvl * 0.14);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, s, s);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';

    // Three thin rotating rings behind the main ring.
    const rings = [
      { r: 1.42, dash: [2, 14], dir: 1,  speed: 0.6, a: 0.5 },
      { r: 1.75, dash: [60, 22, 6, 22], dir: -1, speed: 0.35, a: 0.38 },
      { r: 2.1,  dash: [1, 9], dir: 1,  speed: 0.2, a: 0.3 },
    ];
    rings.forEach((r, i) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle * r.dir * (1 + r.speed * 2) + i);
      ctx.setLineDash(r.dash.map((d) => d * unit));
      ctx.strokeStyle = `rgba(${HALO_RGB},${r.a * cur.dim})`;
      ctx.lineWidth = Math.max(1, unit);
      ctx.beginPath();
      ctx.arc(0, 0, R * r.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });
    ctx.setLineDash([]);

    // Outer bloom.
    const bloomA = Math.min(1, cur.bloom * (0.5 + lvl * 0.9));
    const bloom = ctx.createRadialGradient(cx, cy, R * 0.7, cx, cy, R * 3);
    bloom.addColorStop(0, `rgba(${HALO_RGB},${0.42 * bloomA})`);
    bloom.addColorStop(0.35, `rgba(${HALO_RGB},${0.16 * bloomA})`);
    bloom.addColorStop(1, `rgba(${HALO_RGB},0)`);
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, s, s);

    // Listening ripples.
    if (cur.ripple > 0.02) {
      for (let i = 0; i < 3; i++) {
        const p = (time * 0.45 + i / 3) % 1;
        ctx.strokeStyle = `rgba(${HALO_RGB},${(1 - p) * 0.55 * cur.ripple})`;
        ctx.lineWidth = 2 * unit;
        ctx.beginPath();
        ctx.arc(cx, cy, R * (1.1 + p * 0.55), 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Speaking: radial ticks that follow the audio level.
    if (cur.ticks > 0.02) {
      const n = 72;
      ctx.strokeStyle = `rgba(${HALO_RGB},${0.75 * cur.ticks})`;
      ctx.lineWidth = 2 * unit;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + angle * 0.3;
        const wob = 0.5 + 0.5 * Math.sin(i * 1.7 + time * 9) * Math.sin(i * 0.5 - time * 4);
        const len = (6 + (10 + 38 * lvl) * Math.abs(wob)) * unit * cur.ticks;
        const r0 = R * 1.2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len));
        ctx.stroke();
      }
    }

    // Halo, then mint-white core.
    const w = (cur.width + lvl * 14) * unit;
    ctx.shadowColor = HALO;
    ctx.shadowBlur = (34 + lvl * 40) * unit;
    ctx.strokeStyle = HALO;
    ctx.globalAlpha = cur.dim;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    ctx.shadowColor = CORE;
    ctx.shadowBlur = 14 * unit;
    ctx.strokeStyle = CORE;
    ctx.lineWidth = Math.max(1.5, w * 0.38);
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // Thinking: a bright arc sweeps the ring with orbiting beads.
    if (cur.sweep > 0.02) {
      const a0 = time * 3.2;
      ctx.strokeStyle = CORE;
      ctx.shadowColor = HALO;
      ctx.shadowBlur = 24 * unit;
      ctx.lineWidth = 9 * unit;
      ctx.globalAlpha = cur.sweep;
      ctx.beginPath();
      ctx.arc(cx, cy, R, a0, a0 + Math.PI * 0.55);
      ctx.stroke();
      ctx.fillStyle = CORE;
      for (let i = 0; i < 3; i++) {
        const a = -time * 2.1 + (i * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * R * 1.42, cy + Math.sin(a) * R * 1.42, 4 * unit, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }

    ctx.globalCompositeOperation = 'source-over';
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
