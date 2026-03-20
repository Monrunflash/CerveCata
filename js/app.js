/* ═══════════════════════════════════════════════════════
   CERVE CATA — app.js
   Lógica principal: pantallas, puntuación, cookies, export
   ═══════════════════════════════════════════════════════ */
'use strict';

// ─── CONSTANTES ──────────────────────────────────────────
const COOKIE_KEY  = 'cervecata_v1';
const COOKIE_DAYS = 7;

const VIBES = {
  1:  '💀 Imbebible',
  2:  '🤢 Muy mala',
  3:  '😞 Mala',
  4:  '😐 Regular tirando a mala',
  5:  '🤷 Pasable',
  6:  '👌 Aceptable',
  7:  '😊 Buena',
  8:  '😋 Muy buena',
  9:  '🤩 Excelente',
  10: '🏆 Obra maestra cervecera'
};

// ─── ESTADO ──────────────────────────────────────────────
const state = {
  sessionName: 'Cata de Cervezas',
  beers:       [],
  tasterName:  '',
  sessionDate: '',
  currentIdx:  0,
  ratings:     {}  // { beerId: { score: number|null, comment: string } }
};

let chart = null; // instancia de Chart.js

// ─── DOM HELPERS ─────────────────────────────────────────
const $  = (id)  => document.getElementById(id);
const $$ = (sel) => document.querySelector(sel);

// ─── COOKIES ─────────────────────────────────────────────
const Cookies = {
  set(key, value, days = COOKIE_DAYS) {
    try {
      const exp = new Date(Date.now() + days * 864e5).toUTCString();
      document.cookie = `${key}=${encodeURIComponent(JSON.stringify(value))};expires=${exp};path=/;SameSite=Strict`;
    } catch (e) { console.warn('Cookie write error:', e); }
  },

  get(key) {
    const m = document.cookie.match(new RegExp(`(?:^|; )${key}=([^;]*)`));
    if (!m) return null;
    try { return JSON.parse(decodeURIComponent(m[1])); }
    catch { return null; }
  },

  delete(key) {
    document.cookie = `${key}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Strict`;
  }
};

// ─── UTILIDADES ──────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-ES', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}

function average(scores) {
  if (!scores.length) return null;
  return +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
}

function scoreClass(s) {
  if (s == null) return 'score-none';
  if (s >= 8)  return 'score-high';
  if (s >= 5)  return 'score-medium';
  return 'score-low';
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function ratedCount() {
  return Object.values(state.ratings).filter(r => r?.score != null).length;
}

// ─── TRANSICIÓN DE PANTALLAS ─────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    if (s.classList.contains('active')) {
      s.classList.add('slide-out');
      s.classList.remove('active');
      setTimeout(() => s.classList.remove('slide-out'), 350);
    }
  });
  setTimeout(() => {
    const next = $(id);
    next.classList.add('active');
    next.scrollTop = 0;
  }, 60);
}

// ─── BURBUJAS BIENVENIDA ─────────────────────────────────
function spawnBubbles() {
  const c = $('bubbles');
  if (!c) return;
  for (let i = 0; i < 20; i++) {
    const b    = document.createElement('div');
    b.className = 'bubble';
    const size  = 6 + Math.random() * 28;
    b.style.cssText = `
      width:${size}px; height:${size}px;
      left:${Math.random() * 100}%;
      animation-duration:${7 + Math.random() * 14}s;
      animation-delay:-${Math.random() * 18}s;
    `;
    c.appendChild(b);
  }
}

// ─── CARGAR CERVEZAS ─────────────────────────────────────
async function loadBeers() {
  try {
    const res  = await fetch('beers.json');
    const data = await res.json();
    state.beers       = data.beers   || [];
    state.sessionName = data.session || 'Cata de Cervezas';
  } catch (e) {
    console.warn('No se pudo cargar beers.json, usando fallback:', e);
    state.beers = [
      { id: 1, name: 'Cerveza #1' },
      { id: 2, name: 'Cerveza #2' },
      { id: 3, name: 'Cerveza #3' }
    ];
    state.sessionName = 'Cata Demo';
  }
}

