
/* ==========================================
   HOMEWORK 1 - ELLIPTIC CURVE CRYPTOGRAPHY
========================================== */

// 1. Curve parameters
const p = 17, G = [1, 5];

// 2. Modular arithmetic
const mod = n => (n % p + p) % p;

const inverse = a => Array.from({ length: p - 1 }, (_, i) => i + 1)
    .find(v => mod(a * v) === 1);

// 3. Elliptic-curve point addition
function add(P, Q) {
    if (!P) return Q;
    if (!Q) return P;

    const [x1, y1] = P, [x2, y2] = Q;

    if (x1 === x2 && mod(y1 + y2) === 0) return null;

    const doubling = x1 === x2;
    const numerator = doubling ? 3 * x1 ** 2 : y2 - y1;
    const denominator = doubling ? 2 * y1 : x2 - x1;
    const slope = mod(numerator * inverse(denominator));

    const x3 = mod(slope ** 2 - x1 - x2);
    return [x3, mod(slope * (x1 - x3) - y1)];
}

// 4. Generate all valid points on the curve
const dots = [];

for (let x = 0; x < p; x++) {
    for (let y = 0; y < p; y++) {
        if (mod(y ** 2 - x ** 3 - 7) !== 0) continue;

        dots.push(`
            <circle data-point="${x},${y}"
                    cx="${45 + 20 * x}"
                    cy="${355 - 20 * y}"
                    r="6">
                <title>(${x}, ${y})</title>
            </circle>
        `);
    }
}

document.getElementById("curve-points").innerHTML = dots.join("");

// 5. Calculate scalar multiplication
function calculate() {
    const input = document.getElementById("private-key");
    const k = Number(input.value);

    if (input.value.trim() === "" ||
        !Number.isInteger(k) || k < 1 || k > 30) {
        alert("Enter an integer between 1 and 30.");
        return;
    }

    let point = null;
    const steps = [];
    const visited = new Set();

    for (let i = 1; i <= k; i++) {
        point = add(point, G);

        if (point) visited.add(point.join(","));

        steps.push(`${i}G = ${point ? `(${point.join(", ")})` : "∞"}`);
    }

    // Display calculation results
    document.getElementById("calculation-steps").textContent =
        steps.join("\n");

    document.getElementById("public-key").textContent =
        point ? `Q = (${point.join(", ")})` : "Q = ∞ (invalid public key)";

    // Highlight points on the SVG graph
    const current = point ? point.join(",") : null;

    document.querySelectorAll("#curve-points circle").forEach(dot => {
        const xy = dot.dataset.point;

        dot.classList.toggle("is-visited", visited.has(xy));
        dot.classList.toggle("is-base", xy === G.join(","));
        dot.classList.toggle("is-current", xy === current);
        dot.setAttribute("r", xy === current ? 8 : 6);
    });
}

// 6. Button interaction and initial calculation
document.getElementById("calculate-button")
    .addEventListener("click", calculate);

calculate();
