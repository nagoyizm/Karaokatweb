/*
 * Motor de karaoke en vivo (brief §4.9).
 * Un solo reloj requestAnimationFrame calcula el progreso de cada sílaba (0 a 1)
 * y lo escribe en la variable CSS --p; el CSS hace el dibujo de cada efecto.
 *
 * Datos: una pantalla = varias líneas; cada palabra = { t: "pa|la|bra", s: inicio_ms, e: fin_ms }.
 * Las sílabas van separadas por "|" y reparten el tiempo de la palabra según su largo.
 * Dos líneas con los mismos tiempos se iluminan a la vez (doble letra).
 */

const EFFECTS = ["barrido", "eco", "vapor", "pop", "bolita", "neon", "aparecer"];
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function splitWord(word) {
  const parts = word.t.split("|");
  const total = parts.reduce((n, p) => n + p.length, 0);
  let cursor = word.s;
  return parts.map((text) => {
    const dur = ((word.e - word.s) * text.length) / total;
    const syl = { text, s: cursor, e: cursor + dur };
    cursor += dur;
    return syl;
  });
}

export class Karaoke {
  /**
   * @param {HTMLElement} stage  contenedor donde se dibuja
   * @param {{lines: Array, duration: number, gap?: number, effect?: string, onLoop?: Function}} opts
   */
  constructor(stage, opts) {
    this.stage = stage;
    this.lines = opts.lines;
    this.duration = opts.duration;
    this.gap = opts.gap ?? 1400;
    this.onLoop = opts.onLoop;
    this.effect = opts.effect ?? "eco";
    this.running = false;
    this.visible = true;
    this.t0 = performance.now();
    this.lastT = -1;
    this.build();
    this.setEffect(this.effect);

    this.io = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      if (this.visible) this.start();
      else this.stop();
    });
    this.io.observe(stage);

    this.ro = new ResizeObserver(() => this.measure());
    this.ro.observe(stage);
    document.fonts?.ready.then(() => this.measure());
    this.onMotion = () => this.restart();
    reducedMotion.addEventListener("change", this.onMotion);
  }

  destroy() {
    this.stop();
    this.io.disconnect();
    this.ro.disconnect();
    reducedMotion.removeEventListener("change", this.onMotion);
  }

  build() {
    this.stage.classList.add("k-stage");
    this.stage.innerHTML = "";
    this.syllables = [];
    this.timed = []; // sílabas de la línea principal, para la bolita
    const screen = document.createElement("div");
    screen.className = "k-screen";

    this.lines.forEach((line, li) => {
      const row = document.createElement("div");
      row.className = "k-line " + (line.cls || "");
      if (line.lang) row.lang = line.lang;
      if (line.static) {
        row.textContent = line.text;
        screen.append(row);
        return;
      }
      line.words.forEach((word, wi) => {
        const w = document.createElement("span");
        w.className = "k-word";
        splitWord(word).forEach((syl) => {
          const el = document.createElement("span");
          el.className = "k-syl";
          const txt = document.createElement("span");
          txt.className = "k-txt";
          txt.textContent = syl.text;
          el.append(txt);
          w.append(el);
          const entry = { ...syl, el, txt, on: false, line: li };
          this.syllables.push(entry);
          if (!line.follower) this.timed.push(entry);
        });
        row.append(w);
        if (wi < line.words.length - 1 && !line.tight) row.append(" ");
      });
      screen.append(row);
    });

    this.ball = document.createElement("span");
    this.ball.className = "k-ball";
    this.ball.setAttribute("aria-hidden", "true");
    screen.append(this.ball);

    this.wait = document.createElement("div");
    this.wait.className = "k-wait";
    this.wait.setAttribute("aria-hidden", "true");
    this.wait.innerHTML = "<i></i><i></i><i></i><i></i>";

    this.stage.append(screen, this.wait);
    this.screen = screen;
    this.timed.sort((a, b) => a.s - b.s);
  }

  setEffect(name) {
    if (!EFFECTS.includes(name)) return;
    EFFECTS.forEach((fx) => this.stage.classList.remove("fx-" + fx));
    this.effect = name;
    this.stage.classList.add("fx-" + name);
    this.restart();
  }

  measure() {
    const box = this.screen.getBoundingClientRect();
    this.fontPx = parseFloat(getComputedStyle(this.screen).fontSize) || 32;
    this.timed.forEach((syl) => {
      const r = syl.el.getBoundingClientRect();
      syl.cx = r.left - box.left + r.width / 2;
      syl.top = r.top - box.top;
    });
  }

  reset() {
    this.syllables.forEach((syl) => {
      syl.on = false;
      syl.el.classList.remove("on", "gone");
      syl.el.style.setProperty("--p", 0);
      syl.el.querySelectorAll(".k-copy").forEach((c) => c.remove());
      syl.txt.getAnimations().forEach((a) => a.cancel());
    });
    this.ball.style.opacity = 0;
    this.lastT = -1;
    this.measure();
  }

  restart() {
    this.reset();
    this.t0 = performance.now();
    if (reducedMotion.matches) {
      // Modo ahorro: la letra queda pintada, sin movimiento.
      this.stop();
      this.syllables.forEach((syl) => {
        syl.el.classList.add("on");
        syl.el.style.setProperty("--p", 1);
      });
      this.stage.classList.remove("waiting");
      return;
    }
    if (this.visible) this.start();
  }

  start() {
    if (this.running || reducedMotion.matches) return;
    this.running = true;
    this.measure();
    const tick = (now) => {
      if (!this.running) return;
      this.frame(now);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** Reinicia el reloj en el instante dado (para sincronizar con el audio). */
  syncTo(now = performance.now()) {
    this.reset();
    this.t0 = now;
  }

  frame(now) {
    const loop = this.duration + this.gap;
    const t = (now - this.t0) % loop;
    if (t < this.lastT) {
      this.reset();
      this.onLoop?.();
    }
    this.lastT = t;
    this.stage.classList.toggle("waiting", t > this.duration);

    for (const syl of this.syllables) {
      const p = clamp((t - syl.s) / (syl.e - syl.s), 0, 1);
      syl.el.style.setProperty("--p", p.toFixed(3));
      if (!syl.on && t >= syl.s) {
        syl.on = true;
        syl.el.classList.add("on");
        this.hit(syl);
      }
    }
    if (this.effect === "bolita") this.moveBall(t);
  }

  /** Lo que pasa en el instante exacto en que se canta una sílaba. */
  hit(syl) {
    const dur = syl.e - syl.s;
    switch (this.effect) {
      case "eco": {
        const pd = clamp(dur / 2, 60, 180);
        syl.txt.animate(
          [{ transform: "scale(1)" }, { transform: "scale(1.04)", offset: 0.5 }, { transform: "scale(1)" }],
          { duration: pd * 2, easing: "ease-out" }
        );
        this.copy(syl, "k-copy eco");
        break;
      }
      case "vapor": {
        const pd = clamp(dur / 2, 60, 160);
        this.copy(syl, "k-copy vapor");
        setTimeout(() => syl.on && syl.el.classList.add("gone"), pd);
        break;
      }
      case "pop": {
        const up = clamp(dur / 3, 15, 50);
        syl.txt.animate(
          [{ transform: "scale(1)" }, { transform: "scale(1.16)" }],
          { duration: up, fill: "forwards" }
        ).finished.then(() => {
          syl.txt.animate([{ transform: "scale(1.16)" }, { transform: "scale(1)" }], {
            duration: 320,
            easing: "cubic-bezier(.34,1.56,.64,1)",
            fill: "forwards",
          });
        }).catch(() => {});
        break;
      }
    }
  }

  copy(syl, cls) {
    const c = document.createElement("span");
    c.className = cls;
    c.setAttribute("aria-hidden", "true");
    c.textContent = syl.text;
    c.addEventListener("animationend", () => c.remove());
    syl.el.append(c);
  }

  /** Bolita: arcos parabólicos que caen justo en el inicio de cada sílaba. */
  moveBall(t) {
    const list = this.timed;
    if (!list.length || list[0].cx === undefined) return;
    const fp = this.fontPx;
    let x, y;
    let i = -1;
    while (i + 1 < list.length && list[i + 1].s <= t) i++;

    if (i === -1) {
      const first = list[0];
      const u = clamp(t / Math.max(first.s, 1), 0, 1);
      const fromX = first.cx - fp * 1.5;
      x = fromX + (first.cx - fromX) * u;
      y = first.top - fp * 0.12 - fp * 0.9 * 4 * u * (1 - u);
    } else if (i === list.length - 1 || t > this.duration) {
      const last = list[list.length - 1];
      x = last.cx;
      y = last.top - fp * 0.12;
    } else {
      const a = list[i], b = list[i + 1];
      const u = clamp((t - a.s) / (b.s - a.s), 0, 1);
      const dist = Math.hypot(b.cx - a.cx, b.top - a.top);
      const h = clamp(dist * 0.5, fp * 0.4, fp * 0.75);
      x = a.cx + (b.cx - a.cx) * u;
      y = a.top + (b.top - a.top) * u - fp * 0.12 - h * 4 * u * (1 - u);
    }
    this.ball.style.opacity = t > this.duration ? 0 : 1;
    this.ball.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
  }
}

export { EFFECTS };