// ─── COMPROBAR SESIÓN GUARDADA ───────────────────────────
function checkResume() {
  const saved = Cookies.get(COOKIE_KEY);
  if (!saved?.tasterName) return;

  const n = Object.values(saved.ratings || {}).filter(r => r?.score != null).length;
  $('resume-name').textContent  = saved.tasterName;
  $('resume-detail').textContent =
    `${n} de ${state.beers.length} cervezas puntuadas · ${fmtDate(saved.date)}`;
  $('resume-card').classList.remove('hidden');
}

// ─── VINCULAR EVENTOS BIENVENIDA ─────────────────────────
function bindWelcome() {
  $('btn-start').addEventListener('click', startTasting);
  $('input-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') startTasting();
  });

  $('btn-resume').addEventListener('click', resumeTasting);

  $('btn-discard').addEventListener('click', () => {
    Cookies.delete(COOKIE_KEY);
    $('resume-card').classList.add('hidden');
    $('input-name').focus();
  });
}

// ─── INICIAR CATA ────────────────────────────────────────
function startTasting() {
  const input = $('input-name');
  const name  = input.value.trim();

  if (!name) {
    input.classList.add('shake');
    input.focus();
    setTimeout(() => input.classList.remove('shake'), 500);
    return;
  }

  state.tasterName  = name;
  state.sessionDate = new Date().toISOString().split('T')[0];
  state.currentIdx  = 0;
  state.ratings     = {};

  saveSession();
  mountTastingScreen();
  showScreen('screen-tasting');
}

// ─── RETOMAR CATA ────────────────────────────────────────
function resumeTasting() {
  const saved = Cookies.get(COOKIE_KEY);
  if (!saved) return;

  state.tasterName  = saved.tasterName;
  state.sessionDate = saved.date     || new Date().toISOString().split('T')[0];
  state.currentIdx  = saved.currentIdx ?? 0;
  state.ratings     = saved.ratings  || {};

  mountTastingScreen();
  showScreen('screen-tasting');
}

// ─── MONTAR PANTALLA CATA ────────────────────────────────
function mountTastingScreen() {
  $('header-name').textContent = state.tasterName;
  $('total-count').textContent = state.beers.length;

  // Crear botones 1-10
  const grid = $('score-grid');
  grid.innerHTML = '';
  for (let i = 1; i <= 10; i++) {
    const btn       = document.createElement('button');
    btn.className   = 'score-btn';
    btn.dataset.score = i;
    btn.textContent = i;
    btn.setAttribute('aria-label', `Puntuación ${i}`);
    btn.addEventListener('click', () => selectScore(i));
    grid.appendChild(btn);
  }

  // Crear dots
  buildDots();

  // Navegación
  $('btn-prev').addEventListener('click',   () => navigate(-1));
  $('btn-next').addEventListener('click',   () => navigate(+1));
  $('btn-finish').addEventListener('click', finishTasting);

  // Autoguardar comentario con debounce
  $('beer-comment').addEventListener('input', debounce(saveCurrentComment, 450));

  renderBeer(state.currentIdx);
}

// ─── CONSTRUIR DOTS ──────────────────────────────────────
function buildDots() {
  const c = $('progress-dots');
  c.innerHTML = '';
  state.beers.forEach((_, i) => {
    const dot       = document.createElement('div');
    dot.className   = 'dot';
    dot.dataset.idx = i;
    dot.title       = state.beers[i].name;
    dot.addEventListener('click', () => {
      saveCurrentComment();
      state.currentIdx = i;
      saveSession();
      renderBeer(i);
    });
    c.appendChild(dot);
  });
}

