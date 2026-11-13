
/* HOMEWORK 06 — Contingency Tables & Statistical Independence */

(() => {

    'use strict';

    // =====================================================
    // 1. PREDEFINED DATASETS
    // =====================================================

    const presets = {

        auth: {
            description:
                'Synthetic cybersecurity example: 150 independent hypothetical accounts, classified by authentication method and incident status. The counts are illustrative, not empirical security evidence.',

            csv:
                'Authentication method,Incident status,Count\n' +
                'Password,No incident,15\n' +
                'Password,Incident,35\n' +
                'SMS authentication,No incident,30\n' +
                'SMS authentication,Incident,20\n' +
                'Multi-factor authentication,No incident,40\n' +
                'Multi-factor authentication,Incident,10'
        },

        independent: {
            description:
                'Synthetic exact factorization: both groups have identical conditional proportions (60% / 40%). This is sample independence, not proof about a population.',

            csv:
                'Group,Outcome,Count\n' +
                'A,Yes,30\n' +
                'A,No,20\n' +
                'B,Yes,15\n' +
                'B,No,10'
        },

        weak: {
            description:
                'Synthetic weak association: small differences between conditional distributions. Compare the p-value with the chosen significance level.',

            csv:
                'Group,Outcome,Count\n' +
                'A,Yes,27\n' +
                'A,No,23\n' +
                'B,Yes,23\n' +
                'B,No,27'
        },

        sparse: {
            description:
                'Synthetic small sample: some expected counts are too small for a reliable asymptotic chi-square test. Notice the assumption warning.',

            csv:
                'Group,Outcome,Count\n' +
                'A,Yes,4\n' +
                'A,No,0\n' +
                'B,Yes,1\n' +
                'B,No,3'
        }
    };

    const $ = id => document.getElementById('hw6-' + id);

    const sum = array =>
        array.reduce((total, value) => total + value, 0);

    const fixed = (value, decimals = 3) =>
        value.toFixed(decimals);

    const pct = value =>
        (100 * value).toFixed(2) + '%';

    const pv = value => {
        if (value === 0) return '< 1e-300 (underflow)';
        if (value < 0.0001) return value.toExponential(4);
        return value.toFixed(6);
    };

    const palette = [
        '#2563eb', '#d97706', '#059669', '#9333ea',
        '#db2777', '#0891b2', '#64748b', '#b45309',
        '#4f46e5', '#65a30d', '#be123c', '#0f766e',
        '#7c3aed', '#c2410c', '#0369a1', '#a21caf',
        '#15803d', '#475569', '#ca8a04', '#4338ca'
    ];

    // =====================================================
    // 2. CSV PARSER
    // =====================================================

    function parseCSV(text) {

        text = text.replace(/^\uFEFF/, '');

        const rows = [];

        let row = [];
        let field = '';
        let quoted = false;
        let closed = false;

        const pushField = () => {
            row.push(field.trim());
            field = '';
            closed = false;
        };

        const pushRow = () => {
            pushField();

            if (row.some(value => value !== '')) {
                rows.push(row);
            }

            row = [];
        };

        for (let i = 0; i < text.length; i++) {

            const ch = text[i];

            if (quoted) {

                if (ch === '"') {

                    if (text[i + 1] === '"') {
                        field += '"';
                        i++;
                    } else {
                        quoted = false;
                        closed = true;
                    }

                } else {
                    field += ch;
                }

                continue;
            }

            if (ch === ',') {
                pushField();
                continue;
            }

            if (ch === '\n' || ch === '\r') {

                if (ch === '\r' && text[i + 1] === '\n') {
                    i++;
                }

                pushRow();
                continue;
            }

            if (closed) {

                if (!/\s/.test(ch)) {
                    throw Error(
                        'Unexpected character after a quoted CSV field.'
                    );
                }

                continue;
            }

            if (ch === '"') {

                if (field.trim()) {
                    throw Error(
                        'Unexpected quote inside an unquoted CSV field.'
                    );
                }

                field = '';
                quoted = true;

            } else {
                field += ch;
            }
        }

        if (quoted) {
            throw Error('Unclosed quoted CSV field.');
        }

        if (field !== '' || row.length || closed) {
            pushRow();
        }

        return rows;
    }

    // =====================================================
    // 3. LOG-GAMMA FUNCTION
    // Lanczos approximation
    // =====================================================

    function logGamma(z) {

        const coefficients = [
            676.5203681218851,
            -1259.1392167224028,
            771.3234287776531,
            -176.6150291621406,
            12.507343278686905,
            -0.13857109526572012,
            9.984369578019572e-6,
            1.5056327351493116e-7
        ];

        if (z < 0.5) {
            return Math.log(Math.PI)
                - Math.log(Math.sin(Math.PI * z))
                - logGamma(1 - z);
        }

        z--;

        let x = 0.99999999999980993;

        for (let i = 0; i < coefficients.length; i++) {
            x += coefficients[i] / (z + i + 1);
        }

        const t = z + coefficients.length - 0.5;

        return 0.5 * Math.log(2 * Math.PI)
            + (z + 0.5) * Math.log(t)
            - t
            + Math.log(x);
    }

    // =====================================================
    // 4. REGULARIZED UPPER INCOMPLETE GAMMA
    //
    // Chi-square p-value:
    // p = Q(df / 2, chiSquare / 2)
    // =====================================================

    function gammaQ(a, x) {

        if (x === 0) return 1;

        const scale = Math.exp(
            -x + a * Math.log(x) - logGamma(a)
        );

        const eps = 1e-14;
        const tiny = 1e-300;

        // Series expansion for the lower tail.

        if (x < a + 1) {

            let ap = a;
            let term = 1 / a;
            let total = term;

            for (let i = 1; i <= 10000; i++) {

                ap++;
                term *= x / ap;
                total += term;

                if (Math.abs(term) < Math.abs(total) * eps) {
                    return Math.max(
                        0,
                        Math.min(1, 1 - total * scale)
                    );
                }
            }

        } else {

            // Continued fraction for the upper tail.

            let b = x + 1 - a;
            let c = 1 / tiny;
            let d = 1 / b;
            let h = d;

            for (let i = 1; i <= 10000; i++) {

                const an = -i * (i - a);

                b += 2;

                d = an * d + b;

                if (Math.abs(d) < tiny) {
                    d = tiny;
                }

                c = b + an / c;

                if (Math.abs(c) < tiny) {
                    c = tiny;
                }

                d = 1 / d;

                const delta = d * c;

                h *= delta;

                if (Math.abs(delta - 1) < eps) {
                    return Math.max(
                        0,
                        Math.min(1, scale * h)
                    );
                }
            }
        }

        throw Error(
            'Numerical p-value calculation did not converge.'
        );
    }

    // =====================================================
    // 5. MAIN STATISTICAL ANALYSIS
    // =====================================================

    function analyze(text) {

        const rows = parseCSV(text);
        const header = rows.shift();

        if (
            !header ||
            ![2, 3].includes(header.length) ||
            !header[0] ||
            !header[1] ||
            (
                header.length === 3 &&
                header[2].toLowerCase() !== 'count'
            )
        ) {
            throw Error(
                'Use a two-column header or a three-column header ending in Count.'
            );
        }

        if (!rows.length || rows.length > 100000) {
            throw Error(
                'Enter between 1 and 100,000 data records.'
            );
        }

        const xs = [];
        const fs = [];

        const xm = new Map();
        const fm = new Map();

        const entries = [];

        let n = 0;

        // Discover categories and collect observations.

        rows.forEach((row, i) => {

            if (
                row.length !== header.length ||
                !row[0] ||
                !row[1]
            ) {
                throw Error(
                    `Record ${i + 1}: expected ${header.length} fields with nonempty categories.`
                );
            }

            const k = header.length === 2
                ? 1
                : Number(row[2]);

            if (
                header.length === 3 &&
                (
                    !/^\d+$/.test(row[2]) ||
                    !Number.isSafeInteger(k)
                )
            ) {
                throw Error(
                    `Record ${i + 1}: Count must be a non-negative integer.`
                );
            }

            if (k === 0) return;

            n += k;

            if (n > 10000000) {
                throw Error('Total count exceeds 10 million.');
            }

            if (!xm.has(row[0])) {
                xm.set(row[0], xs.length);
                xs.push(row[0]);
            }

            if (!fm.has(row[1])) {
                fm.set(row[1], fs.length);
                fs.push(row[1]);
            }

            if (xs.length > 20 || fs.length > 20) {
                throw Error(
                    'Use no more than 20 observed categories per variable.'
                );
            }

            entries.push([
                xm.get(row[0]),
                fm.get(row[1]),
                k
            ]);
        });

        if (xs.length < 2 || fs.length < 2) {
            throw Error(
                'Both variables need at least two categories with positive counts.'
            );
        }

        // Observed contingency table.

        const o = xs.map(() =>
            fs.map(() => 0)
        );

        entries.forEach(([i, j, k]) => {
            o[i][j] += k;
        });

        // Row and column marginal totals.

        const r = o.map(sum);

        const c = fs.map((_, j) =>
            sum(o.map(row => row[j]))
        );

        // Expected frequencies under independence.
        // Eij = Ri * Cj / N

        const e = o.map((row, i) =>
            row.map((_, j) =>
                r[i] * c[j] / n
            )
        );

        // Individual cell contributions to chi-square.

        const contributions = o.map((row, i) =>
            row.map((value, j) =>
                (value - e[i][j]) ** 2 / e[i][j]
            )
        );

        // Pearson chi-square statistic.

        const chi = sum(
            contributions.map(sum)
        );

        // Degrees of freedom.

        const df =
            (xs.length - 1) * (fs.length - 1);

        // Right-tail probability.

        const p = gammaQ(df / 2, chi / 2);

        // Cramer's V: descriptive association strength.

        const v = Math.sqrt(
            chi /
            (n * Math.min(xs.length - 1, fs.length - 1))
        );

        return {
            names: header.slice(0, 2),
            xs,
            fs,
            o,
            r,
            c,
            n,
            e,
            contributions,
            chi,
            df,
            p,
            v
        };
    }

    // Allow numerical testing with Node.js.

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            analyze,
            gammaQ,
            parseCSV,
            presets
        };
    }

    if (typeof document === 'undefined') return;

    // =====================================================
    // 6. DOM AND TABLE HELPERS
    // =====================================================

    function node(tag, cls, text) {

        const element = document.createElement(tag);

        if (cls) {
            element.className = cls;
        }

        if (text !== undefined) {
            element.textContent = text;
        }

        return element;
    }

    function table(
        target,
        d,
        matrix,
        format,
        rowTotals,
        colTotals,
        grandTotal
    ) {

        const t = node('table', 'hw6-table');
        const head = node('thead');
        const headRow = node('tr');

        const corner = node(
            'th',
            '',
            d.names[0] + ' / ' + d.names[1]
        );

        corner.scope = 'col';
        headRow.append(corner);

        d.fs.forEach(f => {

            const h = node('th', '', f);
            h.scope = 'col';
            headRow.append(h);
        });

        if (rowTotals) {

            const h = node(
                'th',
                'hw6-total',
                'Total'
            );

            h.scope = 'col';
            headRow.append(h);
        }

        head.append(headRow);
        t.append(head);

        const body = node('tbody');

        d.xs.forEach((x, i) => {

            const tr = node('tr');
            const h = node('th', '', x);

            h.scope = 'row';
            tr.append(h);

            matrix[i].forEach(value => {
                tr.append(
                    node('td', '', format(value))
                );
            });

            if (rowTotals) {
                tr.append(
                    node(
                        'td',
                        'hw6-total',
                        format(rowTotals[i])
                    )
                );
            }

            body.append(tr);
        });

        if (colTotals) {

            const tr = node('tr', 'hw6-total');
            const h = node('th', '', 'Total');

            h.scope = 'row';
            tr.append(h);

            colTotals.forEach(value => {
                tr.append(
                    node('td', '', format(value))
                );
            });

            if (rowTotals) {
                tr.append(
                    node('td', '', format(grandTotal))
                );
            }

            body.append(tr);
        }

        t.append(body);
        target.replaceChildren(t);
    }

    // =====================================================
    // 7. ANIMATED CHARTS
    // =====================================================

    function chartRow(label) {

        const row = node(
            'div',
            'hw6-chart-row'
        );

        row.append(
            node('div', 'hw6-chart-label', label)
        );

        return row;
    }

    function renderCharts(d) {

        const chart = $('conditional-chart');
        const legend = $('legend');

        chart.replaceChildren();
        legend.replaceChildren();

        // Chart 1: conditional distributions.

        [...d.xs, 'Overall marginal'].forEach((label, i) => {

            const values = i < d.xs.length
                ? d.o[i].map(value => value / d.r[i])
                : d.c.map(value => value / d.n);

            const row = chartRow(label);

            const track = node(
                'div',
                'hw6-bar-track'
            );

            const fill = node(
                'div',
                'hw6-stack-fill'
            );

            fill.style.width = '100%';

            values.forEach((value, j) => {

                const segment = node(
                    'div',
                    'hw6-segment'
                );

                segment.style.width =
                    (value * 100) + '%';

                segment.style.background =
                    palette[j];

                segment.title =
                    d.fs[j] + ': ' + pct(value);

                fill.append(segment);
            });

            track.append(fill);
            row.append(track);
            chart.append(row);
        });

        // Conditional chart legend.

        d.fs.forEach((f, j) => {

            const label = node('span');
            const color = node('i');

            color.style.background = palette[j];

            label.append(
                color,
                document.createTextNode(f)
            );

            legend.append(label);
        });

        // Chart 2: observed vs expected.

        const comp = $('comparison');

        comp.replaceChildren();

        comp.classList.toggle(
            'hw6-chart-compact',
            d.xs.length * d.fs.length > 12
        );

        const max = Math.max(
            ...d.o.flat(),
            ...d.e.flat()
        );

        d.xs.forEach((x, i) => {

            d.fs.forEach((f, j) => {

                const row = chartRow(
                    x + ' / ' + f
                );

                const pair = node(
                    'div',
                    'hw6-pair'
                );

                const values = [

                    [
                        d.o[i][j],
                        '#2563eb',
                        String(d.o[i][j])
                    ],

                    [
                        d.e[i][j],
                        '#d97706',
                        fixed(d.e[i][j], 2)
                    ]
                ];

                values.forEach(
                    ([value, color, display]) => {

                        const line = node(
                            'div',
                            'hw6-single'
                        );

                        const track = node(
                            'div',
                            'hw6-bar-track'
                        );

                        const fill = node(
                            'div',
                            'hw6-fill'
                        );

                        fill.style.width =
                            (100 * value / max) + '%';

                        fill.style.background = color;

                        track.append(fill);

                        line.append(
                            track,
                            node(
                                'span',
                                'hw6-bar-number',
                                display
                            )
                        );

                        pair.append(line);
                    }
                );

                row.append(pair);
                comp.append(row);
            });
        });

        // Use the shared chart animation system
        // already present in the project.

        if (window.ChartMotion) {

            window.ChartMotion.observeBars(
                chart,
                '.hw6-stack-fill',
                90
            );

            window.ChartMotion.observeBars(
                comp,
                '.hw6-fill',
                45
            );
        }
    }

    // =====================================================
    // 8. DISPLAY THE STATISTICAL RESULTS
    // =====================================================

    function render(d, alpha) {

        const {
            o,
            e,
            r,
            c,
            n,
            xs,
            fs,
            names,
            contributions,
            chi,
            df,
            p,
            v
        } = d;

        // Observed counts.

        table(
            $('observed'),
            d,
            o,
            String,
            r,
            c,
            n
        );

        // Joint and marginal relative frequencies.

        table(
            $('joint'),
            d,
            o.map(row =>
                row.map(value => value / n)
            ),
            pct,
            r.map(value => value / n),
            c.map(value => value / n),
            1
        );

        // Conditional distribution of F given X.

        table(
            $('row'),
            d,
            o.map((row, i) =>
                row.map(value => value / r[i])
            ),
            pct,
            r.map(() => 1),
            null,
            null
        );

        // Conditional distribution of X given F.

        table(
            $('col'),
            d,
            o.map(row =>
                row.map((value, j) => value / c[j])
            ),
            pct,
            null,
            c.map(() => 1),
            null
        );

        $('row-title').textContent =
            `Conditional Frequencies: ${names[1]} given ${names[0]}`;

        $('col-title').textContent =
            `Reverse Conditional Frequencies: ${names[0]} given ${names[1]}`;

        // Expected counts.

        table(
            $('expected'),
            d,
            e,
            value => fixed(value, 3),
            r,
            c,
            n
        );

        // Cell contributions to chi-square.

        table(
            $('contributions'),
            d,
            contributions,
            value => fixed(value, 4),
            contributions.map(sum),
            fs.map((_, j) =>
                sum(contributions.map(row => row[j]))
            ),
            chi
        );

        // Show the calculation for the first cell.

        $('example').textContent =
            `Worked example (${xs[0]} / ${fs[0]}): ` +
            `E = ${r[0]} × ${c[0]} / ${n} = ${fixed(e[0][0])}; ` +
            `contribution = (${o[0][0]} − ${fixed(e[0][0])})² ` +
            `/ ${fixed(e[0][0])} = ${fixed(contributions[0][0], 4)}.`;

        // Summary metrics.

        $('n').textContent =
            n.toLocaleString('en-US');

        $('chi').textContent =
            fixed(chi, 6);

        $('df').textContent = df;

        $('p').textContent = pv(p);

        $('v').textContent =
            fixed(v, 4);

        // Check expected-count assumptions.

        const small =
            e.flat().filter(value => value < 5).length;

        const minimum =
            Math.min(...e.flat());

        const reject = p <= alpha;

        if (small > 0) {

            $('warning').textContent =
                `Assumption warning: ${small} of ` +
                `${xs.length * fs.length} expected counts ` +
                `are below 5 (minimum ${fixed(minimum, 3)}). ` +
                `The asymptotic p-value may be unreliable; ` +
                `do not use it alone for an inferential conclusion.`;

        } else {

            $('warning').textContent =
                `Expected-count check: all ${xs.length * fs.length} ` +
                `expected counts are at least 5 ` +
                `(minimum ${fixed(minimum, 3)}). ` +
                `Independent observations and a suitable sampling ` +
                `design must still be established.`;
        }

        $('decision').classList.toggle(
            'caution',
            small > 0
        );

        // Interpret the result.

        if (small > 0) {

            $('decision').textContent =
                `Tentative comparison only: ` +
                `${reject ? 'p ≤ α' : 'p > α'} ` +
                `at α = ${alpha}. Sparse counts limit inference.`;

            $('interpretation').textContent =
                `The sample shows ` +
                `${chi === 0
                    ? 'exact factorization'
                    : 'a discrepancy from expected counts'}, ` +
                `but the approximation is uncertain. ` +
                `Collect more independent observations or ` +
                `use an appropriate exact test.`;

        } else if (reject) {

            $('decision').textContent =
                `Reject H₀ at α = ${alpha} (p ≤ α).`;

            $('interpretation').textContent =
                `The data provide statistical evidence of association ` +
                `between ${names[0]} and ${names[1]} under the stated ` +
                `assumptions. This is not evidence of causation; ` +
                `a causal claim requires additional design or assumptions.`;

        } else {

            $('decision').textContent =
                `Fail to reject H₀ at α = ${alpha} (p > α).`;

            $('interpretation').textContent =
                `There is insufficient evidence to conclude that ` +
                `${names[0]} and ${names[1]} are associated. ` +
                (
                    chi === 0
                        ? 'The sample factorizes exactly, but this does not establish population independence.'
                        : 'Failure to reject does not establish independence.'
                );
        }

        // Find the largest chi-square contribution.

        let largest = [0, 0];

        contributions.forEach((row, i) => {

            row.forEach((value, j) => {

                if (
                    value >
                    contributions[largest[0]][largest[1]]
                ) {
                    largest = [i, j];
                }
            });
        });

        const [i, j] = largest;

        $('largest').textContent =
            chi === 0

                ? 'All cell contributions are zero.'

                : 'Largest contribution: ' +
                  xs[i] + ' / ' + fs[j] +
                  ' (' + fixed(contributions[i][j], 4) + '). ' +
                  'Observed ' + o[i][j] +
                  ', expected ' + fixed(e[i][j], 3) + '.';

        // Reveal the results before starting animations.

        $('results').hidden = false;

        renderCharts(d);
    }

    // =====================================================
    // 9. USER INTERFACE EVENTS
    // =====================================================

    function setPreset(key) {

        if (presets[key]) {

            $('data').value =
                presets[key].csv;

            $('description').textContent =
                presets[key].description;

        } else {

            $('description').textContent =
                'Custom data: use independent observations and interpret results according to your sampling design.';
        }

        $('results').hidden = true;
        $('status').textContent = '';

        $('status').classList.remove(
            'hw6-error'
        );
    }

    $('preset').addEventListener('change', () => {

        setPreset($('preset').value);
    });

    $('data').addEventListener('input', () => {

        $('preset').value = 'custom';

        $('description').textContent =
            'Custom data: use independent observations and interpret results according to your sampling design.';

        $('results').hidden = true;

        $('status').textContent = '';

        $('status').classList.remove(
            'hw6-error'
        );
    });

    $('alpha').addEventListener('change', () => {

        $('results').hidden = true;

        $('status').textContent =
            'Run the analysis again for the new significance level.';
    });

    $('form').addEventListener('submit', event => {

        event.preventDefault();

        $('status').classList.remove(
            'hw6-error'
        );

        try {

            const d = analyze(
                $('data').value
            );

            render(
                d,
                Number($('alpha').value)
            );

            $('status').textContent =
                `Analysis completed: ` +
                `${d.n.toLocaleString('en-US')} observations, ` +
                `${d.xs.length} × ${d.fs.length} table.`;

        } catch (error) {

            $('results').hidden = true;

            $('status').classList.add(
                'hw6-error'
            );

            $('status').textContent =
                error.message;
        }
    });

    // Download the currently selected CSV dataset.

    $('download').addEventListener('click', () => {

        const blob = new Blob(
            [$('data').value],
            { type: 'text/csv;charset=utf-8' }
        );

        const url = URL.createObjectURL(blob);

        const a = node('a');

        a.href = url;
        a.download = 'hw6-dataset.csv';

        document.body.append(a);

        a.click();
        a.remove();

        setTimeout(
            () => URL.revokeObjectURL(url),
            1000
        );
    });

    // Initial state:
    // Load example data without running the analysis.

    setPreset('auth');

})();
