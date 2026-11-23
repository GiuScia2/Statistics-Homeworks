/* Homework 07: deterministic, dependency-free Bayesian and convergence demos. */
(() => {
  'use strict';
  const $ = id => document.getElementById('hw7-' + id);
  const fmt = (x, digits = 4) => Number(x).toFixed(digits);
  const percent = x => fmt(100 * x, 2) + '%';
  const SVG = 'http://www.w3.org/2000/svg';

  function element(tag, attrs = {}, parent) {
    const el = document.createElementNS(SVG, tag);
    Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, String(value)));
    if (parent) parent.append(el);
    return el;
  }
  function label(svg, x, y, value, attrs = {}) {
    const t = element('text', { x, y, ...attrs }, svg);
    t.textContent = value;
    return t;
  }
  function read(id, low, high, integer = false) {
    const value = Number($(id).value);
    if (!Number.isFinite(value) || value < low || value > high || (integer && !Number.isInteger(value))) {
      throw new Error(`${id}: enter a valid ${integer ? 'integer' : 'number'} from ${low} to ${high}.`);
    }
    return value;
  }
  function showError(form, error) {
    const existing = form.querySelector('[data-hw7-error]');
    if (existing) existing.remove();
    const p = document.createElement('p');
    p.dataset.hw7Error = 'true';
    p.setAttribute('role', 'alert');
    p.style.color = '#b91c1c';
    p.textContent = error.message;
    form.append(p);
  }
  function clearError(form) {
    const existing = form.querySelector('[data-hw7-error]');
    if (existing) existing.remove();
  }
  function handle(formId, fn) {
    const form = $(formId);
    form.addEventListener('submit', event => {
      event.preventDefault();
      clearError(form);
      try { fn(); } catch (error) { showError(form, error); }
    });
  }

  // ----------------------------------------------------------
  // 1. BAYES: BINARY HYPOTHESIS AND SECURITY ALERTS
  // ----------------------------------------------------------
  function updateAlert() {
    const prior = read('prior', .01, 99.99) / 100;
    const tpr = read('tpr', 0, 100) / 100;
    const fpr = read('fpr', 0, 100) / 100;
    const positive = $('evidence').value === 'positive';
    const lAttack = positive ? tpr : 1 - tpr;
    const lOther = positive ? fpr : 1 - fpr;
    const evidence = prior * lAttack + (1 - prior) * lOther;
    if (evidence < 1e-14) throw new Error('The selected evidence has probability zero under the model. Choose different inputs.');
    const posterior = prior * lAttack / evidence;
    $('prior-out').textContent = percent(prior);
    $('evidence-out').textContent = percent(evidence);
    $('posterior-out').textContent = percent(posterior);
    $('alert-math').textContent =
      `P(attack | ${positive ? 'alert' : 'no alert'}) = (${fmt(prior, 4)} × ${fmt(lAttack, 4)}) / ` +
      `(${fmt(prior, 4)} × ${fmt(lAttack, 4)} + ${fmt(1 - prior, 4)} × ${fmt(lOther, 4)}) = ${fmt(posterior, 6)}.`;
    const n = 10000;
    const counts = [
      ['Attack', n * prior * tpr, n * prior * (1 - tpr)],
      ['No attack', n * (1 - prior) * fpr, n * (1 - prior) * (1 - fpr)]
    ];
    $('confusion').replaceChildren();
    counts.forEach(row => {
      const tr = document.createElement('tr');
      row.forEach((cell, i) => {
        const td = document.createElement(i === 0 ? 'th' : 'td');
        td.textContent = i === 0 ? cell : fmt(cell, 2);
        tr.append(td);
      });
      $('confusion').append(tr);
    });
    $('alert-takeaway').textContent =
      `The posterior is ${percent(posterior)} after ${positive ? 'a positive alert' : 'no alert'}. ` +
      'Changing the base rate changes this conclusion even when test sensitivity and false-positive rate remain fixed. ' +
      'The calculation assumes the specified likelihoods apply to the population being analyzed.';
    $('alert-result').hidden = false;
    requestAnimationFrame(() => {
      $('prior-bar').style.width = (prior * 100) + '%';
      $('posterior-bar').style.width = (posterior * 100) + '%';
    });
  }

  // ----------------------------------------------------------
  // 2. BETA-BINOMIAL CONTINUOUS BAYESIAN UPDATING
  // ----------------------------------------------------------
  function logGamma(z) {
    const c = [676.5203681218851, -1259.1392167224028, 771.32342877765313,
      -176.6150291621406, 12.507343278686905, -.13857109526572012,
      9.984369578019572e-6, 1.5056327351493116e-7];
    if (z < .5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
    z -= 1;
    let x = .99999999999980993;
    for (let i = 0; i < c.length; i++) x += c[i] / (z + i + 1);
    const t = z + c.length - .5;
    return .5 * Math.log(2 * Math.PI) + (z + .5) * Math.log(t) - t + Math.log(x);
  }
  function betaPDF(x, a, b) {
    return Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log1p(-x) -
      (logGamma(a) + logGamma(b) - logGamma(a + b)));
  }
  function makeChartBase(svg, xLabels, yMax, yTicks = 4) {
    svg.replaceChildren();
    const P = { left: 55, right: 22, top: 18, bottom: 44, W: 800, H: 310 };
    const w = P.W - P.left - P.right, h = P.H - P.top - P.bottom;
    const px = x => P.left + x * w;
    const py = y => P.top + h - y / yMax * h;
    for (let i = 0; i <= yTicks; i++) {
      const y = py(yMax * i / yTicks);
      element('line', { x1: P.left, x2: P.W - P.right, y1: y, y2: y, class: 'hw7-gridline' }, svg);
      label(svg, P.left - 9, y + 4, fmt(yMax * i / yTicks, 2), { 'text-anchor': 'end' });
    }
    xLabels.forEach(([x, txt]) => label(svg, px(x), P.H - 21, txt, { 'text-anchor': 'middle' }));
    element('line', { x1: P.left, x2: P.W - P.right, y1: py(0), y2: py(0), class: 'hw7-axis' }, svg);
    return { px, py, w, h, P };
  }
  function animatedLine(svg, points, stroke, width = 3, dash = '') {
    const path = element('path', {
      d: points, stroke, 'stroke-width': width, fill: 'none',
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      class: 'hw7-animated', ...(dash ? { 'stroke-dasharray': dash } : {})
    }, svg);
    if (!dash && typeof path.getTotalLength === 'function') {
      const length = Math.ceil(path.getTotalLength());
      path.style.strokeDasharray = `${length}`;
      path.style.strokeDashoffset = `${length}`;
      path.style.setProperty('--path-length', String(length));
    } else if (dash) path.classList.remove('hw7-animated');
    return path;
  }
  function curve(points, px, py) {
    return points.map(([x, y], i) => `${i ? 'L' : 'M'}${fmt(px(x), 2)},${fmt(py(y), 2)}`).join(' ');
  }
  function updateBeta() {
    const a = read('a', .2, 100), b = read('b', .2, 100);
    const k = read('k', 0, 500, true), n = read('trials', 1, 500, true);
    if (k > n) throw new Error('The number of successes k cannot exceed n.');
    const A = a + k, B = b + n - k;
    $('beta-prior').textContent = percent(a / (a + b));
    $('mle').textContent = percent(k / n);
    $('beta-post').textContent = percent(A / (A + B));
    $('beta-explain').textContent =
      `Likelihood L(θ) ∝ θ^${k}(1−θ)^${n - k}; prior Beta(${fmt(a, 2)}, ${fmt(b, 2)}); ` +
      `posterior Beta(${fmt(A, 2)}, ${fmt(B, 2)}). The posterior mean is (${fmt(a, 2)} + ${k}) / ` +
      `(${fmt(a, 2)} + ${fmt(b, 2)} + ${n}) = ${fmt(A / (A + B), 4)}. ` +
      'A stronger prior (larger a+b) has more influence; with sufficient iid data, the likelihood increasingly dominates.';
    $('beta-result').hidden = false;
    const xs = Array.from({ length: 299 }, (_, i) => .002 + .996 * i / 298);
    const prior = xs.map(x => [x, betaPDF(x, a, b)]);
    const post = xs.map(x => [x, betaPDF(x, A, B)]);
    let yMax = Math.max(...prior.map(p => p[1]), ...post.map(p => p[1])) * 1.12;
    if (!Number.isFinite(yMax) || yMax <= 0) yMax = 5;
    const svg = $('beta-svg');
    const { px, py, P } = makeChartBase(svg, [[0, '0'], [.25, '.25'], [.5, '.50'], [.75, '.75'], [1, '1']], yMax);
    animatedLine(svg, curve(prior, px, py), '#2563eb', 3);
    animatedLine(svg, curve(post, px, py), '#059669', 3);
    label(svg, P.left + 8, P.top + 9, 'Blue: prior', { fill: '#2563eb' });
    label(svg, P.left + 125, P.top + 9, 'Green: posterior', { fill: '#059669' });
    label(svg, 430, 303, 'θ (success probability)', { 'text-anchor': 'middle' });
  }

  // ----------------------------------------------------------
  // 3. THE DYADIC "TYPEWRITER" COUNTEREXAMPLE
  // ----------------------------------------------------------
  function updateTypewriter() {
    const omega = read('omega', .001, .999);
    const level = read('level', 2, 8, true);
    const N = 2 ** (level + 1) - 1;
    const values = [], risks = [];
    for (let k = 0; k <= level; k++) {
      const hit = Math.floor(omega * (2 ** k));
      for (let j = 0; j < 2 ** k; j++) {
        values.push(j === hit ? 1 : 0);
        risks.push(2 ** (-k));
      }
    }
    const svg = $('typewriter-svg');
    const { px, py, P } = makeChartBase(svg, [[0, '1'], [.25, String(Math.round(N * .25))], [.5, String(Math.round(N * .5))], [.75, String(Math.round(N * .75))], [1, String(N)]], 1.04, 2);
    animatedLine(svg, curve(values.map((v, i) => [i / Math.max(1, N - 1), v]), px, py), '#2563eb', 2.1);
    animatedLine(svg, curve(risks.map((v, i) => [i / Math.max(1, N - 1), v]), px, py), '#059669', 2.5);
    label(svg, P.left + 9, P.top + 10, 'Blue: sample path (0 or 1)');
    label(svg, P.left + 236, P.top + 10, 'Green: P(Xₙ = 1)');
    label(svg, 430, 302, 'Sequence index n', { 'text-anchor': 'middle' });
    $('typewriter-explain').textContent =
      `At level k=${level}, each interval has probability 2^(−${level}) = ${fmt(2 ** (-level), 6)}. ` +
      `The chosen ω=${fmt(omega, 3)} is visited once at every level, including the final one. ` +
      'Consequently this sample path keeps having spikes, even though P(Xₙ = 1) and E[Xₙ²] tend to zero. ' +
      'This construction establishes convergence in probability and L², but not almost surely.';
    $('typewriter-result').hidden = false;
  }

  // ----------------------------------------------------------
  // 4. REPRODUCIBLE LLN / CLT SIMULATIONS
  // ----------------------------------------------------------
  function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
      state += 0x6D2B79F5;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function chartLLN(path, p) {
    const svg = $('lln-svg');
    svg.replaceChildren();
    const P = { left: 55, top: 20, right: 20, bottom: 46 };
    const xx = x => P.left + (x - 1) / Math.max(1, path.length - 1) * (800 - P.left - P.right);
    const yy = y => P.top + (1 - y) * (300 - P.top - P.bottom);
    [0, .25, .5, .75, 1].forEach(y => {
      element('line', { x1: P.left, x2: 800 - P.right, y1: yy(y), y2: yy(y), class: 'hw7-gridline' }, svg);
      label(svg, P.left - 12, yy(y) + 4, String(y), { 'text-anchor': 'end' });
    });
    element('line', { x1: P.left, y1: yy(p), x2: 800 - P.right, y2: yy(p), stroke: '#059669', 'stroke-width': 2, 'stroke-dasharray': '6 5' }, svg);
    animatedLine(svg, curve(path.map((y, i) => [i + 1, y]), xx, yy), '#2563eb', 2.5);
    [[1, '1'], [Math.ceil(path.length / 2), String(Math.ceil(path.length / 2))], [path.length, String(path.length)]].forEach(([n, str]) =>
      label(svg, xx(n), 283, str, { 'text-anchor': 'middle' }));
    label(svg, 430, 298, 'Number of observations n', { 'text-anchor': 'middle' });
    label(svg, 590, yy(p) - 7, 'True mean p', { fill: '#059669' });
  }
  function chartCLT(zscores) {
    const svg = $('clt-svg');
    svg.replaceChildren();
    const lo = -4, hi = 4, bins = 32, width = (hi - lo) / bins;
    const hist = new Array(bins).fill(0);
    let out = 0;
    zscores.forEach(z => {
      const idx = Math.floor((z - lo) / width);
      if (idx < 0 || idx >= bins) out++;
      else hist[idx]++;
    });
    const dens = hist.map(value => value / (zscores.length * width));
    const ymax = Math.max(.48, ...dens) * 1.12;
    const P = { left: 55, right: 22, top: 18, bottom: 45 };
    const px = x => P.left + (x - lo) / (hi - lo) * (800 - P.left - P.right);
    const py = y => P.top + (1 - y / ymax) * (300 - P.top - P.bottom);
    for (let i = 0; i <= 4; i++) {
      const y = py(ymax * i / 4);
      element('line', { x1: P.left, x2: 800 - P.right, y1: y, y2: y, class: 'hw7-gridline' }, svg);
      label(svg, P.left - 10, y + 4, fmt(ymax * i / 4, 2), { 'text-anchor': 'end' });
    }
    dens.forEach((d, i) => {
      const x = px(lo + i * width) + 1;
      const y = py(d);
      element('rect', { x, y, width: Math.max(0, px(lo + (i + 1) * width) - x - 1),
        height: Math.max(0, py(0) - y), fill: '#60a5fa', opacity: '.83', class: 'hw7-bar', style: `animation-delay:${Math.min(i * 12, 360)}ms` }, svg);
    });
    const points = Array.from({ length: 181 }, (_, i) => {
      const x = lo + i * (hi - lo) / 180;
      return [x, Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI)];
    });
    animatedLine(svg, curve(points, px, py), '#144795', 3.3);
    [-4, -2, 0, 2, 4].forEach(x => label(svg, px(x), 279, String(x), { 'text-anchor': 'middle' }));
    label(svg, 430, 299, 'Standardized Zₙ', { 'text-anchor': 'middle' });
    return out;
  }
  function updateCLT() {
    const p = read('bernoulli', .05, .95);
    const n = read('n', 20, 1500, true);
    const reps = read('reps', 100, 2500, true);
    const seed = read('seed', 1, 999999999, true);
    const rand = seededRandom(seed);
    let successes = 0;
    const means = [];
    for (let i = 1; i <= n; i++) {
      if (rand() < p) successes++;
      means.push(successes / i);
    }
    const sigma = Math.sqrt(p * (1 - p));
    const zscores = [];
    for (let j = 0; j < reps; j++) {
      let count = 0;
      for (let i = 0; i < n; i++) if (rand() < p) count++;
      zscores.push((count - n * p) / (sigma * Math.sqrt(n)));
    }
    $('finalmean').textContent = fmt(means.at(-1), 5);
    $('se').textContent = fmt(sigma / Math.sqrt(n), 6);
    $('mse').textContent = fmt(p * (1 - p) / n, 7);
    $('clt-result').hidden = false;
    chartLLN(means, p);
    const tails = chartCLT(zscores);
    const sampleMean = zscores.reduce((acc, x) => acc + x, 0) / reps;
    const sampleVariance = zscores.reduce((acc, x) => acc + (x - sampleMean) ** 2, 0) / reps;
    $('clt-explain').textContent =
      `Using seed ${seed}, the ${reps} standardized sample means have empirical mean ${fmt(sampleMean, 4)} ` +
      `and empirical variance ${fmt(sampleVariance, 4)} (normal reference: 0 and 1); ${tails} fell outside [−4,4]. ` +
      `For Bernoulli(p), the exact mean-square error of X̄ₙ is p(1−p)/n = ${fmt(p * (1 - p) / n, 7)}. ` +
      'The displayed histogram is an empirical illustration of convergence in distribution, not a proof of the CLT; ' +
      'a single path likewise cannot establish almost-sure convergence.';
  }

  handle('alert-form', updateAlert);
  handle('beta-form', updateBeta);
  handle('typewriter-form', updateTypewriter);
  handle('clt-form', updateCLT);
})();