// ─── RENDERIZAR CERVEZA ACTUAL ───────────────────────────
function renderBeer(idx) {
  const beer   = state.beers[idx];
  const rating = state.ratings[beer.id] || {};
  const total  = state.beers.length;

  // Cabecera
  $('header-progress').textContent = `${idx + 1}/${total}`;
  $('progress-fill').style.width   = `${((idx + 1) / total) * 100}%`;

  // Imagen
  const imgEl   = $('beer-img');
  const imgWrap = $('beer-img-wrap');
  if (beer.image) {
    imgEl.src = beer.image;
    imgEl.alt = beer.name;
    imgWrap.classList.remove('no-image');
  } else {
    imgEl.src = '';
    imgWrap.classList.add('no-image');
  }

  // Info cerveza
  $('beer-badge').textContent = `#${String(beer.id).padStart(2, '0')}`;
  $('beer-title').textContent = beer.name;

  // Puntuación
  document.querySelectorAll('.score-btn').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.score) === rating.score);
  });
  $('score-current').textContent = rating.score != null ? rating.score : '—';
  $('score-vibe').textContent    = rating.score != null ? VIBES[rating.score] : '';

  // Check de "ya puntuado"
  $('beer-check').classList.toggle('visible', rating.score != null);

  // Comentario
  $('beer-comment').value = rating.comment || '';

  // Botones prev/next
  $('btn-prev').disabled = idx === 0;
  if (idx === total - 1) {
    $('btn-next').disabled   = true;
    $('btn-next').textContent = 'Último';
  } else {
    $('btn-next').disabled   = false;
    $('btn-next').textContent = 'Siguiente →';
  }

  // Dots
  document.querySelectorAll('.dot').forEach((dot, i) => {
    const bId = state.beers[i].id;
    dot.classList.toggle('current', i === idx);
    dot.classList.toggle('rated',   !!state.ratings[bId]?.score);
  });

  // Botón finalizar
  const done = ratedCount();
  $('rated-count').textContent = done;
  $('total-count').textContent = total;
  $('btn-finish').classList.toggle('all-done', done === total);
}

// ─── SELECCIONAR PUNTUACIÓN ──────────────────────────────
function selectScore(score) {
  const beer = state.beers[state.currentIdx];
  if (!state.ratings[beer.id]) state.ratings[beer.id] = {};
  state.ratings[beer.id].score = score;

  // Actualizar UI inmediatamente
  document.querySelectorAll('.score-btn').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.score) === score);
  });
  $('score-current').textContent = score;
  $('score-vibe').textContent    = VIBES[score];
  $('beer-check').classList.add('visible');

  // Dots y contador
  const dot = document.querySelector(`.dot[data-idx="${state.currentIdx}"]`);
  if (dot) dot.classList.add('rated');

  const done = ratedCount();
  $('rated-count').textContent = done;
  $('btn-finish').classList.toggle('all-done', done === state.beers.length);

  saveSession();
}

// ─── GUARDAR COMENTARIO ACTUAL ───────────────────────────
function saveCurrentComment() {
  const beer    = state.beers[state.currentIdx];
  const comment = $('beer-comment').value.trim();
  if (!state.ratings[beer.id]) state.ratings[beer.id] = {};
  state.ratings[beer.id].comment = comment;
  saveSession();
}

// ─── NAVEGAR ENTRE CERVEZAS ──────────────────────────────
function navigate(delta) {
  saveCurrentComment();
  const next = state.currentIdx + delta;
  if (next < 0 || next >= state.beers.length) return;
  state.currentIdx = next;
  saveSession();
  renderBeer(next);
}

// ─── GUARDAR SESIÓN EN COOKIE ────────────────────────────
function saveSession() {
  Cookies.set(COOKIE_KEY, {
    tasterName:  state.tasterName,
    date:        state.sessionDate,
    currentIdx:  state.currentIdx,
    ratings:     state.ratings,
    sessionName: state.sessionName
  });
}

// ─── FINALIZAR CATA ──────────────────────────────────────
function finishTasting() {
  saveCurrentComment();

  const done  = ratedCount();
  const total = state.beers.length;

  if (done < total) {
    const falta = total - done;
    const ok = confirm(
      `Faltan ${falta} cerveza${falta > 1 ? 's' : ''} por puntuar.\n¿Finalizar igualmente?`
    );
    if (!ok) return;
  }

  mountResults();
  showScreen('screen-results');
}

