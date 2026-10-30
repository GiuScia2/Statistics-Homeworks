
/* ==========================================
   HOMEWORK 03 — STOCHASTIC SIMULATION
   ========================================== */

(() => {
    "use strict";

    const form = document.getElementById(
        "hw3-simulation-form"
    );

    const modelInput = document.getElementById("hw3-model");
    const nInput = document.getElementById("hw3-n");
    const mInput = document.getElementById("hw3-m");
    const pInput = document.getElementById("hw3-p");
    const seedInput = document.getElementById("hw3-seed");

    const statusOutput = document.getElementById("hw3-status");

    const totalChart = document.getElementById(
        "hw3-total-chart"
    );

    const averageChart = document.getElementById(
        "hw3-average-chart"
    );

    const normalizedChart = document.getElementById(
        "hw3-normalized-chart"
    );

    const statsBody = document.getElementById(
        "hw3-stats-body"
    );

    const theorySummary = document.getElementById(
        "hw3-theory-summary"
    );

    const MAX_DISPLAYED_TRAJECTORIES = 30;

    let currentSimulation = null;


    /* ======================================
       RANDOM NUMBER GENERATOR
       ====================================== */

    function createRandomGenerator(seed) {
        let state = seed >>> 0;

        return function () {
            state = (state + 0x6D2B79F5) >>> 0;

            let t = state;

            t = Math.imul(
                t ^ (t >>> 15),
                t | 1
            );

            t ^= t + Math.imul(
                t ^ (t >>> 7),
                t | 61
            );

            return (
                (t ^ (t >>> 14)) >>> 0
            ) / 4294967296;
        };
    }


    /* ======================================
       INPUTS
       ====================================== */

    function updateModelControls() {
        const isRademacher =
            modelInput.value === "rademacher";

        pInput.disabled = isRademacher;
    }

    function readParameters() {
        const model = modelInput.value;

        const n = Number(nInput.value);
        const m = Number(mInput.value);
        const p = Number(pInput.value);
        const seed = Number(seedInput.value);

        if (
            !Number.isInteger(n) ||
            n < 10 ||
            n > 2000
        ) {
            throw new Error(
                "n must be between 10 and 2000."
            );
        }

        if (
            !Number.isInteger(m) ||
            m < 20 ||
            m > 2000
        ) {
            throw new Error(
                "m must be between 20 and 2000."
            );
        }

        if (
            pInput.value.trim() === "" ||
            !Number.isFinite(p) ||
            p < 0 ||
            p > 1
        ) {
            throw new Error(
                "p must be between 0 and 1."
            );
        }

        if (
            seedInput.value.trim() === "" ||
            !Number.isInteger(seed) ||
            seed < 0 ||
            seed > 4294967295
        ) {
            throw new Error(
                "Enter a valid non-negative random seed."
            );
        }

        return {
            model,
            n,
            m,
            p,
            seed
        };
    }


    /* ======================================
       STOCHASTIC SIMULATION
       ====================================== */

       
function simulate(parameters) {
    const { model, n, m, p, seed } = parameters;
    const random = createRandomGenerator(seed);

    const trajectories = [];
    const finalScores = new Array(m);

    const checkpoints = [
        1, 2, 5, 10, 20, 50, 100,
        200, 500, 1000, 2000
    ].filter(step => step <= n);

    const checkpointScores = new Map(
        checkpoints.map(step => [step, new Array(m)])
    );

    const meanIncrement =
        model === "bernoulli" ? p : 0;

    const varianceIncrement =
        model === "bernoulli" ? p * (1 - p) : 1;

    for (let attacker = 0; attacker < m; attacker++) {
        let score = 0;

        const path = attacker < MAX_DISPLAYED_TRAJECTORIES
            ? [0]
            : null;

        for (let step = 1; step <= n; step++) {
            const u = random();

            const increment = model === "bernoulli"
                ? (u < p ? 1 : 0)
                : (u < 0.5 ? 1 : -1);

            score += increment;

            if (checkpointScores.has(step)) {
                checkpointScores.get(step)[attacker] = score;
            }

            if (path) {
                path.push(score);
            }
        }

        finalScores[attacker] = score;

        if (path) {
            trajectories.push(path);
        }
    }

    return {
        ...parameters,
        trajectories,
        finalScores,
        checkpoints,
        checkpointScores,
        meanIncrement,
        varianceIncrement
    };
}

   

/* ==========================================
   DISTRIBUTIONS, LLN AND CLT
   ========================================== */

function drawCanvas(
    canvas, xDomain, yDomain, series, options = {}
) {
    const width = Math.max(
        320,
        canvas.getBoundingClientRect().width || 700
    );

    const height = 270;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);

    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const margin = {
        left: 58,
        right: 18,
        top: 18,
        bottom: 37
    };

    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;

    const [xMin, xMax] = xDomain;
    const [yMin, yMax] = yDomain;

    const tx = x => options.logX ? Math.log10(x) : x;
    const ty = y => options.logY ? Math.log10(y) : y;

    const x0 = tx(xMin);
    const x1 = tx(xMax);
    const y0 = ty(yMin);
    const y1 = ty(yMax);

    const X = x =>
        margin.left + (tx(x) - x0) / (x1 - x0 || 1) * w;

    const Y = y =>
        margin.top + (y1 - ty(y)) / (y1 - y0 || 1) * h;

    ctx.font = "11px Segoe UI, Arial, sans-serif";
    ctx.textAlign = "right";

    // Axes and horizontal grid.
    for (let i = 0; i <= 4; i++) {
        const transformed = y0 + (y1 - y0) * i / 4;

        const value = options.logY
            ? 10 ** transformed
            : transformed;

        const py = Y(value);

        ctx.strokeStyle = "#e2e8f0";
        ctx.lineWidth = 1;

        ctx.beginPath();
        ctx.moveTo(margin.left, py);
        ctx.lineTo(width - margin.right, py);
        ctx.stroke();

        ctx.fillStyle = "#64748b";

        const label = options.logY
            ? value.toExponential(1)
            : options.percentY
                ? (value * 100).toFixed(0) + "%"
                : value.toFixed(2);

        ctx.fillText(label, margin.left - 8, py + 4);
    }

    ctx.textAlign = "center";
    ctx.fillStyle = "#64748b";

    for (let i = 0; i <= 4; i++) {
        const transformed = x0 + (x1 - x0) * i / 4;

        const value = options.logX
            ? 10 ** transformed
            : transformed;

        const label = options.logX
            ? Math.round(value).toString()
            : value.toFixed(1);

        ctx.fillText(
            label,
            margin.left + w * i / 4,
            height - 16
        );
    }

    ctx.fillText(
        options.xLabel || "n",
        margin.left + w / 2,
        height - 2
    );

    // Lines.
    ctx.save();
    ctx.beginPath();
    ctx.rect(margin.left, margin.top, w, h);
    ctx.clip();

    for (const line of series) {
        ctx.strokeStyle = line.color;
        ctx.lineWidth = line.width || 2;
        ctx.setLineDash(line.dashed ? [6, 5] : []);
        ctx.beginPath();

        let hasPoint = false;

        for (const [x, y] of line.points) {
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
                continue;
            }

            if (options.logY && y <= 0) continue;

            if (!hasPoint) {
                ctx.moveTo(X(x), Y(y));
            } else {
                ctx.lineTo(X(x), Y(y));
            }

            hasPoint = true;
        }

        if (hasPoint) ctx.stroke();
    }

    ctx.restore();
    ctx.setLineDash([]);
}


