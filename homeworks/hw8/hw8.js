/* Homework 08 — Pearson correlation and two ordinary least-squares regressions.
   No external JavaScript libraries; calculations run locally in the browser. */
(() => {
  'use strict';

  const presets = {
    positive: {
      description: 'Synthetic cybersecurity example. X is failed logins per minute; Y is an artificial alert score. Look for an upward linear pattern, not a causal conclusion.',
      csv: 'Failed logins,Alert score\n1,2\n2,3\n3,5\n4,4\n5,7\n6,7\n7,8\n8,11\n9,10\n10,13'
    },
    negative: {
      description: 'Synthetic policy example. As the chosen detection threshold increases, the number of generated alerts tends to decrease.',
      csv: 'Detection threshold,Number of alerts\n1,14\n2,12\n3,13\n4,9\n5,10\n6,8\n7,6\n8,6\n9,3\n10,1'
    },
    nonlinear: {
      description: 'Exact counterexample: Y = X² on a symmetric dataset. Pearson r = 0 and both regression slopes are zero, yet Y depends completely on X.',
      csv: 'X,Y = X squared\n-3,9\n-2,4\n-1,1\n0,0\n1,1\n2,4\n3,9'
    },
    factorized: {
      description: 'All six combinations of X ∈ {−2,0,2} and Y ∈ {1,3} appear once: their empirical joint frequencies factorize, so sample r = 0. Population independence is not established by this sample.',
      csv: 'X,Y\n-2,1\n-2,3\n0,1\n0,3\n2,1\n2,3'
    }
  };

  const sum = xs => xs.reduce((a, b) => a + b, 0);
  const fmt = (v, d = 5) => {
    if (!Number.isFinite(v)) return 'undefined';
    if (Math.abs(v) < 1e-12) return '0';
    if (Math.abs(v) >= 1e7 || Math.abs(v) < 1e-4) return v.toExponential(3);
    return Number(v.toFixed(d)).toString();
  };
  const f6 = v => Number.isFinite(v) ? v.toFixed(6) : 'undefined';

  function parsePairs(csv) {
    const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    if (lines.length < 4) throw Error('A header and at least three data pairs are required.');
    if (lines.length > 501) throw Error('Please use at most 500 numeric pairs.');
    const header = lines.shift().split(',').map(x => x.trim());
    if (header.length !== 2 || !header.every(Boolean)) {
      throw Error('The first line must contain two comma-separated variable names, such as X,Y.');
    }
    const points = lines.map((line, i) => {
      const pair = line.split(',').map(x => x.trim());
      if (pair.length !== 2 || pair.some(x => x === '')) {
        throw Error(`Data row ${i + 1}: expected two numeric values separated by a comma.`);
      }
      const [x, y] = pair.map(Number);
      if (![x, y].every(Number.isFinite) || Math.max(Math.abs(x), Math.abs(y)) > 1e9) {
        throw Error(`Data row ${i + 1}: invalid or excessively large numeric value.`);
      }
      return { x, y };
    });
    return { names: header, points };
  }

  function analyze(csv) {
    const { names, points } = parsePairs(csv);
    const n = points.length;
    const mx = sum(points.map(p => p.x)) / n;
    const my = sum(points.map(p => p.y)) / n;
    const centered = points.map(p => ({
      ...p, dx: p.x - mx, dy: p.y - my
    }));
    const sxx = sum(centered.map(p => p.dx * p.dx));
    const syy = sum(centered.map(p => p.dy * p.dy));
    const sxy = sum(centered.map(p => p.dx * p.dy));
    if (sxx <= 1e-20 || syy <= 1e-20) {
      throw Error('Both variables need positive sample variance. Correlation and both slopes are undefined when a variable is constant.');
    }
    const byx = sxy / sxx;
    const ayx = my - byx * mx;
    const bxy = sxy / syy;
    const axy = mx - bxy * my;
    const r = Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)));
    const product = byx * bxy;
    const signedRoot = Math.sign(sxy) * Math.sqrt(Math.max(0, product));
    const ssey = sum(points.map(p => (p.y - (ayx + byx * p.x)) ** 2));
    const ssex = sum(points.map(p => (p.x - (axy + bxy * p.y)) ** 2));
    return {
      names, points, centered, n, mx, my, sxx, syy, sxy,
      byx, ayx, bxy, axy, r, r2: r * r,
      product, signedRoot, discrepancy: Math.abs(r - signedRoot),
      ssey, ssex, covariance: sxy / (n - 1),
      sdx: Math.sqrt(sxx / (n - 1)), sdy: Math.sqrt(syy / (n - 1))
    };
  }

  // Export the pure calculation layer for reproducible numerical tests.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { presets, parsePairs, analyze };
  }
  if (typeof document === 'undefined') return;

  const $ = id => document.getElementById('hw8-' + id);
  let latest = null;

  function setText(id, value) { $(id).textContent = String(value); }

  function renderTable(d) {
    const tbody = $('rows');
    tbody.replaceChildren();
    d.centered.slice(0, 16).forEach((p, i) => {
      const tr = document.createElement('tr');
      [i + 1, fmt(p.x), fmt(p.y), fmt(p.dx), fmt(p.dy), fmt(p.dx * p.dy)]
        .forEach(value => {
          const td = document.createElement('td');
          td.textContent = String(value);
          tr.appendChild(td);
        });
      tbody.appendChild(tr);
    });
    setText('row-note', d.n > 16
      ? `Displaying the first 16 of ${d.n} pairs. All ${d.n} are included in every calculation.`
      : 'All dataset observations are included in the table and calculations.');
  }

  function svgEl(tag, attrs = {}, text) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, String(value)));
    if (text !== undefined) el.textContent = String(text);
    return el;
  }

  function renderPlot(d) {
    const svg = $('plot');
    svg.replaceChildren();

    const W = 820, H = 440;
    const L = 77, R = 25, T = 25, B = 64;
    const pw = W - L - R, ph = H - T - B;
    const rawX = d.points.map(p => p.x), rawY = d.points.map(p => p.y);
    let minX = Math.min(...rawX), maxX = Math.max(...rawX);
    let minY = Math.min(...rawY), maxY = Math.max(...rawY);
    const px = Math.max((maxX - minX) * .10, 0.25);
    const py = Math.max((maxY - minY) * .12, 0.25);
    minX -= px; maxX += px;
    minY -= py; maxY += py;
    const sx = x => L + (x - minX) / (maxX - minX) * pw;
    const sy = y => T + ph - (y - minY) / (maxY - minY) * ph;

    const defs = svgEl('defs');
    const clip = svgEl('clipPath', { id: 'hw8-svg-clip' });
    clip.appendChild(svgEl('rect', { x: L, y: T, width: pw, height: ph }));
    defs.appendChild(clip);
    svg.appendChild(defs);

    for (let k = 0; k <= 5; k++) {
      const u = k / 5;
      const xx = L + u * pw;
      const yy = T + u * ph;
      svg.appendChild(svgEl('line', { x1: xx, y1: T, x2: xx, y2: T + ph, class: 'hw8-gridline' }));
      svg.appendChild(svgEl('line', { x1: L, y1: yy, x2: L + pw, y2: yy, class: 'hw8-gridline' }));
      svg.appendChild(svgEl('text', { x: xx, y: T + ph + 25, 'text-anchor': 'middle' }, fmt(minX + u * (maxX - minX), 2)));
      svg.appendChild(svgEl('text', { x: L - 12, y: yy + 4, 'text-anchor': 'end' }, fmt(maxY - u * (maxY - minY), 2)));
    }
    svg.appendChild(svgEl('line', { x1: L, y1: T, x2: L, y2: T + ph, class: 'hw8-axis' }));
    svg.appendChild(svgEl('line', { x1: L, y1: T + ph, x2: L + pw, y2: T + ph, class: 'hw8-axis' }));
    svg.appendChild(svgEl('text', { x: L + pw / 2, y: H - 12, 'text-anchor': 'middle' }, d.names[0].slice(0, 42)));
    const yLabel = svgEl('text', { transform: `translate(19 ${T + ph / 2}) rotate(-90)`, 'text-anchor': 'middle' }, d.names[1].slice(0, 42));
    svg.appendChild(yLabel);

    const plotGroup = svgEl('g', { 'clip-path': 'url(#hw8-svg-clip)' });
    // Vertical residuals for predicting Y from X.
    if ($('residual-toggle').checked) {
      d.points.forEach((p, i) => {
        const pred = d.ayx + d.byx * p.x;
        plotGroup.appendChild(svgEl('line', {
          x1: sx(p.x), y1: sy(p.y), x2: sx(p.x), y2: sy(pred),
          class: 'hw8-residual', style: `animation-delay:${Math.min(i * 16, 320)}ms`
        }));
      });
    }

    const blue = svgEl('line', {
      x1: sx(minX), y1: sy(d.ayx + d.byx * minX),
      x2: sx(maxX), y2: sy(d.ayx + d.byx * maxX),
      class: 'hw8-line', stroke: '#2563eb'
    });
    blue.appendChild(svgEl('title', {}, 'Y on X regression: minimizes vertical squared errors'));
    plotGroup.appendChild(blue);

    const orange = svgEl('line', {
      x1: sx(d.axy + d.bxy * minY), y1: sy(minY),
      x2: sx(d.axy + d.bxy * maxY), y2: sy(maxY),
      class: 'hw8-line second', stroke: '#ea8b18'
    });
    orange.appendChild(svgEl('title', {}, 'X on Y regression: minimizes horizontal squared errors'));
    plotGroup.appendChild(orange);

    d.points.forEach((p, i) => {
      const circle = svgEl('circle', {
        cx: sx(p.x), cy: sy(p.y), r: 5.2, fill: '#172d4e',
        stroke: '#fff', 'stroke-width': 1.5,
        class: 'hw8-point', style: `animation-delay:${Math.min(i * 20, 600)}ms`
      });
      circle.appendChild(svgEl('title', {}, `${d.names[0]}: ${fmt(p.x)}; ${d.names[1]}: ${fmt(p.y)}`));
      plotGroup.appendChild(circle);
    });

    const mean = svgEl('circle', {
      cx: sx(d.mx), cy: sy(d.my), r: 7.5, fill: '#059669', stroke: '#fff', 'stroke-width': 2.5
    });
    mean.appendChild(svgEl('title', {}, `Centroid (${fmt(d.mx)}, ${fmt(d.my)})`));
    plotGroup.appendChild(mean);
    svg.appendChild(plotGroup);

    const relationship = Math.abs(d.r) < .15 ? 'very weak or absent linear association' :
      Math.abs(d.r) < .5 ? 'weak-to-moderate linear association' :
        Math.abs(d.r) < .85 ? 'moderate-to-strong linear association' : 'strong linear association';
    setText('plot-summary', `For this sample, r = ${fmt(d.r, 6)} indicates ${relationship}. Both regression lines cross at the centroid (${fmt(d.mx)}, ${fmt(d.my)}). The scatterplot may reveal nonlinear structure that r misses; these labels are descriptive, not a significance test.`);
  }

  function render(d) {
    latest = d;
    setText('n', d.n);
    setText('r', f6(d.r));
    setText('r2', f6(d.r2));
    setText('cov', f6(d.covariance));
    [['meanx', d.mx], ['meany', d.my], ['sxx', d.sxx], ['syy', d.syy],
      ['sxy', d.sxy], ['sdx', d.sdx], ['sdy', d.sdy], ['ssey', d.ssey]]
      .forEach(([id, value]) => setText(id, fmt(value)));
    setText('line-y', `ŷ = ${fmt(d.ayx)} ${d.byx < 0 ? '−' : '+'} ${fmt(Math.abs(d.byx))} · X`);
    setText('line-x', `x̂ = ${fmt(d.axy)} ${d.bxy < 0 ? '−' : '+'} ${fmt(Math.abs(d.bxy))} · Y`);
    setText('slope-y', `b_yx = Sxy/Sxx = ${fmt(d.sxy)} / ${fmt(d.sxx)} = ${fmt(d.byx, 7)}`);
    setText('slope-x', `b_xy = Sxy/Syy = ${fmt(d.sxy)} / ${fmt(d.syy)} = ${fmt(d.bxy, 7)}`);
    setText('sse-y', `Minimum vertical SSE = ${fmt(d.ssey)}.`);
    setText('sse-x', `Minimum horizontal SSE = ${fmt(d.ssex)}.`);
    setText('vertical', fmt(d.ssey));
    setText('horizontal', fmt(d.ssex));
    setText('product', f6(d.product));
    setText('rsquare', f6(d.r2));
    setText('signedroot', f6(d.signedRoot));
    setText('difference', d.discrepancy.toExponential(3));
    setText('verification-text', `Verified numerically: b_yx × b_xy = ${fmt(d.product, 8)} ≈ r² = ${fmt(d.r2, 8)}. The signed square root is ${fmt(d.signedRoot, 8)}, matching Pearson r = ${fmt(d.r, 8)}. ${d.r < 0 ? 'Because both slopes are negative, choosing the positive geometric mean alone would give the WRONG sign.' : 'For this dataset the sign is nonnegative.'}`);
    renderTable(d);
    $('results').hidden = false;
    renderPlot(d);
  }

  function presetSelected(key) {
    if (presets[key]) {
      $('csv').value = presets[key].csv;
      setText('preset-description', presets[key].description);
    } else {
      setText('preset-description', 'Custom dataset: select numeric variables and interpret the direction, possible nonlinearity and subject-matter context.');
    }
    latest = null;
    $('results').hidden = true;
    $('status').classList.remove('hw8-error');
    setText('status', '');
  }

  $('preset').addEventListener('change', () => presetSelected($('preset').value));
  $('csv').addEventListener('input', () => {
    $('preset').value = 'custom';
    presetSelected('custom');
    // presetSelected(custom) intentionally does not overwrite the user's CSV.
  });
  $('form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const d = analyze($('csv').value);
      render(d);
      $('status').classList.remove('hw8-error');
      setText('status', `Analysis completed for ${d.n} numeric pairs.`);
    } catch (error) {
      latest = null;
      $('results').hidden = true;
      $('status').classList.add('hw8-error');
      setText('status', error.message);
    }
  });
  $('residual-toggle').addEventListener('change', () => {
    if (latest) renderPlot(latest);
  });
  $('download').addEventListener('click', () => {
    const blob = new Blob([$('csv').value], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hw8-data.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  presetSelected('positive');
})();