// ─── MONTAR PANTALLA RESULTADOS ──────────────────────────
function mountResults() {
  $('results-by').textContent = `Por ${state.tasterName} · ${fmtDate(state.sessionDate)}`;

  const scores = state.beers
    .map(b => state.ratings[b.id]?.score)
    .filter(s => s != null);

  const avg = average(scores);
  $('stat-avg').textContent = avg != null ? avg : '—';

  if (scores.length) {
    const sorted   = [...state.beers].filter(b => state.ratings[b.id]?.score != null);
    const bestBeer = sorted.reduce((a, b) =>
      (state.ratings[b.id].score > state.ratings[a.id].score) ? b : a
    );
    const worstBeer = sorted.reduce((a, b) =>
      (state.ratings[b.id].score < state.ratings[a.id].score) ? b : a
    );

    $('stat-best').textContent  = `${state.ratings[bestBeer.id].score}/10`;
    $('stat-worst').textContent = `${state.ratings[worstBeer.id].score}/10`;
  }

  // Lista
  buildResultsList();

  // Gráfica (altura dinámica según nº de cervezas)
  const chartH = Math.max(180, state.beers.length * 42);
  $('chart-wrapper').style.height = chartH + 'px';
  buildChart();

  // Botones
  $('btn-download').onclick     = downloadJSON;
  $('btn-whatsapp').onclick     = shareWhatsApp;
  $('btn-new-tasting').onclick  = newTasting;

  // Auto-subida a S3 si está configurado
  autoUploadToS3();
}

// ─── LISTA DE RESULTADOS ─────────────────────────────────
function buildResultsList() {
  const list = $('results-list');
  list.innerHTML = '';

  // Ordenar por puntuación descendente para los emojis de podio
  const ranked = [...state.beers]
    .filter(b => state.ratings[b.id]?.score != null)
    .sort((a, b) => state.ratings[b.id].score - state.ratings[a.id].score);

  const medalEmojis = ['🥇', '🥈', '🥉'];
  const rankMap     = {};
  ranked.forEach((b, i) => { rankMap[b.id] = i; });

  state.beers.forEach(beer => {
    const r     = state.ratings[beer.id] || {};
    const score = r.score;
    const rank  = rankMap[beer.id];
    const medal = rank != null && rank < 3 ? medalEmojis[rank] : `#${beer.id}`;

    const item = document.createElement('div');
    item.className = 'result-item';
    item.innerHTML = `
      <div class="result-rank">${medal}</div>
      <div class="result-info">
        <div class="result-name">${escapeHTML(beer.name)}</div>
        ${r.comment ? `<div class="result-comment">"${escapeHTML(r.comment)}"</div>` : ''}
      </div>
      <div class="result-score ${scoreClass(score)}">
        ${score != null ? `${score}<small>/10</small>` : '—'}
      </div>
    `;
    list.appendChild(item);
  });
}

// ─── GRÁFICA CHART.JS ────────────────────────────────────
function buildChart() {
  const ctx = $('results-chart').getContext('2d');
  if (chart) { chart.destroy(); chart = null; }

  const labels = state.beers.map(b => b.name);
  const data   = state.beers.map(b => state.ratings[b.id]?.score ?? 0);

  const colors = data.map(s => {
    if (s >= 8)  return 'rgba(245, 166, 35, 0.85)';
    if (s >= 5)  return 'rgba(251, 191, 36, 0.75)';
    if (s > 0)   return 'rgba(248, 113, 113, 0.75)';
    return 'rgba(90, 50, 20, 0.4)';
  });

  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor:     colors.map(c => c.replace(/[\d.]+\)$/, '1)')),
        borderWidth:     1.5,
        borderRadius:    6,
        borderSkipped:   false
      }]
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      indexAxis:           'y',
      scales: {
        x: {
          min: 0, max: 10,
          grid:   { color: 'rgba(255,255,255,0.05)' },
          ticks:  { color: '#7a5535', font: { size: 11 } },
          border: { color: 'rgba(255,255,255,0.08)' }
        },
        y: {
          grid:   { display: false },
          ticks:  { color: '#b8956a', font: { size: 12, weight: '600' } },
          border: { display: false }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#22140a',
          borderColor:     '#553520',
          borderWidth:     1,
          titleColor:      '#fef3e2',
          bodyColor:       '#b8956a',
          padding:         10,
          callbacks: {
            label: ctx => {
              const s = ctx.raw;
              return s > 0 ? ` ${s}/10 — ${VIBES[s]}` : ' Sin puntuar';
            }
          }
        }
      }
    }
  });
}

// ─── CONSTRUIR JSON DE RESULTADOS ──────────────────────
function buildOutputFilename() {
  return `cata_${state.tasterName.replace(/\s+/g, '_').toLowerCase()}_${state.sessionDate}.json`;
}

