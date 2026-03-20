/* ═══════════════════════════════════════════════════════
   CERVE STATS — analytics.js
   Carga results/index.json → fetcha cada JSON → analítica
   ═══════════════════════════════════════════════════════ */
'use strict';

// ─── CONSTANTES ──────────────────────────────────────────
const VIBES = {
  1:'💀 Imbebible', 2:'🤢 Muy mala',   3:'😞 Mala',
  4:'😐 Regular',   5:'🤷 Pasable',    6:'👌 Aceptable',
  7:'😊 Buena',     8:'😋 Muy buena',  9:'🤩 Excelente',
  10:'🏆 Obra maestra'
};

const TASTER_PALETTE = [
  [99,  179, 237],  // azul
  [246, 173, 85 ],  // naranja
  [154, 230, 180],  // verde
  [252, 129, 129],  // rojo
  [183, 148, 246],  // morado
  [120, 220, 220],  // cyan
];

// ─── DOM ─────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ─── CHARTS ──────────────────────────────────────────────
const charts = {};

// ─── HELPERS ─────────────────────────────────────────────
function avg(arr) {
  const v = arr.filter(x => x != null);
  return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : null;
}

function scoreColor(s, a = 1) {
  if (s == null) return `rgba(90,50,20,${a})`;
  if (s >= 8)   return `rgba(74,222,128,${a})`;
  if (s >= 6)   return `rgba(245,166,35,${a})`;
  if (s >= 4)   return `rgba(251,191,36,${a})`;
  return              `rgba(248,113,113,${a})`;
}

function scoreTextColor(s) {
  if (s == null) return '#6a4525';
  if (s >= 8)   return '#4ade80';
  if (s >= 6)   return '#f5a623';
  if (s >= 4)   return '#fbbf24';
  return              '#f87171';
}

function dotTextColor(s) {
  if (s == null) return '#6a4525';
  return s >= 5 ? '#0c0601' : '#fef3e2';
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-ES', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}

function escapeHTML(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── CARGA DE DATOS ──────────────────────────────────────
async function loadData() {
  // Base URL: CloudFront en producción, rutas relativas en local
  const base = (typeof CERVE_CONFIG !== 'undefined' && CERVE_CONFIG.cloudFrontUrl)
    ? CERVE_CONFIG.cloudFrontUrl
    : '';

  const manifestRes = await fetch(`${base}/results/index.json`);
  if (!manifestRes.ok) throw new Error(`Manifest HTTP ${manifestRes.status}`);
  const manifest = await manifestRes.json();

  const results = await Promise.all(
    (manifest.files || []).map(async f => {
      const r = await fetch(`${base}/results/${f}`);
      if (!r.ok) throw new Error(`Error cargando ${f}: HTTP ${r.status}`);
      return r.json();
    })
  );

  return { manifest, results };
}

// ─── ESTADÍSTICAS ────────────────────────────────────────
function buildStats(results) {
  // beersMap: id → { id, name, scores: [{taster, score, comment, date}], avg, min, max }
  const beersMap = {};
  const tastersSet = new Set();

  for (const result of results) {
    tastersSet.add(result.taster);
    for (const r of result.ratings) {
      if (!beersMap[r.id]) beersMap[r.id] = { id: r.id, name: r.name, scores: [] };
      beersMap[r.id].scores.push({
        taster:  result.taster,
        score:   r.score,
        comment: r.comment || '',
        date:    result.date
      });
    }
  }

  // Stats por cerveza
  for (const beer of Object.values(beersMap)) {
    const valid = beer.scores.filter(s => s.score != null).map(s => s.score);
    beer.avg     = avg(valid);
    beer.min     = valid.length ? Math.min(...valid) : null;
    beer.max     = valid.length ? Math.max(...valid) : null;
    beer.ratedBy = valid.length;
  }

  const rankedBeers = Object.values(beersMap)
    .sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));

  const tasters = [...tastersSet];

  // Stats por catador
  const tasterStats = {};
  for (const result of results) {
    const valid  = result.ratings.filter(r => r.score != null);
    const scores = valid.map(r => r.score);
    const best   = valid.length ? valid.reduce((a, b) => b.score > a.score ? b : a) : null;
    const worst  = valid.length ? valid.reduce((a, b) => b.score < a.score ? b : a) : null;
    tasterStats[result.taster] = {
      name:    result.taster,
      avg:     avg(scores),
      rated:   scores.length,
      total:   result.ratings.length,
      best,
      worst,
      ratings: result.ratings,
      date:    result.date
    };
  }

  // Media global
  const allScores = results
    .flatMap(r => r.ratings)
    .filter(r => r.score != null)
    .map(r => r.score);
  const globalAvg = avg(allScores);

  // Comentarios
  const comments = [];
  for (const beer of Object.values(beersMap)) {
    for (const s of beer.scores) {
      if (s.comment?.trim()) {
        comments.push({ beer: beer.name, taster: s.taster, score: s.score, comment: s.comment.trim() });
      }
    }
  }

  return { beersMap, rankedBeers, tasters, tasterStats, globalAvg, comments };
}

