import { SPARKS } from './config.js';

const PALETTE = ['#ffffff', '#f0f6fc', '#e6edf3', '#c9d1d9', '#8b949e'];

const randomBetween = (min, max) => min + Math.random() * (max - min);

export class SparkField {
  constructor(host, canvas) {
    this.host = host;
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
    new ResizeObserver(() => this.resize()).observe(host);
  }

  createGlow() {
    const sprite = document.createElement('canvas');
    sprite.width = 64;
    sprite.height = 64;

    const ctx = sprite.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.3)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);

    return sprite;
  }

  resize() {
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    if (!width || !height) return;

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(width);
    const h = Math.round(height);

    if (w === this.width && h === this.height && ratio === this.ratio) return;

    this.width = w;
    this.height = h;
    this.ratio = ratio;
    this.canvas.width = Math.round(w * ratio);
    this.canvas.height = Math.round(h * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  burst(x, y, { count = 15, spread = 24, power = 1 } = {}) {
    const speed = randomBetween(SPARKS.speedMin, SPARKS.speedMax);

    for (let index = 0; index < count; index += 1) {
      const cube = Math.random() < 0.28;
      const life = randomBetween(SPARKS.lifeMin, SPARKS.lifeMax) * randomBetween(0.85, 1.15);
      const sideways = Math.random();

      this.particles.push({
        x: x + randomBetween(-spread, spread),
        y: y + randomBetween(-3, 3),
        vx: (Math.random() < 0.5 ? -1 : 1) * (sideways * 260 + 40) * speed * power,
        vy: (cube ? randomBetween(120, 300) : randomBetween(70, 220)) * speed * power,
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
    ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(0.5, delta * 3.2)})`;
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

      keep.push(particle);
    }

    this.particles = keep;
  }

  draw() {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'lighter';

    for (const particle of this.particles) {
      const progress = particle.age / particle.life;
      // почти до конца держим яркость, затем резкий спад — эффект «вспышки»
      const alpha = progress < 0.6 ? 1 : Math.pow(1 - (progress - 0.6) / 0.4, 2);
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