function buildOutputJSON() {
  const scores     = state.beers.map(b => state.ratings[b.id]?.score).filter(s => s != null);
  const avg        = average(scores);
  const ratingsArr = state.beers.map(b => {
    const r = state.ratings[b.id] || {};
    return { id: b.id, name: b.name, score: r.score ?? null, comment: r.comment || '' };
  });
  const bestBeer  = scores.length
    ? ratingsArr.filter(r => r.score != null).reduce((a, b) => b.score > a.score ? b : a)
    : null;
  const worstBeer = scores.length
    ? ratingsArr.filter(r => r.score != null).reduce((a, b) => b.score < a.score ? b : a)
    : null;
  return {
    session: state.sessionName,
    taster:  state.tasterName,
    date:    state.sessionDate,
    ratings: ratingsArr,
    summary: {
      average: avg,
      rated:   scores.length,
      total:   state.beers.length,
      best:    bestBeer  ? { id: bestBeer.id,  name: bestBeer.name,  score: bestBeer.score  } : null,
      worst:   worstBeer ? { id: worstBeer.id, name: worstBeer.name, score: worstBeer.score } : null
    }
  };
}

// ─── DESCARGAR JSON ──────────────────────────────────────
function downloadJSON() {
  const blob = new Blob([JSON.stringify(buildOutputJSON(), null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = buildOutputFilename();
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── SUBIDA AUTOMÁTICA A S3 ──────────────────────────────
async function autoUploadToS3() {
  if (typeof CERVE_CONFIG === 'undefined' || !CERVE_CONFIG?.s3?.enabled) return;

  const statusEl = $('s3-status');
  const show = (mod, msg) => {
    statusEl.className = `s3-status s3-status--${mod}`;
    statusEl.innerHTML = msg;
    statusEl.classList.remove('hidden');
  };

  try {
    show('uploading', '⏫ Subiendo resultados a S3…');
    await S3.uploadResult(buildOutputFilename(), JSON.stringify(buildOutputJSON(), null, 2), CERVE_CONFIG);
    show('success', '✓ Guardado en S3 correctamente');
  } catch (e) {
    console.error('S3 upload error:', e);
    show('error', `✗ Error al subir a S3 — ${e.message}`);
  }
}

// ─── COMPARTIR POR WHATSAPP ──────────────────────────────
function shareWhatsApp() {
  const scores = state.beers.map(b => state.ratings[b.id]?.score).filter(s => s != null);
  const avg    = average(scores);

  const lines = [
    `🍺 *${state.sessionName}*`,
    `👤 ${state.tasterName}  •  📅 ${fmtDate(state.sessionDate)}`,
    '',
    '*Puntuaciones:*'
  ];

  state.beers.forEach(b => {
    const r       = state.ratings[b.id] || {};
    const score   = r.score != null ? `${r.score}/10` : 'sin puntuar';
    const comment = r.comment ? `\n   _"${r.comment}"_` : '';
    lines.push(`${b.id}. *${b.name}*: ${score}${comment}`);
  });

  if (scores.length) {
    const best = [...state.beers]
      .filter(b => state.ratings[b.id]?.score != null)
      .reduce((a, b) => state.ratings[b.id].score > state.ratings[a.id].score ? b : a);

    lines.push('');
    lines.push(`📊 *Media: ${avg}/10*`);
    lines.push(`🥇 *Mejor: ${best.name} (${state.ratings[best.id].score}/10)*`);
  }

  const url = `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

// ─── NUEVA CATA ──────────────────────────────────────────
function newTasting() {
  Cookies.delete(COOKIE_KEY);
  state.ratings    = {};
  state.currentIdx = 0;
  state.tasterName = '';

  if (chart) { chart.destroy(); chart = null; }

  // Resetear formulario
  $('input-name').value = '';
  $('resume-card').classList.add('hidden');

  showScreen('screen-welcome');
  setTimeout(() => $('input-name').focus(), 400);
}

// ─── ESCAPE HTML ─────────────────────────────────────────
function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── ARRANQUE ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  spawnBubbles();
  await loadBeers();
  checkResume();
  bindWelcome();
});