/* ==========================================
   HISTOGRAMS
   ========================================== */

function drawHistogram(canvas, values) {
    const bins = 24;

    const low = Math.min(...values);
    const high = Math.max(...values);

    const span = Math.max(high - low, 1e-6);

    const a = low - span * 0.06;
    const b = high + span * 0.06;

    const counts = new Array(bins).fill(0);

    for (const value of values) {
        const index = Math.min(
            bins - 1,
            Math.floor((value - a) / (b - a) * bins)
        );

        counts[index]++;
    }

    const frequencies = counts.map(
        count => count / values.length
    );

    const maximum =
        Math.max(...frequencies) * 1.15 || 1;

    const width = Math.max(
        320,
        canvas.getBoundingClientRect().width || 700
    );

    const height = 270;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);

    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    const left = 58;
    const right = 18;
    const top = 18;
    const bottom = 37;

    const w = width - left - right;
    const h = height - top - bottom;

    ctx.clearRect(0, 0, width, height);

    ctx.font = "11px Segoe UI, Arial, sans-serif";
    ctx.textAlign = "right";

    // Percentage grid.
    for (let i = 0; i <= 4; i++) {
        const frequency = maximum * i / 4;
        const y = top + h * (1 - i / 4);

        ctx.strokeStyle = "#e2e8f0";
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(width - right, y);
        ctx.stroke();

        ctx.fillStyle = "#64748b";

        ctx.fillText(
            (100 * frequency).toFixed(0) + "%",
            left - 8,
            y + 4
        );
    }

    // Histogram bars.
    ctx.fillStyle = "#2563eb";

    for (let i = 0; i < bins; i++) {
        const binWidth = w / bins;

        const barHeight =
            frequencies[i] / maximum * h;

        ctx.fillRect(
            left + i * binWidth + 1,
            top + h - barHeight,
            Math.max(1, binWidth - 2),
            barHeight
        );
    }

    // X-axis.
    ctx.fillStyle = "#64748b";
    ctx.textAlign = "center";

    for (let i = 0; i <= 4; i++) {
        ctx.fillText(
            (a + (b - a) * i / 4).toFixed(2),
            left + w * i / 4,
            height - 16
        );
    }

    ctx.fillText(
        "Final score value",
        left + w / 2,
        height - 2
    );
}


