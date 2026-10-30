
/* HOMEWORK 04 — WELFORD AND SAMPLING EXPERIMENTS */
(() => {
    "use strict";

    const $ = id => document.getElementById(id);
    const EXPECTED_MEAN = 5;
    const EXPECTED_VARIANCE = 10;
    const FOURTH_CENTRAL_MOMENT = 178;
    const COLORS = ["#2563eb", "#0d9488", "#ea580c", "#7c3aed", "#dc2626"];

    let lastSingle = null;
    let lastComparison = null;

    /* Reproducible pseudorandom generator. */
    function makeRng(seed) {
        let state = seed >>> 0;
        return () => {
            state = (state + 0x6D2B79F5) >>> 0;
            let t = state;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function newWelford() {
        return { count: 0, mean: 0, ss: 0 };
    }

    function addObservation(state, x) {
        state.count += 1;
        // The three-line core of Welford's algorithm:
        const delta = x - state.mean;
        state.mean += delta / state.count;
        state.ss += delta * (x - state.mean);
    }

    function sampleVariance(state) {
        return state.count > 1 ? state.ss / (state.count - 1) : NaN;
    }

    function fmt(value, digits = 4) {
        return Number.isFinite(value) ? value.toFixed(digits) : "—";
    }

    function setStatus(id, message, error = false) {
        const el = $(id);
        el.textContent = message;
        el.classList.toggle("hw4-error", error);
    }

    function tableRow(body, values) {
        const tr = document.createElement("tr");
        for (const value of values) {
            const td = document.createElement("td");
            td.textContent = String(value);
            tr.appendChild(td);
        }
        body.appendChild(tr);
    }

    /* EXERCISE 1: step-by-step recurrence and direct verification. */
    function runWelfordDemo() {
        const tokens = $("hw4-values").value.trim().split(/[\s,;]+/).filter(Boolean);
        const values = tokens.map(Number);
        if (!values.length || values.length > 100 ||
            values.some((x, index) => !Number.isFinite(x) ||
                !Number.isFinite(Number(tokens[index])) || x < 0 || x > 10)) {
            setStatus("hw4-demo-status", "Enter 1–100 numbers between 0 and 10, separated by commas.", true);
            return;
        }

        const body = $("hw4-demo-rows");
        body.replaceChildren();
        const state = newWelford();

        for (const x of values) {
            addObservation(state, x);
            tableRow(body, [
                state.count, fmt(x, 2), fmt(state.mean),
                fmt(state.ss), fmt(sampleVariance(state))
            ]);
        }

        const directMean = values.reduce((sum, x) => sum + x, 0) / values.length;
        const directSS = values.reduce((sum, x) => sum + (x - directMean) ** 2, 0);
        const directVariance = values.length > 1 ? directSS / (values.length - 1) : NaN;

        $("hw4-demo-mean").textContent = fmt(state.mean);
        $("hw4-demo-ss").textContent = fmt(state.ss);
        $("hw4-demo-variance").textContent = fmt(sampleVariance(state));

        const agreement = Math.abs(directMean - state.mean) < 1e-9 &&
            Math.abs(directSS - state.ss) < 1e-8 &&
            (values.length === 1 || Math.abs(directVariance - sampleVariance(state)) < 1e-9);

        setStatus("hw4-demo-status",
            agreement
                ? `Verified: Welford matches the direct calculation for ${values.length} observations.`
                : "Numerical mismatch: inspect the input and calculations.",
            !agreement
        );
        if (agreement) {
            showResults("demo");
        }
    }

    /* EXERCISE 2: discrete uniform scores 0, 1, ..., 10. */
    function simulate(n, m, seed, saveTrajectories = false) {
        const random = makeRng(seed);
        const sampleMeans = new Array(m);
        const sampleVariances = new Array(m);
        const trajectories = [];
        const meanAggregate = newWelford();
        const varianceAggregate = newWelford();

        for (let hacker = 0; hacker < m; hacker++) {
            const state = newWelford();
            const path = saveTrajectories && hacker < 12 ? [] : null;

            for (let system = 0; system < n; system++) {
                const score = Math.floor(random() * 11);
                addObservation(state, score);
                if (path) path.push([state.count, state.mean]);
            }

            const s2 = sampleVariance(state);
            sampleMeans[hacker] = state.mean;
            sampleVariances[hacker] = s2;
            addObservation(meanAggregate, state.mean);
            addObservation(varianceAggregate, s2);
            if (path) trajectories.push(path);
        }

        return {
            n, m, seed, sampleMeans, sampleVariances, trajectories,
            averageMean: meanAggregate.mean,
            averageVariance: varianceAggregate.mean,
            sdMeans: Math.sqrt(sampleVariance(meanAggregate)),
            sdVariances: Math.sqrt(sampleVariance(varianceAggregate))
        };
    }

    function readInputs() {
        const nText = $("hw4-n").value.trim();
        const mText = $("hw4-m").value.trim();
        const seedText = $("hw4-seed").value.trim();
        const n = Number(nText);
        const m = Number(mText);
        const seed = Number(seedText);

        if (!nText || !Number.isInteger(n) || n < 2 || n > 1000) {
            throw new Error("n must be an integer between 2 and 1000.");
        }
        if (!mText || !Number.isInteger(m) || m < 50 || m > 2000) {
            throw new Error("m must be an integer between 50 and 2000.");
        }
        if (!seedText || !Number.isInteger(seed) || seed < 0 || seed > 4294967295) {
            throw new Error("The seed must be an integer between 0 and 4294967295.");
        }
        return { n, m, seed };
    }

    /* Theoretical standard deviations of the estimators across hackers. */
    function theoreticalSdMean(n) {
        return Math.sqrt(EXPECTED_VARIANCE / n);
    }

    function theoreticalSdVariance(n) {
        const varianceOfS2 = (
            FOURTH_CENTRAL_MOMENT -
            ((n - 3) / (n - 1)) * EXPECTED_VARIANCE ** 2
        ) / n;
        return Math.sqrt(Math.max(0, varianceOfS2));
    }

    /* CANVAS GRAPHICS: no external dependencies. */
    function canvasContext(canvas) {
        const width = Math.max(280, Math.round(canvas.getBoundingClientRect().width || 600));
        const height = 270;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        const ctx = canvas.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);
        return { ctx, width, height };
    }

    function drawLineChart(id, series, options = {}) {
        const { ctx, width, height } = canvasContext($(id));
        const pad = { left: 52, right: 15, top: 17, bottom: 38 };
        const w = width - pad.left - pad.right;
        const h = height - pad.top - pad.bottom;
        const points = series.flatMap(s => s.points);
        const xValues = points.map(p => p[0]);
        const yValues = points.map(p => p[1]);
        const xMin = options.xMin ?? Math.min(...xValues);
        const xMax = options.xMax ?? Math.max(...xValues);
        let yMin = options.yMin ?? Math.min(...yValues);
        let yMax = options.yMax ?? Math.max(...yValues);
        if (yMax <= yMin) yMax = yMin + 1;
        const valueX = x => options.logX ? Math.log10(x) : x;
        const loX = valueX(xMin);
        const hiX = valueX(xMax);
        const X = x => pad.left + (valueX(x) - loX) / (hiX - loX || 1) * w;
        const Y = y => pad.top + (yMax - y) / (yMax - yMin) * h;

        ctx.font = "11px Segoe UI, Arial, sans-serif";
        ctx.textAlign = "right";
        for (let i = 0; i <= 4; i++) {
            const value = yMin + (yMax - yMin) * i / 4;
            const yy = Y(value);
            ctx.strokeStyle = "#e2e8f0";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(pad.left, yy);
            ctx.lineTo(width - pad.right, yy);
            ctx.stroke();
            ctx.fillStyle = "#64748b";
            ctx.fillText(value.toFixed(options.yDigits ?? 2), pad.left - 7, yy + 4);
        }

        ctx.textAlign = "center";
        ctx.fillStyle = "#64748b";
        for (let i = 0; i <= 4; i++) {
            const v = loX + (hiX - loX) * i / 4;
            const raw = options.logX ? 10 ** v : v;
            ctx.fillText(String(Math.round(raw)), pad.left + w * i / 4, height - 16);
        }
        ctx.fillText(options.xLabel || "Systems (n)", pad.left + w / 2, height - 2);

        ctx.save();
        ctx.beginPath();
        ctx.rect(pad.left, pad.top, w, h);
        ctx.clip();
        for (const line of series) {
            ctx.beginPath();
            ctx.strokeStyle = line.color;
            ctx.lineWidth = line.width || 2;
            ctx.setLineDash(line.dashed ? [6, 4] : []);
            line.points.forEach(([x, y], index) => {
                if (index === 0) ctx.moveTo(X(x), Y(y));
                else ctx.lineTo(X(x), Y(y));
            });
            ctx.stroke();
        }
        ctx.restore();
        ctx.setLineDash([]);
    }

    function drawHistogram(id, values, expected, label) {
        const { ctx, width, height } = canvasContext($(id));
        const pad = { left: 49, right: 15, top: 17, bottom: 38 };
        const w = width - pad.left - pad.right;
        const h = height - pad.top - pad.bottom;
        const minimum = Math.min(expected, ...values);
        const maximum = Math.max(expected, ...values);
        const spread = Math.max(maximum - minimum, 0.25);
        const low = minimum - spread * 0.08;
        const high = maximum + spread * 0.08;
        const bins = 20;
        const counts = Array(bins).fill(0);

        for (const value of values) {
            const index = Math.max(0, Math.min(bins - 1,
                Math.floor((value - low) / (high - low) * bins)));
            counts[index]++;
        }
        const ymax = Math.max(...counts) / values.length * 1.15;
        const X = x => pad.left + (x - low) / (high - low) * w;
        const Y = share => pad.top + h - share / (ymax || 1) * h;

        ctx.font = "11px Segoe UI, Arial, sans-serif";
        ctx.textAlign = "right";
        for (let i = 0; i <= 4; i++) {
            const share = ymax * i / 4;
            const yy = Y(share);
            ctx.strokeStyle = "#e2e8f0";
            ctx.beginPath();
            ctx.moveTo(pad.left, yy);
            ctx.lineTo(width - pad.right, yy);
            ctx.stroke();
            ctx.fillStyle = "#64748b";
            ctx.fillText(`${(share * 100).toFixed(0)}%`, pad.left - 7, yy + 4);
        }

        ctx.fillStyle = "#2563eb";
        counts.forEach((count, i) => {
            const left = pad.left + i * w / bins;
            const top = Y(count / values.length);
            ctx.fillRect(left + 1, top, Math.max(1, w / bins - 2), pad.top + h - top);
        });

        const markerX = X(expected);
        ctx.strokeStyle = "#ea580c";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(markerX, pad.top);
        ctx.lineTo(markerX, pad.top + h);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.textAlign = "center";
        ctx.fillStyle = "#64748b";
        for (let i = 0; i <= 4; i++) {
            const value = low + (high - low) * i / 4;
            ctx.fillText(value.toFixed(2), pad.left + w * i / 4, height - 16);
        }
        ctx.fillText(label, pad.left + w / 2, height - 2);
    }

    function renderSingle(data) {
        $("hw4-avg-means").textContent = fmt(data.averageMean);
        $("hw4-avg-variances").textContent = fmt(data.averageVariance);
        $("hw4-sd-means").textContent = fmt(data.sdMeans);
        $("hw4-sd-variances").textContent = fmt(data.sdVariances);
        $("hw4-single-description").textContent =
            `${data.m} hackers each attempted ${data.n} systems. ` +
            `Theoretical mean = ${EXPECTED_MEAN}; theoretical variance = ${EXPECTED_VARIANCE}. ` +
            `The sample variances use the n − 1 denominator.`;
        $("hw4-single-interpretation").textContent =
            `Average sampling mean differs from μ by ${fmt(Math.abs(data.averageMean - EXPECTED_MEAN))}; ` +
            `average sampling variance differs from σ² by ${fmt(Math.abs(data.averageVariance - EXPECTED_VARIANCE))}. ` +
            `The empirical SD of individual sampling means is ${fmt(data.sdMeans)} ` +
            `(theoretical ${fmt(theoreticalSdMean(data.n))}).`;

        drawHistogram("hw4-mean-histogram", data.sampleMeans, EXPECTED_MEAN, "Sampling mean");
        drawHistogram("hw4-variance-histogram", data.sampleVariances, EXPECTED_VARIANCE, "Sampling variance");
        const lines = data.trajectories.map((path, i) => ({
            color: i === 0 ? COLORS[0] : "rgba(37,99,235,0.16)",
            width: i === 0 ? 2.3 : 1,
            points: path
        }));
        lines.push({ color: COLORS[2], dashed: true, width: 2, points: [[1, EXPECTED_MEAN], [data.n, EXPECTED_MEAN]] });
        drawLineChart("hw4-trajectory-chart", lines, { xMin: 1, xMax: data.n, yMin: 0, yMax: 10 });
    }

    function runSingle() {
        try {
            const parameters = readInputs();
            lastSingle = simulate(parameters.n, parameters.m, parameters.seed, true);
            showResults("simulation");
            renderSingle(lastSingle);
            if (window.ChartMotion) {
                ChartMotion.playMany([
                    ["hw4-trajectory-chart", "line"],
                    ["hw4-mean-histogram", "bars"],
                    ["hw4-variance-histogram", "bars"]
                ]);
            }
            setStatus("hw4-simulation-status", "Simulation completed. All results use the same generated scores.");
        } catch (error) {
            setStatus("hw4-simulation-status", error.message, true);
        }
    }

    /* SAMPLE-SIZE EXPERIMENT: same m, different n. */
    function renderComparison(rows, m) {
        const body = $("hw4-comparison-rows");
        body.replaceChildren();
        for (const item of rows) {
            tableRow(body, [
                item.n,
                fmt(item.averageMean),
                fmt(item.averageVariance),
                fmt(item.sdMeans),
                fmt(theoreticalSdMean(item.n)),
                fmt(item.sdVariances),
                fmt(theoreticalSdVariance(item.n))
            ]);
        }
        $("hw4-experiment-note").textContent =
            `Each row uses ${m} independent hackers. Theoretical targets: ` +
            `E[sampling mean] = 5 and E[sampling variance] = 10. ` +
            `Empirical SD measures the spread across hackers; dashed lines show the theoretical SD. ` +
            `The variance estimator uses Bessel's correction (n − 1).`;

        drawLineChart("hw4-mean-spread-chart", [
            { color: COLORS[0], points: rows.map(row => [row.n, row.sdMeans]) },
            { color: COLORS[2], dashed: true, points: rows.map(row => [row.n, theoreticalSdMean(row.n)]) }
        ], { logX: true, xMin: rows[0].n, xMax: rows.at(-1).n, yMin: 0, yDigits: 2 });

        drawLineChart("hw4-variance-spread-chart", [
            { color: COLORS[0], points: rows.map(row => [row.n, row.sdVariances]) },
            { color: COLORS[2], dashed: true, points: rows.map(row => [row.n, theoreticalSdVariance(row.n)]) }
        ], { logX: true, xMin: rows[0].n, xMax: rows.at(-1).n, yMin: 0, yDigits: 2 });
    }

    function runComparison() {
        try {
            const { n, m, seed } = readInputs();
            const sizes = [...new Set([5, 10, 30, 100, 300, 1000, n])]
                .sort((a, b) => a - b);
            const rows = sizes.map((size, index) =>
                simulate(size, m, (seed + Math.imul(index + 1, 7919)) >>> 0)
            );
            lastComparison = { rows, m };
            showResults("comparison");
            renderComparison(rows, m);
            if (window.ChartMotion) {
                ChartMotion.playMany([
                    ["hw4-mean-spread-chart", "line"],
                    ["hw4-variance-spread-chart", "line"]
                ]);
            }
            setStatus("hw4-comparison-status", `Completed ${sizes.length} sample-size experiments with ${m} hackers each.`);
        } catch (error) {
            setStatus("hw4-comparison-status", error.message, true);
        }
    }

    
/* ==========================================
   RESULTS VISIBILITY
   ========================================== */

const resultBlocks = {
    demo: [
        $("hw4-demo-mean").closest(".hw4-metrics"),
        $("hw4-demo-rows").closest(".hw4-table-scroll")
    ],

    simulation: [
        $("hw4-trajectory-chart").closest(".assignment-panel"),
        $("hw4-avg-means").closest(".assignment-section")
    ],

    comparison: [
        $("hw4-comparison-rows").closest(".hw4-table-scroll"),
        $("hw4-mean-spread-chart").closest(".hw4-two-charts"),
        document.querySelector(".hw4-chart-legend")
    ]
};

// Hide all results when the page opens.
for (const blocks of Object.values(resultBlocks)) {
    for (const element of blocks) {
        element.hidden = true;
    }
}

// Show only the results of the requested experiment.
function showResults(group) {
    for (const element of resultBlocks[group]) {
        element.hidden = false;
    }
}


    $("hw4-demo-form").addEventListener("submit", event => {
        event.preventDefault();
        runWelfordDemo();
    });

    $("hw4-simulation-form").addEventListener("submit", event => {
        event.preventDefault();
        runSingle();
    });

    $("hw4-compare-button").addEventListener("click", runComparison);

    window.addEventListener("resize", () => {
        if (window.ChartMotion) ChartMotion.finishAll();
        if (lastSingle) renderSingle(lastSingle);
        if (lastComparison) renderComparison(lastComparison.rows, lastComparison.m);
    });
})();