// ─── META / HERO ─────────────────────────────────────────
function renderMeta(manifest, results, stats) {
  $('hero-session').textContent  = manifest.session || 'Cata de Cervezas 🍺';
  $('meta-tasters').textContent  = stats.tasters.length;
  $('meta-beers').textContent    = stats.rankedBeers.length;
  $('meta-avg').textContent      = stats.globalAvg != null ? stats.globalAvg : '—';

  const dates = results.map(r => r.date).filter(Boolean).sort();
  if (dates.length) {
    const latest = dates[dates.length - 1];
    const oldest = dates[0];
    $('meta-date').textContent = oldest === latest
      ? fmtDate(latest)
      : `${fmtDate(oldest)} — ${fmtDate(latest)}`;
  }
}

// ─── PODIO ───────────────────────────────────────────────
function renderPodium(stats) {
  const top3   = stats.rankedBeers.slice(0, 3);
  const medals = ['🥇', '🥈', '🥉'];
  // orden visual: 2º izq, 1º centro, 3º derecha
  const order  = top3.length >= 3 ? [1, 0, 2]
               : top3.length === 2 ? [1, 0]
               : [0];

  const container = $('podium');
  container.innerHTML = '';

  order.forEach(rankIdx => {
    const beer = top3[rankIdx];
    if (!beer) return;

    const col = document.createElement('div');
    col.className = `pod-col pod-col--${rankIdx + 1}`;

    const miniDots = beer.scores.map((s, i) => {
      const [r, g, b] = TASTER_PALETTE[i % TASTER_PALETTE.length];
      return `<div class="pod-dot"
                   style="background:rgba(${r},${g},${b},0.85);color:#0c0601"
                   title="${escapeHTML(s.taster)}: ${s.score ?? '—'}">${s.score ?? '?'}</div>`;
    }).join('');

    col.innerHTML = `
      <div class="pod-info">
        <div class="pod-medal">${medals[rankIdx]}</div>
        <div class="pod-name">${escapeHTML(beer.name)}</div>
        <div class="pod-avg" style="color:${scoreTextColor(beer.avg)}">${beer.avg}</div>
        <div class="pod-taster-scores">${miniDots}</div>
      </div>
      <div class="pod-base">
        <span class="pod-rank">${rankIdx + 1}</span>
      </div>
    `;

    container.appendChild(col);
  });
}

// ─── RANKING CHART ───────────────────────────────────────
function renderRankingChart(stats) {
  if (charts.ranking) { charts.ranking.destroy(); }

  const wrap   = $('ranking-chart-wrap');
  const canvas = $('ranking-chart');
  const h      = Math.max(220, stats.rankedBeers.length * 50);
  wrap.style.height   = h + 'px';
  canvas.style.height = h + 'px';

  const labels   = stats.rankedBeers.map(b => b.name);
  const dataAvg  = stats.rankedBeers.map(b => b.avg ?? 0);
  const bgColors = dataAvg.map(s => scoreColor(s, 0.85));
  const bdColors = dataAvg.map(s => scoreColor(s, 1));

  const datasets = [{
    label:           'Media',
    data:            dataAvg,
    backgroundColor: bgColors,
    borderColor:     bdColors,
    borderWidth:     1.5,
    borderRadius:    6,
    borderSkipped:   false,
    barPercentage:   0.65,
    order:           0
  }];

  // Si hay varios catadores, añadir sus puntuaciones individuales
  if (stats.tasters.length > 1) {
    stats.tasters.forEach((taster, ti) => {
      const [r, g, b] = TASTER_PALETTE[ti % TASTER_PALETTE.length];
      const tasterData = stats.rankedBeers.map(beer => {
        const s = beer.scores.find(x => x.taster === taster);
        return s?.score ?? null;
      });
      datasets.push({
        label:           taster,
        data:            tasterData,
        backgroundColor: `rgba(${r},${g},${b},0.45)`,
        borderColor:     `rgba(${r},${g},${b},0.8)`,
        borderWidth:     1,
        borderRadius:    4,
        borderSkipped:   false,
        barPercentage:   0.65,
        order:           ti + 1
      });
    });
  }

  charts.ranking = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: { labels, datasets },
    options: {
      indexAxis:           'y',
      responsive:          true,
      maintainAspectRatio: false,
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
        legend: {
          display: stats.tasters.length > 1,
          labels:  { color: '#b8956a', font: { size: 12 }, boxWidth: 12, padding: 16 }
        },
        tooltip: {
          backgroundColor: '#22140a',
          borderColor:     '#553520',
          borderWidth:     1,
          titleColor:      '#fef3e2',
          bodyColor:       '#b8956a',
          padding:         10,
          callbacks: {
            label: ctx => {
              const v = ctx.raw;
              if (v == null) return ' Sin puntuar';
              const vibe = VIBES[Math.round(v)];
              return ` ${v}/10${vibe ? ' — ' + vibe : ''}`;
            }
          }
        }
      }
    }
  });
}

