
/* ==========================================
   HOMEWORK 1 - STATISTICAL EXPLORATION
========================================== */

// 1. Generate all valid toy public keys
const samples = [];
let samplePoint = null;

for (let k = 1; k <= 8; k++) {
    samplePoint = add(samplePoint, G);
    samples.push({ k, x: samplePoint[0], y: samplePoint[1] });
}

const bits = n => n.toString(2).padStart(5, "0");

// Display the dataset
document.getElementById("sample-rows").innerHTML = samples.map(s => `
    <tr>
        <td>${s.k}</td>
        <td>(${s.x}, ${s.y})</td>
        <td>${bits(s.x)}</td>
        <td>${bits(s.y)}</td>
    </tr>
`).join("");


// 2. Coordinate frequency distributions
function frequencies(coordinate, elementId) {
    const counts = new Map();

    samples.forEach(s => {
        counts.set(s[coordinate], (counts.get(s[coordinate]) || 0) + 1);
    });

    document.getElementById(elementId).innerHTML = [...counts]
        .sort((a, b) => a[0] - b[0])
        .map(([value, count]) => `
            <div class="stat-row">
                <span>${value}</span>
                <div class="stat-track">
                    <div class="stat-bar"
                         style="width: ${100 * count / samples.length}%">
                    </div>
                </div>
                <strong>${count}/8</strong>
            </div>
        `).join("");

    return counts;
}

const xCounts = frequencies("x", "x-frequency");
const yCounts = frequencies("y", "y-frequency");

document.getElementById("unique-x").textContent = xCounts.size;
document.getElementById("unique-y").textContent = yCounts.size;


// 3. Bit frequency distribution
for (let b = 4; b >= 0; b--) {
    const count = coord => samples.reduce(
        (sum, s) => sum + ((s[coord] >> b) & 1), 0
    );

    const row = document.createElement("tr");

    row.innerHTML = `
        <td>b${b}</td>
        <td>${count("x")} / 8</td>
        <td>${count("y")} / 8</td>
    `;

    document.getElementById("bit-rows").appendChild(row);
}


// 4. Entropy and Pearson correlation
const entropy = counts => [...counts.values()].reduce((h, count) => {
    const probability = count / samples.length;
    return h - probability * Math.log2(probability);
}, 0);

function correlation(first, second) {
    const avg = a => a.reduce((sum, v) => sum + v, 0) / a.length;

    const a = avg(first), b = avg(second);

    const covariance = first.reduce(
        (sum, v, i) => sum + (v - a) * (second[i] - b), 0
    );

    const varianceA = first.reduce(
        (sum, v) => sum + (v - a) ** 2, 0
    );

    const varianceB = second.reduce(
        (sum, v) => sum + (v - b) ** 2, 0
    );

    return covariance / Math.sqrt(varianceA * varianceB);
}

const keys = samples.map(s => s.k);
const xs = samples.map(s => s.x);
const ys = samples.map(s => s.y);

document.getElementById("entropy-x").textContent =
    entropy(xCounts).toFixed(2);

document.getElementById("entropy-y").textContent =
    entropy(yCounts).toFixed(2);

document.getElementById("correlation-x").textContent =
    correlation(keys, xs).toFixed(3);

document.getElementById("correlation-y").textContent =
    correlation(keys, ys).toFixed(3);


// 5. Avalanche-like experiment
const pairs = [[2, 3], [4, 5], [6, 7]];
let totalChanged = 0;

document.getElementById("avalanche-rows").innerHTML =
    pairs.map(([a, b]) => {
        const P = samples[a - 1], Q = samples[b - 1];

        const first = bits(P.x) + bits(P.y);
        const second = bits(Q.x) + bits(Q.y);

        const changed = [...first].filter(
            (bit, i) => bit !== second[i]
        ).length;

        totalChanged += changed;

        return `
            <tr>
                <td>${a} → ${b}</td>
                <td>(${P.x}, ${P.y}) → (${Q.x}, ${Q.y})</td>
                <td>${changed} / 10</td>
            </tr>
        `;
    }).join("");

document.getElementById("avalanche-average").textContent =
    (totalChanged / pairs.length).toFixed(2);



// 6. Optional slow animation with a visible path
const replayButton = document.getElementById("replay-button");
const playbackStatus = document.getElementById("playback-status");
const curveTrail = document.getElementById("curve-trail");

let playbackTimer = null;

function stopPlayback() {
    if (playbackTimer !== null) {
        clearInterval(playbackTimer);
    }

    playbackTimer = null;
    replayButton.textContent = "▶ Replay steps";
}

replayButton.addEventListener("click", () => {
    // Stop an animation already running
    if (playbackTimer !== null) {
        stopPlayback();
        playbackStatus.textContent = "Playback stopped.";
        return;
    }

    const input = document.getElementById("private-key");
    const k = Number(input.value);

    if (input.value.trim() === "" ||
        !Number.isInteger(k) || k < 1 || k > 30) {
        playbackStatus.textContent = "Enter an integer between 1 and 30.";
        return;
    }

    // Reset the animation
    let i = 0;
    let point = null;
    let pathData = "";
    let previousFinite = false;

    const visited = new Set();

    curveTrail.setAttribute("d", "");
    replayButton.textContent = "■ Stop playback";

    function nextStep() {
        // Calculate the next multiple of G
        point = add(point, G);
        i++;

        if (point) {
            visited.add(point.join(","));

            // Convert mathematical coordinates to SVG coordinates
            const x = 45 + 20 * point[0];
            const y = 355 - 20 * point[1];

            // M starts a new path; L connects to the previous point
            pathData += `${previousFinite ? " L" : " M"} ${x} ${y}`;
            previousFinite = true;
        } else {
            // No line can be drawn to the point at infinity
            previousFinite = false;
        }

        // Update the visible path
        curveTrail.setAttribute("d", pathData);

        // Highlight the current and visited points
        const current = point ? point.join(",") : null;

        document.querySelectorAll("#curve-points circle").forEach(dot => {
            const xy = dot.dataset.point;

            dot.classList.toggle("is-visited", visited.has(xy));
            dot.classList.toggle("is-base", xy === G.join(","));
            dot.classList.toggle("is-current", xy === current);
            dot.setAttribute("r", xy === current ? 8 : 6);
        });

        playbackStatus.textContent =
            `Step ${i}/${k}: ${i}G = ${
                point ? `(${point.join(", ")})` : "∞"
            }`;

        if (i === k) stopPlayback();
    }

    // Show the first point immediately
    nextStep();

    // Continue every 700 milliseconds
    if (i < k) {
        playbackTimer = setInterval(nextStep, 700);
    }
});

// Stop playback and clear the path when calculating a new key
document.getElementById("calculate-button")
    .addEventListener("click", () => {
        stopPlayback();
        curveTrail.setAttribute("d", "");
        playbackStatus.textContent = "Ready to replay.";
    });


// Motion affects presentation only; computed statistics are unchanged.
if (window.ChartMotion) {
    ChartMotion.observeSvgPoints(document.getElementById("curve-points"));
    ChartMotion.observeBars(document.getElementById("x-frequency"), ".stat-bar");
    ChartMotion.observeBars(document.getElementById("y-frequency"), ".stat-bar");
}
