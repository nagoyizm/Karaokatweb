import { Karaoke } from "./karaoke.js";

/* ---------- Ajustes rápidos ---------- */
const DOWNLOAD_URL = "";      // enlace al instalador de Windows
const WAITLIST_ENDPOINT = ""; // URL que recibe { email } por POST (Formspree, Worker, etc.)
const SONG_SECONDS = 210;     // la página dura «3:30» en la barra de la canción

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const $ = (s) => document.querySelector(s);

/* =====================================================================
 * Sílabas aproximadas («can|ta»), para el demo y para la pelotita de los títulos.
 * ===================================================================== */
const VOWELS = "aeiouáéíóúüàèìòùâêôãõy";
const SYL = new RegExp(`[^${VOWELS}]*[${VOWELS}]+(?:[^${VOWELS}]*$|[^${VOWELS}](?=[^${VOWELS}]))?`, "gi");

function syllables(word) {
  const parts = word.match(SYL);
  return parts && parts.join("") === word ? parts : [word];
}

/* =====================================================================
 * INTRO: demo automático. Las líneas pasan en carrusel vertical, cada una con otro efecto.
 * ===================================================================== */
const HERO_LYRICS = [
  "Esta noche la ciudad canta",
  "cada palabra brilla a tiempo",
  "si el ritmo se escapa, lo atrapo",
  "subo el volumen, se va el miedo",
  "la luna marca el compás",
  "y empieza otra vez la canción",
];
const FX_ORDER = ["barrido", "eco", "bolita", "vapor", "pop", "neon", "aparecer"];
const FX_NAMES = { barrido: "Barrido", eco: "Eco difuminado", vapor: "Vapor", pop: "Pop", bolita: "Bolita", neon: "Neón", aparecer: "Aparecer" };
const SYL_MS = 230;

const reel = $("#hero-reel");
const fxLabel = $("#hero-fx");
const rows = HERO_LYRICS.map((text) => {
  const row = document.createElement("div");
  row.className = "reel-line";
  row.textContent = text;
  reel.append(row);
  return row;
});

/** Convierte una línea en datos del motor, con tiempos automáticos por sílaba. */
function lineData(text) {
  let t = 300;
  const words = text.split(/\s+/).map((w) => {
    const syl = syllables(w);
    const d = syl.length * SYL_MS;
    const word = { t: syl.join("|"), s: t, e: t + d - 30 };
    t += d;
    return word;
  });
  return { words, end: t };
}

let heroI = -1, heroFx = -1, heroK = null, heroTimer = null;

function heroNext() {
  heroK?.destroy();
  heroK = null;
  if (heroI >= 0) rows[heroI].classList.add("is-past");
  heroI = (heroI + 1) % rows.length;
  heroFx = (heroFx + 1) % FX_ORDER.length;
  if (heroI === 0) rows.forEach((r, k) => { r.classList.remove("is-past"); r.textContent = HERO_LYRICS[k]; r.className = "reel-line"; });

  const row = rows[heroI];
  reel.style.setProperty("--i", heroI);
  rows.forEach((r, k) => r.classList.toggle("is-now", k === heroI));
  const fx = FX_ORDER[heroFx];
  fxLabel.textContent = FX_NAMES[fx];

  const { words, end } = lineData(HERO_LYRICS[heroI]);
  heroK = new Karaoke(row, { lines: [{ words }], duration: end, gap: 600000, effect: fx });
  heroTimer = setTimeout(heroNext, end + 900);
}

if (reducedMotion.matches) {
  // Sin movimiento: se ve una línea ya pintada y nada más.
  reel.style.setProperty("--i", 0);
  rows[0].classList.add("is-now");
  heroK = new Karaoke(rows[0], { lines: [{ words: lineData(HERO_LYRICS[0]).words }], duration: 3000, gap: 1000, effect: "barrido" });
  fxLabel.textContent = FX_NAMES.barrido;
} else {
  (document.fonts?.ready ?? Promise.resolve()).then(heroNext);
}

/* =====================================================================
 * Títulos que se cantan: cada sílaba se rellena al leerla, con una pelotita
 * que salta de sílaba en sílaba, como el efecto Bolita.
 * ===================================================================== */
function wrapSyllables(el) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    const frag = document.createDocumentFragment();
    node.textContent.split(/(\s+)/).forEach((part) => {
      if (!part) return;
      if (/^\s+$/.test(part)) { frag.append(part); return; }
      const w = document.createElement("span");
      w.className = "swd";
      syllables(part).forEach((t) => {
        const s = document.createElement("span");
        s.className = "sw";
        s.textContent = t;
        w.append(s);
      });
      frag.append(w);
    });
    node.replaceWith(frag);
  });
  const ball = document.createElement("span");
  ball.className = "sball";
  ball.setAttribute("aria-hidden", "true");
  el.append(ball);
  return { syl: [...el.querySelectorAll(".sw")], ball };
}