// ─── HEATMAP ─────────────────────────────────────────────
function renderHeatmap(stats) {
  const wrap = $('heatmap');
  wrap.innerHTML = '';

  const { rankedBeers, tasters } = stats;

  const table = document.createElement('table');
  table.className = 'hm-table';

  // Cabecera
  const thead = table.createTHead();
  const hr    = thead.insertRow();

  const cornerTh = document.createElement('th');
  cornerTh.className = 'hm-corner';
  cornerTh.textContent = '🍺 Cerveza';
  hr.appendChild(cornerTh);

  tasters.forEach(t => {
    const th = document.createElement('th');
    th.className   = 'hm-taster-th';
    th.textContent = t;
    hr.appendChild(th);
  });

  const avgTh = document.createElement('th');
  avgTh.className   = 'hm-avg-th';
  avgTh.textContent = 'Media';
  hr.appendChild(avgTh);

  // Filas
  const tbody = table.createTBody();
  rankedBeers.forEach((beer, idx) => {
    const row = tbody.insertRow();

    // Nombre
    const nameCell = row.insertCell();
    nameCell.className = 'hm-name-cell';
    nameCell.innerHTML = `<span class="hm-rank">${idx + 1}</span>${escapeHTML(beer.name)}`;

    // Score por catador
    tasters.forEach(taster => {
      const s     = beer.scores.find(x => x.taster === taster);
      const score = s?.score ?? null;
      const cell  = row.insertCell();
      cell.className         = 'hm-cell';
      cell.style.background  = scoreColor(score, 0.22);
      cell.style.color       = scoreTextColor(score);
      cell.innerHTML         = score != null
        ? `<strong>${score}</strong>`
        : `<span class="hm-cell-empty">—</span>`;
      if (s?.comment) cell.title = `"${escapeHTML(s.comment)}"`;
    });

    // Media
    const avgCell = row.insertCell();
    avgCell.className  = 'hm-avg-cell';
    avgCell.style.color = scoreTextColor(beer.avg);
    avgCell.innerHTML   = beer.avg != null ? `<strong>${beer.avg}</strong>` : '—';
  });

  wrap.appendChild(table);
}

