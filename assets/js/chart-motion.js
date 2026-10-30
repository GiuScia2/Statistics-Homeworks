/* Shared, dependency-free chart motion for Statistics Homeworks.
   Visual-only: never changes simulated data, estimators or chart values. */
(() => {
    "use strict";

    const active = new Map();
    const barObservers = new WeakMap();
    const reduceMotion = () => window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const ease = t => 1 - Math.pow(1 - t, 3);

    function cancel(canvas) {
        const old = active.get(canvas);
        if (old) {
            if (old.observer) old.observer.disconnect();
            if (old.frame !== null) cancelAnimationFrame(old.frame);
            active.delete(canvas);
        }
        canvas.style.clipPath = "";
        canvas.style.webkitClipPath = "";
    }

    function clip(canvas, direction, fraction) {
        const remaining = ((1 - fraction) * 100).toFixed(3) + "%";
        const value = direction === "bars"
            ? `inset(${remaining} 0 0 0)`
            : `inset(0 ${remaining} 0 0)`;
        canvas.style.clipPath = value;
        canvas.style.webkitClipPath = value;
    }

    function playCanvas(canvas, direction = "line", duration = 1050) {
        if (!canvas) return;
        cancel(canvas);
        if (reduceMotion()) return;

        const state = { observer: null, frame: null };
        active.set(canvas, state);
        clip(canvas, direction, 0);

        function start() {
            if (active.get(canvas) !== state) return;
            if (state.observer) {
                state.observer.disconnect();
                state.observer = null;
            }
            let startAt = null;
            function tick(time) {
                if (active.get(canvas) !== state) return;
                if (startAt === null) startAt = time;
                const fraction = Math.min(1, (time - startAt) / duration);
                clip(canvas, direction, ease(fraction));
                if (fraction < 1) {
                    state.frame = requestAnimationFrame(tick);
                } else {
                    cancel(canvas);
                }
            }
            state.frame = requestAnimationFrame(tick);
        }

        // Off-screen charts animate when the user actually reaches them.
        if ("IntersectionObserver" in window) {
            state.observer = new IntersectionObserver(entries => {
                if (entries.some(entry => entry.isIntersecting)) start();
            }, { threshold: 0.12 });
            // Observing the canvas itself would fail: a fully clipped canvas
            // has zero visible area and cannot trigger IntersectionObserver.
            state.observer.observe(canvas.parentElement || canvas);
        } else {
            start();
        }
    }

    function playMany(items) {
        for (const [id, direction] of items) {
            playCanvas(document.getElementById(id), direction);
        }
    }

    function playBars(container, selector, stagger = 55) {
        if (!container || reduceMotion()) return;
        const bars = Array.from(container.querySelectorAll(selector));
        bars.forEach((bar, i) => {
            bar.classList.remove("chart-motion-grow", "chart-motion-pending");
            bar.style.setProperty("--chart-motion-delay", `${Math.min(i * stagger, 450)}ms`);
            // Reflow is intentional so a repeated experiment replays animation.
            void bar.offsetWidth;
            bar.classList.add("chart-motion-grow");
        });
    }

    function observeBars(container, selector, stagger = 55) {
        if (!container || reduceMotion()) return;
        const old = barObservers.get(container);
        if (old) old.disconnect();
        const bars = container.querySelectorAll(selector);
        bars.forEach(bar => bar.classList.add("chart-motion-pending"));
        if (!("IntersectionObserver" in window)) {
            playBars(container, selector, stagger);
            return;
        }
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) {
                observer.disconnect();
                barObservers.delete(container);
                playBars(container, selector, stagger);
            }
        }, { threshold: 0.12 });
        barObservers.set(container, observer);
        observer.observe(container);
    }

    function observeSvgPoints(group) {
        if (!group || reduceMotion()) return;
        const dots = group.querySelectorAll("circle");
        dots.forEach((dot, index) => {
            dot.style.setProperty("--chart-motion-delay", `${Math.min(index * 23, 550)}ms`);
        });
        group.classList.add("chart-motion-points");
        if (!("IntersectionObserver" in window)) {
            group.classList.add("chart-motion-visible");
            return;
        }
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) {
                observer.disconnect();
                group.classList.add("chart-motion-visible");
            }
        }, { threshold: 0.12 });
        observer.observe(group.closest("svg") || group);
    }

    function finishAll() {
        for (const canvas of Array.from(active.keys())) cancel(canvas);
    }

    window.ChartMotion = {
        playCanvas, playMany, playBars, observeBars, observeSvgPoints, finishAll
    };
})();