const singers = [...document.querySelectorAll(".sing")].map((el) => {
  const { syl, ball } = wrapSyllables(el);
  return { el, syl, ball, pos: null, load: el.dataset.sing === "load" };
});

/** Centro y borde superior de cada sílaba, relativo al título. */
function measureSinger(s) {
  const box = s.el.getBoundingClientRect();
  s.fs = parseFloat(getComputedStyle(s.el).fontSize);
  s.pos = s.syl.map((sp) => {
    const r = sp.getBoundingClientRect();
    return { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height * 0.1 };
  });
}

/* Cada sílaba tiene dos tiempos, como en un karaoke de verdad:
 * primero la pelotita salta y cae sobre ella (HOP), y recién entonces la sílaba se pinta
 * de izquierda a derecha mientras la pelotita espera encima. */
const HOP = 0.4;
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

function paint(s, progress) {
  const n = s.syl.length;
  const f = progress * n;
  s.el.classList.toggle("done", progress >= 1);
  s.syl.forEach((w, k) => w.style.setProperty("--p", clamp((f - k - HOP) / (1 - HOP), 0, 1).toFixed(3)));

  const live = f > 0 && f < n;
  s.ball.classList.toggle("on", live);
  if (!live) return;
  if (!s.pos) measureSinger(s);
  const k = Math.min(n - 1, Math.floor(f));
  const u = f - k;
  const to = s.pos[k];
  const prev = s.pos[k - 1];
  // Si la sílaba anterior está en otra línea (o no hay), la pelotita entra desde la izquierda.
  const from = prev && Math.abs(prev.y - to.y) < s.fs * 0.5 ? prev : { x: to.x - s.fs * 0.9, y: to.y };
  const rest = to.y - s.fs * 0.04;
  let x = to.x, y = rest;
  if (u < HOP) {
    const t = u / HOP;
    x = from.x + (to.x - from.x) * easeInOut(t);
    // Arco bajo: no invade la línea de arriba en títulos de dos líneas.
    y = rest - s.fs * 0.22 * 4 * t * (1 - t);
  }
  s.ball.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
}

addEventListener("resize", () => singers.forEach((s) => (s.pos = null)));
document.fonts?.ready.then(() => singers.forEach((s) => (s.pos = null)));

/* Un reloj de canto: el scroll solo dice hasta qué sílaba hay que llegar, y el título
 * avanza hacia ahí a su propio ritmo, una sílaba cada SING_MS, aunque bajes rápido. */
const SING_MS = 460;
singers.forEach((s) => { s.cur = 0; s.target = 0; });
let singRaf = 0, singLast = 0;

function singTo(s, target) {
  if (target === s.target) return;
  s.target = target;
  if (!singRaf) { singLast = performance.now(); singRaf = requestAnimationFrame(singTick); }
}

function singTick(now) {
  const dt = Math.min(64, now - singLast);
  singLast = now;
  let busy = false;
  singers.forEach((s) => {
    if (s.cur === s.target) return;
    const n = s.syl.length;
    if (s.target > s.cur) s.cur = Math.min(s.target, s.cur + dt / SING_MS);
    else s.cur = Math.max(s.target, s.cur - (dt / SING_MS) * 4); // al subir, se rebobina rápido
    paint(s, s.cur / n);
    busy = true;
  });
  singRaf = busy ? requestAnimationFrame(singTick) : 0;
}

// El título principal se canta una vez al abrir la página.
const h1 = singers.find((s) => s.load);
if (h1 && !reducedMotion.matches) {
  (document.fonts?.ready ?? Promise.resolve()).then(() => setTimeout(() => singTo(h1, h1.syl.length), 300));
}

/* =====================================================================
 * La barra de la canción: línea de tiempo, parte actual y menú.
 * ===================================================================== */
const parts = [...document.querySelectorAll("[data-part]")];
const segList = $("#track-segs");
const partEl = $("#track-part"), nameEl = $("#track-name"), timeEl = $("#track-time");
const segs = parts.map((sec) => {
  const li = document.createElement("li");
  const a = document.createElement("a");
  a.href = "#" + sec.id;
  a.innerHTML = `<span class="tip">${sec.dataset.part} · ${sec.dataset.name}</span>`;
  a.setAttribute("aria-label", `${sec.dataset.part}: ${sec.dataset.name}`);
  li.append(a);
  segList.append(li);
  return { sec, li, a };
});

