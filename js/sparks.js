import { SPARKS } from './config.js';

const PALETTE = ['#ffd9a0', '#ffb26b', '#ff8a4a', '#e5484d', '#d9d9df'];

const randomBetween = (min, max) => min + Math.random() * (max - min);

export class SparkField {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.running = false;
    this.last = 0;
    this.width = 0;
    this.height = 0;
    this.ratio = 1;
    this.glow = this.createGlow();

    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  createGlow() {
    const sprite = document.createElement('canvas');
    sprite.width = 64;
    sprite.height = 64;

    const ctx = sprite.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 214, 160, 0.85)');
    gradient.addColorStop(0.4, 'rgba(255, 140, 70, 0.28)');
    gradient.addColorStop(1, 'rgba(255, 120, 60, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);

    return sprite;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);

    if (width === this.width && height === this.height && ratio === this.ratio) return;

    this.width = width;
    this.height = height;
    this.ratio = ratio;
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  burst(x, y, { count = 15, spread = 24, power = 1 } = {}) {
    for (let index = 0; index < count; index += 1) {
      const cube = Math.random() < 0.28;
      const life = randomBetween(SPARKS.lifeMin, SPARKS.lifeMax) * randomBetween(0.8, 1.2);
      const sideways = Math.random() ** 2;

      this.particles.push({
        x: x + randomBetween(-spread, spread),
        y: y + randomBetween(-3, 3),
        vx: (Math.random() < 0.5 ? -1 : 1) * sideways * 145 * power,
        vy: randomBetween(-70, -250) * power,
        size: cube ? randomBetween(3.2, 6.4) : randomBetween(1.4, 2.6),
        rotation: randomBetween(0, Math.PI),
        spin: randomBetween(-7, 7),
        life,
        age: 0,
        cube,
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
      });
    }

    if (this.particles.length > 380) {
      this.particles.splice(0, this.particles.length - 380);
    }

    if (!this.running) {
      this.running = true;
      this.last = performance.now();
      requestAnimationFrame((time) => this.tick(time));
    }
  }

  tick(time) {
    const delta = Math.min((time - this.last) / 1000, 0.05);
    this.last = time;

    this.fade(delta);
    this.update(delta);
    this.draw();

    if (this.particles.length) {
      requestAnimationFrame((next) => this.tick(next));
    } else {
      this.running = false;
      this.ctx.clearRect(0, 0, this.width, this.height);
    }
  }

  fade(delta) {
    // оставляем короткий шлейф, а не стираем всё в ноль
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(0.42, delta * 3.2)})`;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.globalCompositeOperation = 'source-over';
  }

  update(delta) {
    const keep = [];
    const drag = Math.pow(SPARKS.drag, delta * 60);

    for (const particle of this.particles) {
      particle.age += delta * 1000;
      if (particle.age >= particle.life) continue;

      particle.vy += SPARKS.gravity * delta * 1000 * 1.6;
      particle.vx *= drag;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.rotation += particle.spin * delta;

      if (particle.y > this.height + 80) continue;

      keep.push(particle);
    }

    this.particles = keep;
  }

  draw() {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'lighter';

    for (const particle of this.particles) {
      const progress = particle.age / particle.life;
      const alpha = (1 - progress) * (0.9 - progress * 0.35);
      if (alpha <= 0.01) continue;

      ctx.save();
      ctx.translate(particle.x, particle.y);
      ctx.globalAlpha = alpha;

      const halo = particle.size * (particle.cube ? 3.6 : 4.6);
      ctx.drawImage(this.glow, -halo / 2, -halo / 2, halo, halo);

      ctx.rotate(particle.rotation);
      ctx.globalAlpha = Math.min(1, alpha * 1.2);
      ctx.fillStyle = particle.color;

      if (particle.cube) {
        ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);
      } else {
        const size = particle.size;
        ctx.fillRect(-size / 2, -size / 2, size, size);
      }

      ctx.restore();
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}
