/* HOMEWORK 05 — Numerical integration and the standard normal CDF.
   No external dependencies. No computations until a button is pressed. */
(() => {
    "use strict";
    const $ = id => document.getElementById(id);
    const PI = Math.PI;
    const BLUE = "#2563eb", ORANGE = "#ea580c", GREEN = "#059669";
    const format = (v, d = 8) => Number.isFinite(v) ? Number(v).toFixed(d) : "—";
    const scientific = v => Number.isFinite(v) ? (v === 0 ? "0" : v.toExponential(3)) : "—";
    const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
    const status = (id, msg, error = false) => {
        $(id).textContent = msg;
        $(id).classList.toggle("hw5-error", error);
    };
    function row(id, entries) {
        const tr = document.createElement("tr");
        for (const value of entries) {
            const td = document.createElement("td");
            td.textContent = String(value);
            tr.appendChild(td);
        }
        $(id).appendChild(tr);
    }
    function integerInput(id, min, max) {
        const str = $(id).value.trim(), value = Number(str);
        if (!str || !Number.isInteger(value) || value < min || value > max) {
            throw new Error(`${id.replace("hw5-", "")} must be an integer from ${min} to ${max}.`);
        }
        return value;
    }

    const functions = {
        sin: { name: "sin(x)", a: 0, b: PI, exact: 2, kind: "ordinary", f: x => Math.sin(x), note: "Smooth and Riemann-integrable. Both methods target 2." },
        square: { name: "x²", a: 0, b: 1, exact: 1 / 3, kind: "ordinary", f: x => x * x, note: "Continuous and Riemann-integrable; exact integral 1/3." },
        step13: { name: "1 → 3 step", a: 0, b: 1, exact: 2, kind: "ordinary", f: x => x < .5 ? 1 : 3, note: "One jump discontinuity does not prevent Riemann integrability. Integral = 2." },
        absolute: { name: "|x − 0.5|", a: 0, b: 1, exact: .25, kind: "ordinary", f: x => Math.abs(x - .5), note: "Continuous V-shaped function; integral = 1/4." },
        inverse: { name: "1/√x", a: 0, b: 1, exact: 2, kind: "improper", f: x => 1 / Math.sqrt(x), note: "Unbounded at x = 0: the improper Riemann integral (and Lebesgue integral) equals 2. Finite range grids truncate a tall tail; convergence is slower." },
        step10: { name: "1 → 0 step", a: 0, b: 1, exact: .5, kind: "ordinary", f: x => x < .5 ? 1 : 0, note: "A step with one jump; both integrals equal 1/2." },
        sinc: { name: "sin(x)/x", a: 0, b: PI, exact: 1.8519370519824658, kind: "ordinary", f: x => x === 0 ? 1 : Math.sin(x) / x, note: "Continuous extension at 0 has value 1. Reference is Si(π), approximately 1.851937052." },
        thomae: { name: "Thomae", a: 0, b: 1, exact: 0, kind: "thomae", note: "Riemann and Lebesgue integrals are both 0. Uniform rational-grid samples are positive, but their Riemann sums and Darboux upper bounds tend to 0." },
        dirichlet: { name: "Dirichlet", a: 0, b: 1, exact: 0, kind: "dirichlet", note: "Lebesgue integral = 0; NO Riemann integral. On every equal-width partition, lower Darboux sum = 0 and upper Darboux sum = 1. Sampling only rational midpoints misleadingly returns 1." }
    };
    let lastIntegral = null, lastConvergence = null, lastCdf = null, lastBenchmark = false;

    function gcd(a, b) {
        while (b !== 0) { const t = a % b; a = b; b = t; }
        return a;
    }
    // Deliberately sampled at exact rational midpoints (2i+1)/(2N).
    // A JS floating-point value alone cannot reveal irrationality.
    function sample(f, i, count) {
        if (f.kind === "dirichlet") return 1;
        if (f.kind === "thomae") {
            const den = 2 * count, numerator = 2 * i + 1;
            return gcd(numerator, den) / den;
        }
        const x = f.a + (f.b - f.a) * (i + .5) / count;
        return f.f(x);
    }
    function riemann(f, n) {
        let sum = 0;
        for (let i = 0; i < n; i++) sum += sample(f, i, n);
        return sum * (f.b - f.a) / n;
    }
    // Layer-cake identity for nonnegative f:
    // ∫ f dx = ∫_0^∞ measure({x: f(x) ≥ t}) dt.
    // Estimate preimage measures on M domain midpoints and integrate B levels.
    function valueLayers(f, n, bins) {
        const m = Math.max(256, 4 * n), length = f.b - f.a;
        const values = Array.from({ length: m }, (_, i) => sample(f, i, m));
        const top = Math.max(...values);
        if (top <= 0) return { estimate: 0, m, top, delta: 0, values, preimages: [], bins };
        const delta = top / bins;
        const histogram = Array(bins + 1).fill(0);
        for (const y of values) histogram[clamp(Math.floor(y / delta), 0, bins)]++;
        const preimages = Array(bins + 1).fill(0);
        let tail = 0, estimate = 0;
        for (let level = bins; level >= 1; level--) {
            tail += histogram[level];
            preimages[level] = length * tail / m;
            estimate += delta * preimages[level];
        }
        return { estimate, m, top, delta, values, preimages, bins };
    }
    // For Thomae: exact upper Darboux sum on uniform CLOSED intervals.
    // Every interval has an endpoint of denominator <= n. The first q for
    // which p/q is in [i/n,(i+1)/n] yields the supremum 1/q.
    function thomaeUpper(n) {
        let upper = 0;
        for (let i = 0; i < n; i++) {
            for (let q = 1; q <= n; q++) {
                if (Math.ceil(i * q / n) <= Math.floor((i + 1) * q / n)) {
                    upper += 1 / (q * n);
                    break;
                }
            }
        }
        return upper;
    }
    function meanRuntime(fn, repeats = 14) {
        fn(); // warm up
        const start = performance.now();
        for (let i = 0; i < repeats; i++) fn();
        return (performance.now() - start) / repeats;
    }

    /* CANVAS HELPERS */
    function canvas(id) {
        const element = $(id);
        const width = Math.max(270, Math.round(element.getBoundingClientRect().width || 630));
        const height = element.getBoundingClientRect().height || 285;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        element.width = Math.round(width * ratio);
        element.height = Math.round(height * ratio);
        const ctx = element.getContext("2d");
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, width, height);
        return { ctx, width, height };
    }
    function coordinateFrame(id, x0, x1, y0, y1, opts = {}) {
        const { ctx, width, height } = canvas(id);
        const p = { left: 56, right: 14, top: 18, bottom: 39 };
        const w = width - p.left - p.right, h = height - p.top - p.bottom;
        const X = x => p.left + (x - x0) / (x1 - x0 || 1) * w;
        const Y = y => p.top + (y1 - y) / (y1 - y0 || 1) * h;
        ctx.font = "11px Segoe UI, Arial, sans-serif";
        for (let i = 0; i <= 4; i++) {
            const val = y0 + (y1 - y0) * i / 4, yy = Y(val);
            ctx.strokeStyle = "#e2e8f0";
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(p.left, yy); ctx.lineTo(width - p.right, yy); ctx.stroke();
            ctx.textAlign = "right"; ctx.fillStyle = "#64748b";
            ctx.fillText(opts.yFormat ? opts.yFormat(val) : val.toFixed(2), p.left - 8, yy + 4);
        }
        ctx.fillStyle = "#64748b"; ctx.textAlign = "center";
        for (let i = 0; i <= 4; i++) {
            const v = x0 + (x1 - x0) * i / 4;
            ctx.fillText(opts.xFormat ? opts.xFormat(v) : v.toFixed(2), X(v), height - 16);
        }
        ctx.fillText(opts.xTitle || "x", p.left + w / 2, height - 2);
        return { ctx, width, height, p, w, h, X, Y };
    }
    function chartLines(id, series, opts = {}) {
        // Series points are [x, y]; optional logarithmic x/y scale.
        const pts = series.flatMap(s => s.points.filter(p => Number.isFinite(p[1])));
        if (!pts.length) return;
        const transformX = x => opts.logX ? Math.log10(x) : x;
        const transformY = y => opts.logY ? Math.log10(Math.max(y, 1e-16)) : y;
        const xs = pts.map(p => transformX(p[0])), ys = pts.map(p => transformY(p[1]));
        const yMin = opts.yMin !== undefined ? transformY(opts.yMin) : Math.min(...ys);
        const yMax = opts.yMax !== undefined ? transformY(opts.yMax) : Math.max(...ys);
        const pad = Math.max(.02, (yMax - yMin) * .12);
        const fr = coordinateFrame(id, Math.min(...xs), Math.max(...xs), yMin - pad, yMax + pad, {
            xFormat: t => { const v = opts.logX ? Math.pow(10, t) : t; return opts.xInteger ? Math.round(v).toString() : v.toFixed(1); },
            yFormat: t => opts.logY ? Math.pow(10, t).toExponential(1) : t.toFixed(3),
            xTitle: opts.xTitle || "Resolution / effort"
        });
        const { ctx, p, w, h, X, Y } = fr;
        ctx.save(); ctx.beginPath(); ctx.rect(p.left, p.top, w, h); ctx.clip();
        for (const s of series) {
            ctx.beginPath(); ctx.strokeStyle = s.color; ctx.lineWidth = 2.3;
            ctx.setLineDash(s.dashed ? [7, 5] : []);
            let first = true;
            for (const [x, y] of s.points) {
                const xp = transformX(x), yp = transformY(y);
                if (!Number.isFinite(xp) || !Number.isFinite(yp)) continue;
                if (first) { ctx.moveTo(X(xp), Y(yp)); first = false; }
                else ctx.lineTo(X(xp), Y(yp));
            }
            ctx.stroke();
        }
        ctx.restore(); ctx.setLineDash([]);
    }
    function previewRiemann(f, n) {
        const parts = Math.min(80, n);
        const curve = Array.from({ length: 450 }, (_, i) => sample(f, i, 450));
        const ymax = Math.max(1e-6, ...curve, ...Array.from({length:parts},(_,i)=>sample(f,i,parts)));
        const fr = coordinateFrame("hw5-riemann-chart", f.a, f.b, 0, ymax * 1.12, { xTitle: "Domain x" });
        const { ctx, X, Y } = fr;
        for (let i = 0; i < parts; i++) {
            const left = f.a + (f.b - f.a) * i / parts;
            const right = f.a + (f.b - f.a) * (i + 1) / parts;
            const v = sample(f, i, parts);
            ctx.fillStyle = "rgba(37,99,235,.20)";
            ctx.fillRect(X(left), Y(v), Math.max(.6,X(right)-X(left)-.5), Y(0)-Y(v));
            if (parts <= 80) { ctx.strokeStyle = "rgba(37,99,235,.36)"; ctx.strokeRect(X(left), Y(v),X(right)-X(left),Y(0)-Y(v)); }
        }
        ctx.beginPath(); ctx.strokeStyle = BLUE; ctx.lineWidth = 2.3;
        curve.forEach((v,i)=>{const x=X(f.a+(f.b-f.a)*(i+.5)/curve.length);if(i===0)ctx.moveTo(x,Y(v));else ctx.lineTo(x,Y(v));});
        ctx.stroke();
    }
    function previewLayers(f, data) {
        const samples = 140, layers = Math.min(24, data.bins);
        const maxY = Math.max(1e-6, data.top);
        const fr = coordinateFrame("hw5-lebesgue-chart", f.a, f.b, 0, maxY * 1.08, { xTitle: "Preimage x" });
        const { ctx, X, Y } = fr;
        const bandH = maxY / layers;
        for (let i = 0; i < samples; i++) {
            const val = sample(f, i, samples);
            const nLayers = clamp(Math.floor(val / bandH), 0, layers);
            const x0 = f.a+(f.b-f.a)*i/samples;
            const x1 = f.a+(f.b-f.a)*(i+1)/samples;
            for (let k = 0; k < nLayers; k++) {
                ctx.fillStyle = k % 2 ? "rgba(5,150,105,.36)" : "rgba(37,99,235,.35)";
                ctx.fillRect(X(x0),Y((k+1)*bandH),Math.max(1,X(x1)-X(x0)+.4),Y(k*bandH)-Y((k+1)*bandH));
            }
        }
        ctx.setLineDash([3,6]);ctx.strokeStyle="rgba(234,88,12,.35)";
        for (let k=1;k<=layers;k++){const y=Y(k*bandH);ctx.beginPath();ctx.moveTo(X(f.a),y);ctx.lineTo(X(f.b),y);ctx.stroke();}
        ctx.setLineDash([]);
    }

    function readIntegral() {
        const id = $("hw5-function").value, f = functions[id];
        const n = integerInput("hw5-n", 8, 2048);
        const bins = integerInput("hw5-levels", 8, 512);
        if (!f) throw new Error("Choose a supported function.");
        return { id, f, n, bins };
    }
    function runIntegral() {
        try {
            const { id, f, n, bins } = readIntegral();
            const r = riemann(f,n), layer = valueLayers(f,n,bins);
            lastIntegral = { id, f, n, bins, r, layer };
            $("hw5-integral-results").hidden = false;
            $("hw5-reference").textContent = format(f.exact);
            $("hw5-reference-label").textContent = f.kind === "dirichlet" ? "Lebesgue; no Riemann integral" : f.kind === "improper" ? "Improper integral" : "Mathematical reference";
            $("hw5-r-value").textContent = format(r);
            $("hw5-r-error").textContent = f.kind === "dirichlet" ? "Not a convergent Riemann integral" : `Error: ${scientific(Math.abs(r-f.exact))}`;
            $("hw5-l-label").textContent = f.kind === "dirichlet" || f.kind === "thomae" ? "Lebesgue (exact measure)" : "Lebesgue-inspired (numerical)";
            $("hw5-l-value").textContent = format(f.kind === "dirichlet" || f.kind === "thomae" ? 0 : layer.estimate);
            $("hw5-l-error").textContent = f.kind === "dirichlet" || f.kind === "thomae" ? "Measure-theoretic result; not inferred from grid" : `Error: ${scientific(Math.abs(layer.estimate-f.exact))}`;
            $("hw5-sample-value").textContent = format(layer.estimate);
            $("hw5-sampling-count").textContent = `${layer.m} domain samples; ${bins} levels`;
            let note = f.note;
            if (id === "thomae") note += ` On ${n} closed subintervals, lower Darboux = 0 and upper Darboux ≈ ${format(thomaeUpper(n),6)}.`;
            $("hw5-integral-insight").textContent = note;
            $("hw5-runtime-rows").replaceChildren();
            const tr = meanRuntime(()=>riemann(f,n), 12);
            const tl = meanRuntime(()=>valueLayers(f,n,bins),12);
            row("hw5-runtime-rows",["Riemann midpoint",n,`${format(tr,3)} ms`,"Domain partition; one value per interval"]);
            row("hw5-runtime-rows",["Sampled range levels",`${layer.m} + ${bins} level bins`,`${format(tl,3)} ms`,"Histogram and cumulative preimage counts"]);
            if (id === "dirichlet" || id === "thomae") row("hw5-runtime-rows",["Analytical Lebesgue measure","No grid evaluation","n/a","Countable rational support has measure zero"]);
            $("hw5-preimage-rows").replaceChildren();
            if (layer.top > 0) {
                for (const fraction of [.2,.4,.6,.8,1]) {
                    const k = Math.max(1,Math.round(fraction*bins));
                    const pre = layer.preimages[k];
                    row("hw5-preimage-rows",[format(k*layer.delta,5),format(pre,6),`${format(100*pre/(f.b-f.a),2)}%`]);
                }
            }
            $("hw5-pathology-note").textContent = f.kind === "dirichlet" || f.kind === "thomae"
                ? "These empirical preimage measures are NOT Lebesgue measures for this pathological function: a rational-only grid can overrepresent a countable measure-zero set. The Lebesgue integral 0 is established analytically."
                : "Domain midpoint sampling approximates preimage measures; finite domain resolution and range quantization both contribute error.";
            previewRiemann(f,n); previewLayers(f,layer);
            window.ChartMotion?.playMany([["hw5-riemann-chart","line"],["hw5-lebesgue-chart","bars"]]);
            status("hw5-integral-status",`Compared ${f.name} using N=${n}, B=${bins} and M=${layer.m} domain samples.`);
        } catch(error) { status("hw5-integral-status",error.message,true); }
    }
    function runConvergence() {
        try {
            const { id, f } = readIntegral();
            const sizes = [16,32,64,128,256,512,1024];
            const rows = sizes.map(n=>{
                const bins = Math.max(8,n/4),r=riemann(f,n),l=valueLayers(f,n,bins);
                return {n,bins,r,l:l.estimate,m:l.m,re:Math.abs(r-f.exact),le:Math.abs(l.estimate-f.exact)};
            });
            lastConvergence={ id, rows };
            $("hw5-convergence-results").hidden=false;
            $("hw5-convergence-rows").replaceChildren();
            for(const z of rows) row("hw5-convergence-rows",[z.n,z.bins,format(z.r,6),format(z.l,6),scientific(z.re),scientific(z.le),`${z.n} / ${z.m}`]);
            chartLines("hw5-error-chart",[
                {color:BLUE,points:rows.map(z=>[z.n,Math.max(1e-15,z.re)])},
                {color:ORANGE,points:rows.map(z=>[z.n,Math.max(1e-15,z.le)])}
            ],{logX:true,logY:true,xInteger:true,xTitle:"Domain subintervals N (log scale)"});
            $("hw5-convergence-note").textContent = id === "dirichlet"
                ? "Dirichlet: rational-grid midpoint sums remain 1 and rational-grid level estimates remain 1, but the true Lebesgue integral is 0 and the Riemann integral does not exist. Finite sampling cannot detect measure-zero rationality."
                : id === "thomae"
                ? `Thomae: rational-grid midpoint sums approach zero. Exact upper Darboux sums on uniform closed subintervals decrease: U16 = ${format(thomaeUpper(16),5)}, U1024 = ${format(thomaeUpper(1024),5)}, while all lower sums are zero. The true Lebesgue integral is 0.`
                : f.kind === "improper"
                ? "The improper singularity at x=0 slows both methods. Midpoint samples avoid evaluating f(0), but high tails require greater domain and range resolution."
                : "For Riemann-integrable functions, both refined numerical approaches target the same value. The range approach has two errors: approximated preimage measures and finite value layers.";
            window.ChartMotion?.playCanvas($("hw5-error-chart"),"line");
            status("hw5-convergence-status",`Completed seven resolution comparisons for ${f.name}.`);
        }catch(error){ status("hw5-convergence-status",error.message,true); }
    }

    /* EXERCISE 2: Standard normal distribution CDF. */
    const SQRT2 = Math.SQRT2;
    const PDF0 = 1 / Math.sqrt(2 * PI);
    const density = x => PDF0 * Math.exp(-.5 * x * x);
    // High-precision reference values computed using scipy.special.ndtr (SciPy 1.17).
    // Public documentation: https://docs.scipy.org/doc/scipy/reference/generated/scipy.special.ndtr.html
    // Also cross-checked to five decimal places against the NIST normal probability table.
    const referenceValues = new Map([
        [-5,0.000000286651572],[-4,0.000031671241833],[-3,0.001349898031630],
        [-2,0.022750131948179],[-1,0.158655253931457],[-.5,0.308537538725987],
        [0,.5],[.5,.691462461274013],[1,.841344746068543],
        [1.5,.933192798731142],[2,.977249868051821],[3,.998650101968370],
        [4,.999968328758167],[5,.999999713348428]
    ]);
    // Composite Simpson integration from 0 to |x|, using Gaussian symmetry.
    function normalSimpson(x, intervals) {
        if (x === 0) return .5;
        const a = Math.abs(x), h = a / intervals;
        let sum = density(0) + density(a);
        for(let i=1;i<intervals;i++) sum += (i%2===0 ? 2 : 4) * density(i*h);
        const integral = h * sum / 3;
        return .5 + Math.sign(x) * integral;
    }
    // erf(z) = 2/sqrt(pi) * Σ (-1)^k z^(2k+1)/(k! (2k+1)).
    // Finite Taylor series illustrates possible catastrophic cancellation in tails.
    function normalErfSeries(x, terms) {
        if (x === 0) return .5;
        const z = x / SQRT2;
        let term = z, sum = z;
        for(let k=1;k<terms;k++) {
            term *= -(z*z) / k;
            sum += term / (2*k+1);
        }
        return .5 * (1 + (2 / Math.sqrt(PI)) * sum);
    }
    // Fast Abramowitz & Stegun 7.1.26-style polynomial erf approximation.
    // Maximum absolute erf approximation error ≈1.5e-7 over real x.
    function normalFast(x) {
        if (x===0) return .5;
        const z = Math.abs(x) / SQRT2;
        const t = 1 / (1 + .3275911*z);
        const polynomial = (((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t;
        const erf = 1 - polynomial * Math.exp(-z*z);
        return clamp(.5 * (1 + Math.sign(x) * erf),0,1);
    }
    function referenceAt(x) {
        if(referenceValues.has(x)) return {value:referenceValues.get(x),source:"SciPy ndtr, checked against NIST"};
        return {value:normalSimpson(x,8192),source:"High-resolution Simpson internal baseline (8192 panels)"};
    }
    function readCdf() {
        const raw = $("hw5-x").value.trim(), x = Number(raw);
        if (!raw || !Number.isFinite(x) || x < -5 || x > 5) throw new Error("x must be between -5 and +5.");
        const intervals = integerInput("hw5-simpson-n",8,2000);
        if(intervals%2!==0) throw new Error("Simpson requires an even number of subintervals.");
        const terms = integerInput("hw5-series-terms",4,100);
        return {x,intervals,terms};
    }
    function drawGaussian(x) {
        const fr = coordinateFrame("hw5-gaussian-chart", -5, 5, 0, .45, {xTitle:"z-score x",xFormat:v=>v.toFixed(1)});
        const {ctx,X,Y}=fr;
        const count=440;
        ctx.beginPath();ctx.moveTo(X(-5),Y(0));
        for(let i=0;i<=count;i++) {
            const t = -5 + 10*i/count;
            if(t<=x) ctx.lineTo(X(t),Y(density(t)));
        }
        ctx.lineTo(X(clamp(x,-5,5)),Y(0));ctx.closePath();
        ctx.fillStyle="rgba(37,99,235,.27)";ctx.fill();
        ctx.beginPath();ctx.strokeStyle=BLUE;ctx.lineWidth=3;
        for(let i=0;i<=count;i++) {
            const t=-5+10*i/count;
            if(!i)ctx.moveTo(X(t),Y(density(t)));else ctx.lineTo(X(t),Y(density(t)));
        }
        ctx.stroke();
        ctx.setLineDash([6,5]);ctx.strokeStyle=ORANGE;ctx.lineWidth=2;
        ctx.beginPath();ctx.moveTo(X(x),Y(0));ctx.lineTo(X(x),Y(density(x)));ctx.stroke();ctx.setLineDash([]);
        ctx.fillStyle="#1e3a5f";ctx.font="700 13px Segoe UI, Arial";
        ctx.textAlign="center";ctx.fillText(`x = ${x.toFixed(2)}`,clamp(X(x),83,fr.width-53),Y(density(x))-11);
    }
    function runCdf() {
        try {
            const p = readCdf(), ref = referenceAt(p.x);
            const methods = [
                {name:"Simpson's rule",value:normalSimpson(p.x,p.intervals),effort:`${p.intervals+1} density calls`,fn:()=>normalSimpson(p.x,p.intervals),repeat:150},
                {name:"erf Taylor series",value:normalErfSeries(p.x,p.terms),effort:`${p.terms} series terms`,fn:()=>normalErfSeries(p.x,p.terms),repeat:1000},
                {name:"Fast erf polynomial",value:normalFast(p.x),effort:"Fixed polynomial + exp",fn:()=>normalFast(p.x),repeat:5000}
            ];
            lastCdf=p;
            $("hw5-cdf-results").hidden=false;
            $("hw5-cdf-reference").textContent=format(ref.value,12);
            $("hw5-cdf-reference-source").textContent=ref.source;
            $("hw5-cdf-fast").textContent=format(methods[2].value,12);
            $("hw5-cdf-fast-error").textContent=`|Error| = ${scientific(Math.abs(methods[2].value-ref.value))}`;
            $("hw5-cdf-simpson").textContent=format(methods[0].value,12);
            $("hw5-cdf-simpson-error").textContent=`|Error| = ${scientific(Math.abs(methods[0].value-ref.value))}`;
            $("hw5-cdf-rows").replaceChildren();
            for(const entry of methods) {
                row("hw5-cdf-rows",[
                    entry.name,format(entry.value,12),scientific(Math.abs(entry.value-ref.value)),
                    entry.effort,`${format(meanRuntime(entry.fn,entry.repeat),5)} ms`
                ]);
            }
            drawGaussian(p.x);
            window.ChartMotion?.playCanvas($("hw5-gaussian-chart"),"bars");
            status("hw5-cdf-status",`Computed Φ(${p.x}) by all three methods. The reference source is identified below.`);
        }catch(error){status("hw5-cdf-status",error.message,true);}
    }
    function benchmarkCurve() {
        const x=2,ref=referenceValues.get(2);
        const Ns=[8,16,24,48,96,192,384,768];
        const Ks=[4,6,8,12,16,24,32,48];
        return [
            {color:BLUE,points:Ns.map(n=>[n,Math.max(1e-16,Math.abs(normalSimpson(x,n)-ref))])},
            {color:ORANGE,points:Ks.map(k=>[k,Math.max(1e-16,Math.abs(normalErfSeries(x,k)-ref))])},
            {color:GREEN,dashed:true,points:[[4,Math.abs(normalFast(x)-ref)],[768,Math.abs(normalFast(x)-ref)]]}
        ];
    }
    function runBenchmark() {
        try {
            const p=readCdf();
            const points=[-5,-4,-3,-2,-1,-.5,0,.5,1,1.5,2,3,4,5];
            let highestError=0,largestMethod="";
            $("hw5-benchmark-results").hidden=false;
            $("hw5-benchmark-rows").replaceChildren();
            for(const x of points) {
                const expected=referenceValues.get(x);
                const s=normalSimpson(x,p.intervals),series=normalErfSeries(x,p.terms),fast=normalFast(x);
                const errors=[Math.abs(s-expected),Math.abs(series-expected),Math.abs(fast-expected)];
                if(Math.max(...errors)>highestError) {
                    highestError=Math.max(...errors);
                    largestMethod=["Simpson","erf series","Fast erf"][errors.indexOf(highestError)];
                }
                row("hw5-benchmark-rows",[
                    x,format(expected,12),format(s,12),format(series,12),format(fast,12),scientific(Math.max(...errors))
                ]);
            }
            const curves=benchmarkCurve();
            lastBenchmark={curves};
            chartLines("hw5-cdf-error-chart",curves,{logX:true,logY:true,xInteger:true,xTitle:"Effort: Simpson panels / series terms"});
            $("hw5-benchmark-note").textContent =
                `Across ${points.length} reference points, the largest absolute error was ${scientific(highestError)} (${largestMethod || "none"}). `+
                `The fast erf polynomial has fixed effort and a small approximation floor. `+
                `Simpson and the erf series improve with sufficient subdivisions/terms; numerical cancellation can impair the alternating series for large |x|.`;
            window.ChartMotion?.playCanvas($("hw5-cdf-error-chart"),"line");
            status("hw5-benchmark-status",`Validated ${points.length} CDF values against SciPy ndtr (Simpson ${p.intervals} panels; series ${p.terms} terms).`);
        }catch(error){status("hw5-benchmark-status",error.message,true);}
    }

    $("hw5-integral-form").addEventListener("submit",e=>{e.preventDefault();runIntegral();});
    $("hw5-convergence-button").addEventListener("click",runConvergence);
    $("hw5-cdf-form").addEventListener("submit",e=>{e.preventDefault();runCdf();});
    $("hw5-benchmark-button").addEventListener("click",runBenchmark);
    // No automatic rendering: all results appear only on button interaction.
    window.addEventListener("resize",()=>{
        if(lastIntegral){previewRiemann(lastIntegral.f,lastIntegral.n);previewLayers(lastIntegral.f,lastIntegral.layer);}
        if(lastConvergence){chartLines("hw5-error-chart",[
            {color:BLUE,points:lastConvergence.rows.map(z=>[z.n,Math.max(1e-15,z.re)])},
            {color:ORANGE,points:lastConvergence.rows.map(z=>[z.n,Math.max(1e-15,z.le)])}
        ],{logX:true,logY:true,xInteger:true,xTitle:"Domain subintervals N (log scale)"});}
        if(lastCdf)drawGaussian(lastCdf.x);
        if(lastBenchmark)chartLines("hw5-cdf-error-chart",lastBenchmark.curves,{logX:true,logY:true,xInteger:true,xTitle:"Effort: Simpson panels / series terms"});
    });
})();