let geo = [];
function measureParts() {
  const total = document.documentElement.scrollHeight;
  geo = segs.map(({ sec, li }) => {
    const r = sec.getBoundingClientRect();
    const top = r.top + scrollY;
    li.style.flex = `${(r.height / total).toFixed(4)} 1 0`;
    return { top, h: r.height };
  });
}

let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    const vh = innerHeight, mid = scrollY + vh * 0.5;
    let cur = 0;
    geo.forEach((g, i) => {
      const p = clamp((mid - g.top) / g.h, 0, 1);
      segs[i].a.style.setProperty("--p", p.toFixed(3));
      if (mid >= g.top) cur = i;
    });
    const s = segs[cur].sec.dataset;
    if (partEl.textContent !== s.part) { partEl.textContent = s.part; nameEl.textContent = s.name; }
    const max = document.documentElement.scrollHeight - vh;
    const sec = Math.round((max > 0 ? scrollY / max : 0) * SONG_SECONDS);
    timeEl.textContent = `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")} / 03:30`;

    if (!reducedMotion.matches) {
      singers.forEach((sg) => {
        if (sg.load) return;
        const r = sg.el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) return;
        // Hasta qué sílaba debe llegar según cuánto se ha leído; siempre sílabas enteras.
        singTo(sg, Math.ceil(clamp((vh * 0.9 - r.top) / (vh * 0.6), 0, 1) * sg.syl.length));
      });
    }
  });
}
addEventListener("scroll", onScroll, { passive: true });
addEventListener("resize", () => { measureParts(); onScroll(); });
new ResizeObserver(() => { measureParts(); onScroll(); }).observe(document.body);
measureParts();
onScroll();

/* =====================================================================
 * Estribillo: doble letra
 * ===================================================================== */
const TRANSLATION = "Que nuestra canción resuene en el cielo nocturno";
const DUAL = {
  ja: [
    { cls: "orig", lang: "ja", tight: true, words: [
      { t: "夜|空", s: 0, e: 650 }, { t: "に", s: 650, e: 900 }, { t: "響|け", s: 900, e: 1700 },
      { t: "僕|ら", s: 1900, e: 2500 }, { t: "の", s: 2500, e: 2800 }, { t: "歌", s: 2800, e: 3800 },
    ] },
    { cls: "roman", follower: true, words: [
      { t: "yo|zo|ra", s: 0, e: 650 }, { t: "ni", s: 650, e: 900 }, { t: "hi|bi|ke", s: 900, e: 1700 },
      { t: "bo|ku|ra", s: 1900, e: 2500 }, { t: "no", s: 2500, e: 2800 }, { t: "u|ta", s: 2800, e: 3800 },
    ] },
    { cls: "trans", static: true, text: TRANSLATION },
  ],
  ko: [
    { cls: "orig", lang: "ko", words: [
      { t: "밤|하|늘|에", s: 0, e: 1100 }, { t: "울|려|라", s: 1100, e: 1900 },
      { t: "우|리", s: 2000, e: 2500 }, { t: "노|래", s: 2500, e: 3600 },
    ] },
    { cls: "roman", follower: true, words: [
      { t: "bam|ha|neu|re", s: 0, e: 1100 }, { t: "ul|lyeo|ra", s: 1100, e: 1900 },
      { t: "u|ri", s: 2000, e: 2500 }, { t: "no|rae", s: 2500, e: 3600 },
    ] },
    { cls: "trans", static: true, text: TRANSLATION },
  ],
};
const dualStage = $("#dual-karaoke");
let dual = new Karaoke(dualStage, { lines: DUAL.ja, duration: 3900, gap: 1300, effect: "barrido" });
tabs($("#dual-tabs"), (btn) => {
  dual.destroy();
  dual = new Karaoke(dualStage, { lines: DUAL[btn.dataset.lang], duration: 3900, gap: 1300, effect: "barrido" });
});

/* =====================================================================
 * Verso 2: setlist de efectos
 * ===================================================================== */
const FX_LINES = [
  { words: [
    { t: "Su|be", s: 0, e: 500 }, { t: "tu", s: 500, e: 700 }, { t: "can|ción,", s: 700, e: 1400 },
    { t: "pe|ga", s: 1500, e: 1950 }, { t: "la", s: 1950, e: 2150 }, { t: "le|tra", s: 2150, e: 2800 },
  ] },
  { words: [
    { t: "y", s: 3000, e: 3150 }, { t: "mi|ra", s: 3150, e: 3650 }, { t: "có|mo", s: 3650, e: 4100 },
    { t: "se", s: 4100, e: 4300 }, { t: "en|cien|de", s: 4300, e: 5200 },
  ] },
];
const fx = new Karaoke($("#fx-karaoke"), { lines: FX_LINES, duration: 5400, gap: 1400, effect: "eco" });
tabs($("#fx-tabs"), (btn) => fx.setEffect(btn.dataset.fx), true);