/* ==========================================
   NORMAL DISTRIBUTION UTILITIES
   ========================================== */

// Approximation of the standard normal CDF.
function gaussianCdf(x) {
    const z = Math.abs(x);
    const t = 1 / (1 + 0.2316419 * z);

    const polynomial = t * (
        0.319381530 +
        t * (
            -0.356563782 +
            t * (
                1.781477937 +
                t * (
                    -1.821255978 +
                    t * 1.330274429
                )
            )
        )
    );

    const tail =
        Math.exp(-z * z / 2) /
        Math.sqrt(2 * Math.PI) *
        polynomial;

    return x >= 0 ? 1 - tail : tail;
}

function sortedStandardized(scores, step, data) {
    const mean = data.meanIncrement;
    const variance = data.varianceIncrement;

    const denominator = Math.sqrt(step * variance);

    return scores
        .map(score => (score - step * mean) / denominator)
        .sort((a, b) => a - b);
}

// Empirical cumulative distribution function.
function fractionLE(sorted, x) {
    let low = 0;
    let high = sorted.length;

    while (low < high) {
        const mid = (low + high) >>> 1;

        if (sorted[mid] <= x) {
            low = mid + 1;
        } else {
            high = mid;
        }
    }

    return low / sorted.length;
}

// Maximum distance between empirical and normal CDFs.
function ksDistance(sorted) {
    const m = sorted.length;
    let maximum = 0;

    for (let i = 0; i < m; i++) {
        const theoretical = gaussianCdf(sorted[i]);

        maximum = Math.max(
            maximum,
            Math.abs(i / m - theoretical),
            Math.abs((i + 1) / m - theoretical)
        );
    }

    return maximum;
}


/* ==========================================
   TABLE UTILITIES
   ========================================== */

function addStatsRow(tbody, values) {
    const row = document.createElement("tr");

    for (const value of values) {
        const cell = document.createElement("td");
        cell.textContent = String(value);
        row.appendChild(cell);
    }

    tbody.appendChild(row);
}