// ─── TARJETAS POR CATADOR ────────────────────────────────
function renderTasterCards(stats) {
  const container = $('taster-cards');
  container.innerHTML = '';

  Object.values(stats.tasterStats).forEach((ts, ti) => {
    const [r, g, b] = TASTER_PALETTE[ti % TASTER_PALETTE.length];
    const card = document.createElement('div');
    card.className = 'an-taster-card';

    const miniDots = ts.ratings.map(rating => {
      const s = rating.score;
      return `<div class="tc-dot"
                   style="background:${scoreColor(s, 0.88)};color:${dotTextColor(s)}"
                   title="${escapeHTML(rating.name)}">${s ?? '?'}</div>`;
    }).join('');

    card.innerHTML = `
      <div class="tc-top">
        <div class="tc-avatar" style="color:rgba(${r},${g},${b},1);border-color:rgba(${r},${g},${b},0.6);background:rgba(${r},${g},${b},0.1)">
          ${escapeHTML(ts.name.charAt(0))}
        </div>
        <div class="tc-info">
          <div class="tc-name">${escapeHTML(ts.name)}</div>
          <div class="tc-date">${fmtDate(ts.date)} · ${ts.rated}/${ts.total} catadas</div>
        </div>
        <div class="tc-avg" style="color:${scoreTextColor(ts.avg)}">${ts.avg ?? '—'}</div>
      </div>

      <div class="tc-picks">
        ${ts.best ? `
          <div class="tc-pick">
            <span class="tc-pick-icon">🥇</span>
            <div class="tc-pick-info">
              <span class="tc-pick-lbl">Favorita</span>
              <span class="tc-pick-name">${escapeHTML(ts.best.name)}</span>
            </div>
            <span class="tc-pick-score" style="color:${scoreTextColor(ts.best.score)}">${ts.best.score}</span>
          </div>` : ''}
        ${ts.worst ? `
          <div class="tc-pick">
            <span class="tc-pick-icon">📉</span>
            <div class="tc-pick-info">
              <span class="tc-pick-lbl">Peor</span>
              <span class="tc-pick-name">${escapeHTML(ts.worst.name)}</span>
            </div>
            <span class="tc-pick-score" style="color:${scoreTextColor(ts.worst.score)}">${ts.worst.score}</span>
          </div>` : ''}
      </div>

      <div class="tc-dots">${miniDots}</div>
    `;
    container.appendChild(card);
  });
}

// ─── RADAR (≥2 catadores) ────────────────────────────────
function renderRadar(stats) {
  if (stats.tasters.length < 2) return;
  $('radar-section').classList.remove('hidden');
  if (charts.radar) charts.radar.destroy();

  const labels   = stats.rankedBeers.map(b => b.name);
  const datasets = stats.tasters.map((taster, ti) => {
    const [r, g, b] = TASTER_PALETTE[ti % TASTER_PALETTE.length];
    const data = stats.rankedBeers.map(beer => {
      const s = beer.scores.find(x => x.taster === taster);
      return s?.score ?? 0;
    });
    return {
      label:           taster,
      data,
      backgroundColor: `rgba(${r},${g},${b},0.1)`,
      borderColor:     `rgba(${r},${g},${b},0.9)`,
      borderWidth:     2,
      pointBackgroundColor: `rgba(${r},${g},${b},1)`,
      pointRadius:     4,
    };
  });

  charts.radar = new Chart($('radar-chart').getContext('2d'), {
    type: 'radar',
    data: { labels, datasets },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      scales: {
        r: {
          min: 0, max: 10,
          ticks:       { display: false },
          pointLabels: { color: '#b8956a', font: { size: 11, weight: '600' } },
          grid:        { color: 'rgba(255,255,255,0.07)' },
          angleLines:  { color: 'rgba(255,255,255,0.07)' }
        }
      },
      plugins: {
        legend: { labels: { color: '#b8956a', font: { size: 12 }, boxWidth: 12 } },
        tooltip: {
          backgroundColor: '#22140a',
          borderColor:     '#553520',
          borderWidth:     1,
          titleColor:      '#fef3e2',
          bodyColor:       '#b8956a',
          padding:         10
        }
      }
    }
  });
}

// ─── COMENTARIOS ─────────────────────────────────────────
function renderComments(stats) {
  if (!stats.comments.length) return;
  $('comments-section').classList.remove('hidden');

  const list = $('comments-list');
  list.innerHTML = '';

  stats.comments.forEach(c => {
    const card = document.createElement('div');
    card.className = 'an-comment-card';
    card.innerHTML = `
      <div class="cc-top">
        <span class="cc-beer">${escapeHTML(c.beer)}</span>
        <span class="cc-score" style="color:${scoreTextColor(c.score)}">${c.score}/10</span>
      </div>
      <blockquote class="cc-text">${escapeHTML(c.comment)}</blockquote>
      <div class="cc-taster">— ${escapeHTML(c.taster)}</div>
    `;
    list.appendChild(card);
  });
}

// ─── INIT ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const { manifest, results } = await loadData();
    const stats = buildStats(results);

    renderMeta(manifest, results, stats);
    renderPodium(stats);
    renderRankingChart(stats);
    renderHeatmap(stats);
    renderTasterCards(stats);
    renderRadar(stats);
    renderComments(stats);

    $('an-loading').classList.add('hidden');
    $('an-main').classList.remove('hidden');

  } catch (e) {
    console.error(e);
    $('an-loading').classList.add('hidden');
    $('an-error').classList.remove('hidden');
  }
});