/* Precios: Web / Escritorio */
const tariff = $("#tariff");
tabs($("#price-tabs"), (btn) => { tariff.dataset.plan = btn.dataset.plan; measureParts(); });

/** Pestañas con flechas del teclado (horizontales o verticales). */
function tabs(list, onSelect, vertical = false) {
  const items = [...list.querySelectorAll("[role=tab]")];
  const nextKey = vertical ? "ArrowDown" : "ArrowRight";
  const prevKey = vertical ? "ArrowUp" : "ArrowLeft";
  const select = (btn) => {
    items.forEach((b) => {
      const on = b === btn;
      b.setAttribute("aria-selected", on);
      b.tabIndex = on ? 0 : -1;
    });
    onSelect(btn);
  };
  items.forEach((b) => {
    b.tabIndex = b.getAttribute("aria-selected") === "true" ? 0 : -1;
    b.addEventListener("click", () => select(b));
    b.addEventListener("keydown", (e) => {
      const i = items.indexOf(b);
      const next = e.key === nextKey ? items[(i + 1) % items.length]
        : e.key === prevKey ? items[(i - 1 + items.length) % items.length] : null;
      if (next) { e.preventDefault(); next.focus(); select(next); }
    });
  });
}

/* =====================================================================
 * Puente: Calibrar de verdad. La palabra amarilla se arrastra hasta la marca.
 * ===================================================================== */
const wave = $("#cal-wave");
{
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let bars = "";
  for (let i = 0; i < 100; i++) {
    const env = 0.35 + 0.65 * Math.abs(Math.sin(i / 7.5)) * (0.6 + 0.4 * Math.sin(i / 23));
    const h = Math.max(3, env * (0.45 + 0.55 * rnd()) * 56);
    bars += `<rect x="${i * 4 + 0.6}" y="${(60 - h) / 2}" width="2.4" height="${h.toFixed(1)}" rx="1.2"/>`;
  }
  wave.innerHTML = bars;
}

const calTrack = $("#cal-track"), calBlock = $("#cal-block"), calMsg = $("#cal-msg");
const editor = document.querySelector(".editor");
const TARGET = 56;
let calX = 68;

function setCal(x) {
  calX = clamp(x, 40, 84);
  const ok = Math.abs(calX - TARGET) <= 1.6;
  if (ok) calX = TARGET;
  calBlock.style.setProperty("--x", calX.toFixed(2));
  editor.classList.toggle("is-fixed", ok);
  const off = ((calX - TARGET) * 0.04).toFixed(1).replace(".", ",").replace("-", "");
  calMsg.textContent = ok ? "Listo: «tiempo» entra justo a tiempo."
    : `Tramo dudoso: «tiempo» entra ${off} s ${calX > TARGET ? "tarde" : "antes"}.`;
}
calBlock.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  calBlock.setPointerCapture(e.pointerId);
  const w = calTrack.getBoundingClientRect().width;
  const startX = e.clientX, from = calX;
  const move = (ev) => setCal(from + ((ev.clientX - startX) / w) * 100);
  const up = () => { calBlock.removeEventListener("pointermove", move); calBlock.removeEventListener("pointerup", up); };
  calBlock.addEventListener("pointermove", move);
  calBlock.addEventListener("pointerup", up);
});
calBlock.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    e.preventDefault();
    setCal(calX + (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 4 : 1));
  }
});

/* =====================================================================
 * Descarga y lista de espera
 * ===================================================================== */
if (DOWNLOAD_URL) $("#download-link").href = DOWNLOAD_URL;

const form = $("#waitlist");
const msg = $("#mail-msg");
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = form.email.value.trim();
  msg.className = "mail-msg";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    msg.textContent = "Revisa el correo: parece que le falta algo.";
    msg.classList.add("err");
    form.email.focus();
    return;
  }
  try {
    if (WAITLIST_ENDPOINT) {
      const res = await fetch(WAITLIST_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error(res.status);
    } else {
      console.warn("Lista de espera: falta configurar WAITLIST_ENDPOINT en js/main.js");
    }
    track_("waitlist_submit");
    form.reset();
    msg.textContent = "¡Listo! Te avisamos apenas salga la versión web.";
    msg.classList.add("ok");
  } catch {
    msg.textContent = "No pudimos guardar tu correo. Intenta de nuevo en un rato.";
    msg.classList.add("err");
  }
});

/* Analítica sin cookies (p. ej. Plausible o Cloudflare) */
function track_(name, props) {
  window.plausible?.(name, props ? { props } : undefined);
}
document.querySelectorAll("[data-cta]").forEach((a) =>
  a.addEventListener("click", () => track_("cta_click", { where: a.dataset.cta }))
);