function drawMessageChart(canvas, message) {
    const width = Math.max(
        320,
        canvas.getBoundingClientRect().width || 700
    );

    const height = 270;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);

    const ctx = canvas.getContext("2d");

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = "#52647d";
    ctx.font = "14px Segoe UI, Arial, sans-serif";
    ctx.textAlign = "center";

    ctx.fillText(message, width / 2, height / 2);
}


/* ==========================================
   RENDER DISTRIBUTIONS, LLN AND CLT
   ========================================== */

function renderAdvanced(data) {
    const {
        n, m, finalScores,
        checkpoints, checkpointScores,
        meanIncrement: mu,
        varianceIncrement: sigma2
    } = data;

    // Section 03: score distributions.
    drawHistogram(
        document.getElementById("hw3-hist-total"),
        finalScores
    );

    drawHistogram(
        document.getElementById("hw3-hist-average"),
        finalScores.map(value => value / n)
    );

    drawHistogram(
        document.getElementById("hw3-hist-normalized"),
        finalScores.map(value => value / Math.sqrt(n))
    );

    document.getElementById("hw3-hist-note").textContent =
        `Each histogram uses the final observations from all ` +
        `${m} attackers (n = ${n}). The vertical axis shows ` +
        `the percentage of attackers in each bin.`;

    // Section 04: LLN.
    const epsilon = 0.15;

    const llnRows = document.getElementById("hw3-lln-rows");
    llnRows.replaceChildren();

    const empiricalProbabilities = [];
    const chebyshevBounds = [];

    for (const step of checkpoints) {
        const averages = checkpointScores
            .get(step)
            .map(score => score / step);

        const sample = calculateStatistics(averages);

        const deviationProbability =
            averages.filter(
                value => Math.abs(value - mu) > epsilon
            ).length / m;

        const chebyshevBound = Math.min(
            1,
            sigma2 / (step * epsilon * epsilon)
        );

        empiricalProbabilities.push([
            step,
            deviationProbability
        ]);

        chebyshevBounds.push([
            step,
            chebyshevBound
        ]);

        addStatsRow(llnRows, [
            step,
            sample.mean.toFixed(4),
            sample.variance.toFixed(5),
            (sigma2 / step).toFixed(5),
            (100 * deviationProbability).toFixed(1) + "%"
        ]);
    }

    drawCanvas(
        document.getElementById("hw3-lln-chart"),
        [checkpoints[0], checkpoints.at(-1)],
        [0, 1],
        [
            {
                color: "#2563eb",
                points: empiricalProbabilities
            },
            {
                color: "#ea580c",
                points: chebyshevBounds,
                dashed: true
            }
        ],
        {
            logX: true,
            percentY: true
        }
    );

    // Variance scaling.
    const varianceChart = document.getElementById(
        "hw3-variance-chart"
    );

    if (sigma2 > 0) {
        const values = checkpoints.flatMap(
            step => [
                sigma2 * step,
                sigma2 / step,
                sigma2
            ]
        );

        drawCanvas(
            varianceChart,
            [checkpoints[0], checkpoints.at(-1)],
            [
                Math.min(...values) / 1.5,
                Math.max(...values) * 1.5
            ],
            [
                {
                    color: "#2563eb",
                    points: checkpoints.map(
                        step => [step, sigma2 * step]
                    )
                },
                {
                    color: "#ea580c",
                    points: checkpoints.map(
                        step => [step, sigma2 / step]
                    )
                },
                {
                    color: "#059669",
                    points: checkpoints.map(
                        step => [step, sigma2]
                    )
                }
            ],
            {
                logX: true,
                logY: true
            }
        );
    } else {
        drawMessageChart(
            varianceChart,
            "All variances are zero for p = 0 or p = 1."
        );
    }

    document.getElementById("hw3-lln-note").textContent =
        `The expected increment is ${mu.toFixed(3)}. ` +
        `The theoretical variance of Sₙ/n is ` +
        `${sigma2.toFixed(3)}/n. ` +
        `Convergence is evaluated with ε = ${epsilon}. ` +
        `Increasing m improves simulation precision.`;

    // Section 06: final summary.
    document.getElementById("hw3-final-insight")
        .textContent =
        `Current experiment: ${m} independent attackers, ` +
        `${n} systems, model ${data.model}. ` +
        `E[Sₙ] = ${(n * mu).toFixed(2)}, ` +
        `Var(Sₙ) = ${(n * sigma2).toFixed(2)}, ` +
        `Var(Sₙ/n) = ${(sigma2 / n).toFixed(5)}, ` +
        `Var(Sₙ/√n) = ${sigma2.toFixed(3)}. ` +
        `Increasing n concentrates the average around ` +
        `${mu.toFixed(2)}, while increasing m improves ` +
        `the precision of the empirical estimates.`;

    // Section 05: CLT.
    const cltRows = document.getElementById("hw3-clt-rows");
    const cltLegend = document.getElementById(
        "hw3-clt-legend"
    );

    cltRows.replaceChildren();
    cltLegend.replaceChildren();

    const cltChart = document.getElementById(
        "hw3-clt-chart"
    );

    if (sigma2 === 0) {
        drawMessageChart(
            cltChart,
            "CLT standardization is undefined."
        );

        document.getElementById("hw3-clt-note").textContent =
            "For Bernoulli p = 0 or p = 1, " +
            "the increment variance is zero. " +
            "A non-degenerate normal approximation " +
            "does not apply.";

        return;
    }

    // Select three increasing system sizes.
    const available = checkpoints.filter(step => step >= 5);

    const indices = [
        0,
        Math.floor((available.length - 1) / 2),
        available.length - 1
    ];

    const selected = [
        ...new Set(indices.map(index => available[index]))
    ];

    const colors = [
        "#2563eb",
        "#059669",
        "#ea580c"
    ];

    const xValues = Array.from(
        { length: 121 },
        (_, index) => -3 + 6 * index / 120
    );

    const curves = [
        {
            color: "#111827",
            width: 2.5,
            dashed: true,
            points: xValues.map(
                x => [x, gaussianCdf(x)]
            )
        }
    ];

    selected.forEach((step, index) => {
        const standardized = sortedStandardized(
            checkpointScores.get(step),
            step,
            data
        );

        curves.push({
            color: colors[index],
            points: xValues.map(
                x => [x, fractionLE(standardized, x)]
            )
        });

        addStatsRow(cltRows, [
            step,
            m,
            ksDistance(standardized).toFixed(4)
        ]);
    });

    drawCanvas(
        cltChart,
        [-3, 3],
        [0, 1],
        curves,
        { xLabel: "Standardized score z" }
    );

    const legendItems = [
        {
            label: "Standard normal CDF",
            color: "#111827"
        },
        ...selected.map((step, index) => ({
            label: `n = ${step}`,
            color: colors[index]
        }))
    ];

    for (const item of legendItems) {
        const element = document.createElement("span");

        element.className = "hw3-legend-item";
        element.style.setProperty(
            "--legend-color",
            item.color
        );

        element.textContent = item.label;
        cltLegend.appendChild(element);
    }

    document.getElementById("hw3-clt-note").textContent =
        data.model === "rademacher"
            ? "Rademacher: Zₙ = Sₙ/√n. The empirical " +
              "CDFs are compared with the standard normal. " +
              "The Kolmogorov distance measures their " +
              "maximum difference; smaller is better."
            : "Bernoulli: the standard normal comparison " +
              "uses Zₙ = (Sₙ − np)/√(np(1−p)), " +
              "not the uncentered Sₙ/√n. " +
              "This comparison requires 0 < p < 1.";
}


    /* ======================================
       STATISTICS
       ====================================== */

    function calculateStatistics(values) {
        const count = values.length;

        const mean = values.reduce(
            (sum, value) => sum + value,
            0
        ) / count;

        const squaredDifferences = values.reduce(
            (sum, value) =>
                sum + (value - mean) ** 2,
            0
        );

        const variance =
            squaredDifferences / (count - 1);

        return { mean, variance };
    }

    function formatNumber(value) {
        return Number(value).toFixed(4);
    }

    function addCell(row, text) {
        const cell = document.createElement("td");
        cell.textContent = text;
        row.appendChild(cell);
    }

    function renderStatistics(data) {
        const { n, finalScores } = data;

        const mu = data.meanIncrement;
        const variance = data.varianceIncrement;

        const quantities = [
            {
                label: "Sₙ",
                values: finalScores,
                expectedMean: n * mu,
                theoreticalVariance: n * variance
            },
            {
                label: "Sₙ / n",
                values: finalScores.map(
                    score => score / n
                ),
                expectedMean: mu,
                theoreticalVariance: variance / n
            },
            {
                label: "Sₙ / √n",
                values: finalScores.map(
                    score => score / Math.sqrt(n)
                ),
                expectedMean: mu * Math.sqrt(n),
                theoreticalVariance: variance
            }
        ];

        statsBody.replaceChildren();

        for (const quantity of quantities) {
            const observed = calculateStatistics(
                quantity.values
            );

            const row = document.createElement("tr");

            addCell(row, quantity.label);

            addCell(
                row,
                formatNumber(observed.mean)
            );

            addCell(
                row,
                formatNumber(quantity.expectedMean)
            );

            addCell(
                row,
                formatNumber(observed.variance)
            );

            addCell(
                row,
                formatNumber(quantity.theoreticalVariance)
            );

            statsBody.appendChild(row);
        }

        if (data.model === "bernoulli") {
            theorySummary.textContent =
                "Bernoulli model: E[X] = p = " +
                formatNumber(mu) +
                ", Var(X) = p(1-p) = " +
                formatNumber(variance) +
                ". The average score tends toward p.";
        } else {
            theorySummary.textContent =
                "Rademacher model: E[X] = 0, Var(X) = 1. " +
                "The average score tends toward zero, " +
                "while Sₙ/√n has variance 1.";
        }
    }


    /* ======================================
       TRAJECTORY TRANSFORMATIONS
       ====================================== */

    function scoreAt(path, step, kind) {
        const total = path[step];

        if (kind === "total") {
            return total;
        }

        if (kind === "average") {
            return total / step;
        }

        return total / Math.sqrt(step);
    }


    /* ======================================
       CANVAS CHART
       ====================================== */

    function drawChart(canvas, data, kind) {
        const paths = data.trajectories;
        const n = data.n;

        const cssWidth = Math.max(
            280,
            Math.round(
                canvas.getBoundingClientRect().width
            )
        );

        const cssHeight = 270;

        const pixelRatio = Math.min(
            window.devicePixelRatio || 1,
            2
        );

        canvas.width = Math.round(
            cssWidth * pixelRatio
        );

        canvas.height = Math.round(
            cssHeight * pixelRatio
        );

        const ctx = canvas.getContext("2d");

        ctx.setTransform(
            pixelRatio,
            0,
            0,
            pixelRatio,
            0,
            0
        );

        ctx.clearRect(
            0,
            0,
            cssWidth,
            cssHeight
        );

        const margin = {
            left: 62,
            right: 18,
            top: 20,
            bottom: 39
        };

        const plotWidth =
            cssWidth - margin.left - margin.right;

        const plotHeight =
            cssHeight - margin.top - margin.bottom;

        const reference =
            kind === "average"
                ? data.meanIncrement
                : 0;

        let minY = Math.min(0, reference);
        let maxY = Math.max(0, reference);

        for (const path of paths) {
            for (let step = 1; step <= n; step++) {
                const value = scoreAt(
                    path,
                    step,
                    kind
                );

                minY = Math.min(minY, value);
                maxY = Math.max(maxY, value);
            }
        }

        const range = Math.max(
            maxY - minY,
            0.1
        );

        const paddingY = range * 0.1;

        minY -= paddingY;
        maxY += paddingY;

        function xPosition(step) {
            return margin.left +
                (step / n) * plotWidth;
        }

        function yPosition(value) {
            return margin.top +
                (maxY - value) /
                (maxY - minY) *
                plotHeight;
        }

        // Horizontal grid and Y-axis labels.
        ctx.font = "11px Segoe UI, Arial, sans-serif";
        ctx.textAlign = "right";

        for (let i = 0; i <= 4; i++) {
            const value =
                maxY - i * (maxY - minY) / 4;

            const y = yPosition(value);

            ctx.strokeStyle = "#e2e8f0";
            ctx.lineWidth = 1;

            ctx.beginPath();
            ctx.moveTo(margin.left, y);
            ctx.lineTo(cssWidth - margin.right, y);
            ctx.stroke();

            ctx.fillStyle = "#64748b";
            ctx.fillText(
                value.toFixed(2),
                margin.left - 9,
                y + 4
            );
        }

        // X-axis labels.
        ctx.fillStyle = "#64748b";
        ctx.textAlign = "center";

        for (const step of [
            0,
            Math.round(n / 2),
            n
        ]) {
            ctx.fillText(
                String(step),
                xPosition(step),
                cssHeight - 19
            );
        }

        ctx.fillText(
            "Systems attempted",
            margin.left + plotWidth / 2,
            cssHeight - 3
        );

        // Dashed reference line.
        if (kind === "average") {
            ctx.strokeStyle = "#ea580c";
            ctx.lineWidth = 1.7;
            ctx.setLineDash([7, 5]);

            ctx.beginPath();

            ctx.moveTo(
                margin.left,
                yPosition(reference)
            );

            ctx.lineTo(
                cssWidth - margin.right,
                yPosition(reference)
            );

            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Independent attacker trajectories.
        paths.forEach((path, index) => {
            const highlighted = index === 0;

            ctx.beginPath();

            ctx.strokeStyle = highlighted
                ? "#1d4ed8"
                : "rgba(37, 99, 235, 0.18)";

            ctx.lineWidth = highlighted ? 2.2 : 1;

            for (let step = 1; step <= n; step++) {
                const x = xPosition(step);

                const y = yPosition(
                    scoreAt(path, step, kind)
                );

                if (step === 1) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }

            ctx.stroke();
        });
    }

    function renderCharts(data) {
        drawChart(
            totalChart,
            data,
            "total"
        );

        drawChart(
            averageChart,
            data,
            "average"
        );

        drawChart(
            normalizedChart,
            data,
            "normalized"
        );
    }


    /* ======================================
       RUN SIMULATION
       ====================================== */

    function runSimulation() {
        try {
            const parameters = readParameters();

            currentSimulation = simulate(
                parameters
            );

            renderCharts(currentSimulation);
            renderStatistics(currentSimulation);
            renderAdvanced(currentSimulation);

            if (window.ChartMotion) {
                ChartMotion.playMany([
                    ["hw3-total-chart", "line"],
                    ["hw3-average-chart", "line"],
                    ["hw3-normalized-chart", "line"],
                    ["hw3-hist-total", "bars"],
                    ["hw3-hist-average", "bars"],
                    ["hw3-hist-normalized", "bars"],
                    ["hw3-lln-chart", "line"],
                    ["hw3-variance-chart", "line"],
                    ["hw3-clt-chart", "line"]
                ]);
            }

            statusOutput.classList.remove("hw3-error");

            statusOutput.textContent =
                "Simulation completed: " +
                parameters.m +
                " independent attackers across " +
                parameters.n +
                " systems using the " +
                parameters.model +
                " model.";

        } catch (error) {
            statusOutput.classList.add("hw3-error");

            statusOutput.textContent = error.message;
        }
    }

    form.addEventListener("submit", event => {
        event.preventDefault();
        runSimulation();
    });

    modelInput.addEventListener(
        "change",
        updateModelControls
    );

    window.addEventListener("resize", () => {
        if (currentSimulation) {
            if (window.ChartMotion) ChartMotion.finishAll();
            renderCharts(currentSimulation);
            renderAdvanced(currentSimulation);
        }
    });

    // Initial state.
    updateModelControls();
    runSimulation();

})();
