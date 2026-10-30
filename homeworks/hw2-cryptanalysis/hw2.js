
(() => {
    "use strict";

    // secp256k1 domain parameters.
    const P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2Fn;

    const N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;

    const G = {
        x: 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n,
        y: 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n
    };

    const MAX_PRIVATE_KEY = 4096n;

    const encoder = new TextEncoder();
    const decoder = new TextDecoder("utf-8", { fatal: true });

    const messageInput = document.getElementById("hw2-message");
    const privateKeyInput = document.getElementById("hw2-private-key");

    const encryptButton = document.getElementById("hw2-encrypt");
    const decryptButton = document.getElementById("hw2-decrypt");

    const resultPanel = document.getElementById("hw2-ecc-result");

    const publicKeyOutput = document.getElementById("hw2-public-key");
    const ephemeralOutput = document.getElementById("hw2-ephemeral-key");
    const ciphertextOutput = document.getElementById("hw2-ciphertext");
    const plaintextOutput = document.getElementById("hw2-plaintext");

    const statusOutput = document.getElementById("hw2-ecc-status");

    let encryptedData = null;

    function mod(value) {
        return ((value % P) + P) % P;
    }

    // Modular inverse using the extended Euclidean algorithm.
    function inverse(value) {
        let a = mod(value);
        let b = P;

        let x = 1n;
        let y = 0n;

        while (b !== 0n) {
            const quotient = a / b;

            [a, b] = [b, a - quotient * b];
            [x, y] = [y, x - quotient * y];
        }

        if (a !== 1n) {
            throw new Error("Modular inverse does not exist.");
        }

        return mod(x);
    }

    // The point at infinity is represented by null.
    function pointAdd(a, b) {
        if (a === null) return b;
        if (b === null) return a;

        if (a.x === b.x && mod(a.y + b.y) === 0n) {
            return null;
        }

        const slope = a.x === b.x
            ? mod(3n * a.x * a.x * inverse(2n * a.y))
            : mod((b.y - a.y) * inverse(b.x - a.x));

        const x = mod(slope * slope - a.x - b.x);
        const y = mod(slope * (a.x - x) - a.y);

        return { x, y };
    }

    function scalarMultiply(scalar, point) {
        let k = scalar;
        let result = null;
        let addend = point;

        while (k > 0n) {
            if (k & 1n) {
                result = pointAdd(result, addend);
            }

            addend = pointAdd(addend, addend);
            k >>= 1n;
        }

        return result;
    }

    function bytes32(value) {
        const hex = value.toString(16).padStart(64, "0");

        return Uint8Array.from(
            hex.match(/../g),
            byte => parseInt(byte, 16)
        );
    }

    function toHex(bytes) {
        return Array.from(
            bytes,
            byte => byte.toString(16).padStart(2, "0")
        ).join("");
    }

    function compressedPoint(point) {
        const prefix = point.y % 2n === 0n ? "02" : "03";
        return prefix + toHex(bytes32(point.x));
    }

    function randomScalar() {
        while (true) {
            const randomBytes = crypto.getRandomValues(
                new Uint8Array(32)
            );

            const value = BigInt("0x" + toHex(randomBytes));

            if (value > 0n && value < N) {
                return value;
            }
        }
    }

    // Educational SHA-256 keystream.
    // This is NOT a production ECIES implementation.
    async function derivePad(sharedPoint, ephemeralPoint, length) {
        const label = encoder.encode("STATS-HW2-TOY-KDF-v1");

        const sharedX = bytes32(sharedPoint.x);

        const ephemeral = Uint8Array.from(
            compressedPoint(ephemeralPoint).match(/../g),
            byte => parseInt(byte, 16)
        );

        const pad = new Uint8Array(length);

        for (
            let offset = 0, counter = 0;
            offset < length;
            offset += 32, counter++
        ) {
            const input = new Uint8Array(
                label.length + 32 + 33 + 4
            );

            input.set(label, 0);
            input.set(sharedX, label.length);
            input.set(ephemeral, label.length + 32);

            new DataView(input.buffer).setUint32(
                input.length - 4,
                counter,
                false
            );

            const hash = new Uint8Array(
                await crypto.subtle.digest("SHA-256", input)
            );

            pad.set(
                hash.slice(0, Math.min(32, length - offset)),
                offset
            );
        }

        return pad;
    }

    function xorBytes(data, pad) {
        return data.map(
            (value, index) => value ^ pad[index]
        );
    }

    function readPrivateKey() {
        const raw = privateKeyInput.value.trim();

        if (!/^\d+$/.test(raw)) {
            throw new Error("Enter a whole-number private key.");
        }

        const key = BigInt(raw);

        if (key < 1n || key > MAX_PRIVATE_KEY) {
            throw new Error(
                "The toy private key must be between 1 and 4096."
            );
        }

        return key;
    }

    function setStatus(message, error = false) {
        statusOutput.textContent = message;
        statusOutput.classList.toggle("hw2-error", error);
    }

    // Encrypt the message.
    encryptButton.addEventListener("click", async () => {
        encryptButton.disabled = true;

        encryptedData = null;
        decryptButton.disabled = true;
        resultPanel.hidden = true;

        plaintextOutput.textContent = "—";

        try {
            const d = readPrivateKey();
            const message = messageInput.value;

            if (message.trim().length === 0) {
                throw new Error(
                    "Enter a message before encrypting."
                );
            }

            if (!crypto.subtle) {
                throw new Error(
                    "Use Live Server (localhost) or HTTPS for Web Crypto."
                );
            }

            // Receiver's public key.
            const Q = scalarMultiply(d, G);

            // Fresh ephemeral scalar and public point.
            const r = randomScalar();
            const R = scalarMultiply(r, G);

            // Sender's shared secret.
            const S = scalarMultiply(r, Q);

            const plainBytes = encoder.encode(message);
            const pad = await derivePad(
                S,
                R,
                plainBytes.length
            );

            const ciphertext = xorBytes(plainBytes, pad);

            encryptedData = { R, Q, ciphertext };

            publicKeyOutput.textContent = compressedPoint(Q);
            ephemeralOutput.textContent = compressedPoint(R);
            ciphertextOutput.textContent = toHex(ciphertext);

            resultPanel.hidden = false;
            decryptButton.disabled = false;

            setStatus(
                "Encryption completed. Now decrypt with the matching private key."
            );

        } catch (error) {
            setStatus(error.message, true);

        } finally {
            encryptButton.disabled = false;
        }
    });

    // Decrypt the ciphertext.
    decryptButton.addEventListener("click", async () => {
        if (!encryptedData) return;

        decryptButton.disabled = true;

        try {
            const d = readPrivateKey();

            const currentPublicKey = compressedPoint(
                scalarMultiply(d, G)
            );

            const originalPublicKey = compressedPoint(
                encryptedData.Q
            );

            if (currentPublicKey !== originalPublicKey) {
                throw new Error(
                    "This private key does not match the encryption public key."
                );
            }

            // Receiver's shared secret.
            const S = scalarMultiply(
                d,
                encryptedData.R
            );

            const pad = await derivePad(
                S,
                encryptedData.R,
                encryptedData.ciphertext.length
            );

            const recoveredBytes = xorBytes(
                encryptedData.ciphertext,
                pad
            );

            plaintextOutput.textContent = decoder.decode(
                recoveredBytes
            );

            setStatus(
                "Decryption successful: the original message was recovered."
            );

        } catch (error) {
            plaintextOutput.textContent = "—";
            setStatus(error.message, true);

        } finally {
            decryptButton.disabled = false;
        }
    });
})();


/* =========================================
   SECTION 03 — CAESAR CIPHER
   ========================================= */

(() => {
    "use strict";

    const messageInput = document.getElementById("hw2-message");

    const keyInput = document.getElementById("hw2-caesar-key");

    const messagePreview = document.getElementById(
        "hw2-caesar-preview"
    );

    const encryptButton = document.getElementById(
        "hw2-caesar-encrypt"
    );

    const decryptButton = document.getElementById(
        "hw2-caesar-decrypt"
    );

    const statusOutput = document.getElementById(
        "hw2-caesar-status"
    );

    const resultPanel = document.getElementById(
        "hw2-caesar-result"
    );

    const originalOutput = document.getElementById(
        "hw2-caesar-original"
    );

    const ciphertextOutput = document.getElementById(
        "hw2-caesar-ciphertext"
    );

    const plaintextOutput = document.getElementById(
        "hw2-caesar-plaintext"
    );

    const keyOutput = document.getElementById(
        "hw2-caesar-used-key"
    );

    let encryptedData = null;

    // Display status messages.
    function setStatus(message, error = false) {
        statusOutput.textContent = message;

        statusOutput.classList.toggle(
            "hw2-error",
            error
        );
    }

    // Read and validate the Caesar key.
    function readKey() {
        const raw = keyInput.value.trim();

        if (!/^\d+$/.test(raw)) {
            throw new Error(
                "Enter a whole-number shift key."
            );
        }

        const key = Number(raw);

        if (!Number.isInteger(key) || key < 0 || key > 25) {
            throw new Error(
                "The Caesar key must be between 0 and 25."
            );
        }

        return key;
    }

    // Shift ASCII alphabetic characters.
    function caesarTransform(text, shift) {
        const normalizedShift = ((shift % 26) + 26) % 26;

        let result = "";

        for (const character of text) {
            const code = character.charCodeAt(0);

            // Uppercase letters: A-Z.
            if (code >= 65 && code <= 90) {
                const shifted =
                    ((code - 65 + normalizedShift) % 26) + 65;

                result += String.fromCharCode(shifted);
            }

            // Lowercase letters: a-z.
            else if (code >= 97 && code <= 122) {
                const shifted =
                    ((code - 97 + normalizedShift) % 26) + 97;

                result += String.fromCharCode(shifted);
            }

            // Preserve spaces, numbers, and punctuation.
            else {
                result += character;
            }
        }

        return result;
    }

    // Caesar encryption.
    function caesarEncrypt(message, key) {
        return caesarTransform(message, key);
    }

    // Caesar decryption.
    function caesarDecrypt(ciphertext, key) {
        return caesarTransform(ciphertext, -key);
    }

    // Synchronize with the ECC message.
    function updateMessagePreview() {
        messagePreview.textContent = messageInput.value;
    }

    function resetResults() {
        encryptedData = null;

        decryptButton.disabled = true;
        resultPanel.hidden = true;

        plaintextOutput.textContent = "—";

        setStatus(
            "Select a shift key and encrypt the message."
        );
    }

    // Update the preview when the shared message changes.
    messageInput.addEventListener("input", () => {
        updateMessagePreview();
        resetResults();
    });

    // Initialize the preview.
    updateMessagePreview();

    // Encrypt.
    encryptButton.addEventListener("click", () => {
        try {
            const message = messageInput.value;
            const key = readKey();

            if (message.trim().length === 0) {
                throw new Error(
                    "Enter a message before encrypting."
                );
            }

            const ciphertext = caesarEncrypt(message, key);

            encryptedData = {
                original: message,
                ciphertext: ciphertext,
                encryptionKey: key
            };

            originalOutput.textContent = message;

            ciphertextOutput.textContent = ciphertext;

            plaintextOutput.textContent = "—";

            keyOutput.textContent = String(key);

            resultPanel.hidden = false;

            decryptButton.disabled = false;

            setStatus(
                "Caesar encryption completed. " +
                "Now decrypt the ciphertext."
            );

        } catch (error) {
            resetResults();
            setStatus(error.message, true);
        }
    });

    // Decrypt.
    decryptButton.addEventListener("click", () => {
        if (!encryptedData) {
            return;
        }

        try {
            const key = readKey();

            const recoveredMessage = caesarDecrypt(
                encryptedData.ciphertext,
                key
            );

            plaintextOutput.textContent = recoveredMessage;

            if (recoveredMessage === encryptedData.original) {
                setStatus(
                    "Decryption successful: " +
                    "the original message was recovered."
                );
            } else {
                setStatus(
                    "The decrypted message does not match " +
                    "the original. Check the shift key.",
                    true
                );
            }

        } catch (error) {
            plaintextOutput.textContent = "—";
            setStatus(error.message, true);
        }
    });

})();


/* =========================================
   SECTIONS 04–05 — CAESAR CRYPTANALYSIS
   ========================================= */

(() => {
    "use strict";

    // Standard approximate English frequencies, A to Z (%).
    const ENGLISH_FREQUENCIES = [
        8.167, 1.492, 2.782, 4.253, 12.702, 2.228, 2.015,
        6.094, 6.966, 0.153, 0.772, 4.025, 2.406, 6.749,
        7.507, 1.929, 0.095, 5.987, 6.327, 9.056, 2.758,
        0.978, 2.360, 0.150, 1.974, 0.074
    ];

    // Held-out English text for ciphertext-length experiments.
    // It is not used to build the default reference frequencies.
    const TEST_TEXT = [
        `At the beginning of the autumn term, a group of students decided to investigate how everyday observations could become reliable evidence. They met in the university library on a quiet afternoon and began by writing down questions that interested them. Some wanted to study changes in the weather, others preferred the movement of people through the city, and a few were curious about the ways in which information spreads between friends. The group soon discovered that asking a clear question was only the first step in a much longer process. They would need careful measurements, a consistent method, and enough observations to distinguish a genuine pattern from an accidental coincidence.`,

        `Over the following weeks, the students collected information from several sources. They recorded temperatures at the same time each morning, counted bicycles passing a busy intersection, and gathered anonymous responses to a short questionnaire about daily reading habits. Before comparing their results, they checked every entry for missing values and obvious mistakes. They learned that a large table of numbers can look convincing even when the measurements are unreliable. A good analysis therefore begins with a close examination of where the data came from, how the sample was selected, and which assumptions might influence the conclusions.`,

        `One evening, the class discussed a familiar problem from communication networks. A message must travel from one computer to another, sometimes passing through many intermediate devices. The sender wants the receiver to obtain exactly the intended information, even when the connection is noisy or unreliable. Engineers solve different parts of this problem through encoding, error detection, retransmission, and careful network design. Security introduces another concern: some messages should remain private, so a person watching the network must not be able to understand their contents. This is one reason why mathematics plays such an important role in modern communication.`,

        `The instructor explained that encryption and statistical analysis answer different questions. Encryption attempts to hide the meaning of a message from an unauthorized reader. Statistical analysis searches for regularities in observations and helps determine whether a proposed explanation is plausible. In a weak cipher these ideas can meet, because the encrypted text may preserve patterns that are characteristic of the original language. If the key comes from a very small set of possibilities, an attacker may also try each candidate directly. The effectiveness of an attack depends on the design of the scheme, the available information, and the resources required to test possible answers.`,

        `During a practical lesson, students compared short notes with longer passages of ordinary English. The brief notes often contained unusual combinations of letters and provided too little evidence to identify a reliable pattern. Longer passages tended to produce more stable estimates, although the subject of the writing still mattered. A technical article might use certain words repeatedly, while a story about travel might favor a different vocabulary. For this reason, a reference collection should represent the language and style of the material being examined. More data can improve an estimate, but quantity alone does not guarantee that the sample is appropriate.`
    ].join("\n\n");

    const ciphertextInput = document.getElementById(
        "hw2-attack-ciphertext"
    );

    const referenceInput = document.getElementById(
        "hw2-reference-corpus"
    );

    const statusOutput = document.getElementById(
        "hw2-attack-status"
    );

    const resultPanel = document.getElementById(
        "hw2-attack-result"
    );

    const testPanel = document.getElementById(
        "hw2-length-results"
    );

    const testsStatus = document.getElementById(
        "hw2-length-status"
    );

    if (!ciphertextInput || !referenceInput) return;

    function setStatus(element, message, error = false) {
        element.textContent = message;

        element.classList.toggle(
            "hw2-error",
            error
        );
    }

    // Count English letters A-Z.
    function countLetters(text) {
        const counts = new Array(26).fill(0);
        let total = 0;

        for (const character of text.toUpperCase()) {
            const index = character.charCodeAt(0) - 65;

            if (index >= 0 && index < 26) {
                counts[index]++;
                total++;
            }
        }

        return { counts, total };
    }

    // Shift letters while preserving spaces and punctuation.
    function shiftLetters(text, shift) {
        const normalized = ((shift % 26) + 26) % 26;

        return text.replace(/[A-Za-z]/g, character => {
            const code = character.charCodeAt(0);
            const base = code >= 97 ? 97 : 65;

            return String.fromCharCode(
                base + (code - base + normalized) % 26
            );
        });
    }

    // Select default frequencies or derive them from a corpus.
    function getReference() {
        const text = referenceInput.value.trim();

        if (!text) {
            const total = ENGLISH_FREQUENCIES.reduce(
                (a, b) => a + b,
                0
            );

            return {
                probabilities: ENGLISH_FREQUENCIES.map(
                    value => value / total
                ),

                description:
                    "Standard English reference frequencies"
            };
        }

        const { counts, total } = countLetters(text);

        if (total < 1000) {
            throw new Error(
                "The custom reference corpus needs at least " +
                "1,000 A-Z letters (5,000+ recommended)."
            );
        }

        // Additive smoothing prevents zero expected frequencies.
        const probabilities = counts.map(
            count => (count + 0.5) / (total + 13)
        );

        return {
            probabilities,

            description:
                `Custom English corpus: ${total.toLocaleString()} letters`
        };
    }

    // Evaluate all 26 keys using the chi-squared statistic.
    function rankKeys(ciphertext, probabilities) {
        const { counts, total } = countLetters(ciphertext);

        if (total < 5) {
            throw new Error(
                "Enter ciphertext with at least 5 English letters."
            );
        }

        const candidates = [];

        for (let key = 0; key < 26; key++) {
            let chiSquared = 0;

            for (let index = 0; index < 26; index++) {
                const observed =
                    counts[(index + key) % 26];

                const expected =
                    total * probabilities[index];

                chiSquared +=
                    (observed - expected) ** 2 / expected;
            }

            candidates.push({
                key,
                score: chiSquared
            });
        }

        candidates.sort(
            (a, b) =>
                a.score - b.score ||
                a.key - b.key
        );

        return { candidates, total, counts };
    }

    // Create a table cell safely.
    function createCell(row, value) {
        const cell = document.createElement("td");

        cell.textContent = String(value);
        row.appendChild(cell);
    }

    // Display candidate keys and plaintext previews.
    function renderCandidates(
        tableBody,
        candidates,
        ciphertext,
        limit
    ) {
        tableBody.replaceChildren();

        for (const candidate of candidates.slice(0, limit)) {
            const row = document.createElement("tr");

            const plaintext = shiftLetters(
                ciphertext,
                -candidate.key
            );

            createCell(row, candidate.key);

            createCell(
                row,
                candidate.score.toFixed(2)
            );

            createCell(
                row,
                plaintext.length > 95
                    ? plaintext.slice(0, 95) + "…"
                    : plaintext
            );

            tableBody.appendChild(row);
        }
    }

    // Compare recovered and expected letter frequencies.
    function renderFrequencies(
        counts,
        total,
        key,
        probabilities
    ) {
        const tbody = document.getElementById(
            "hw2-frequency-rows"
        );

        tbody.replaceChildren();

        for (let index = 0; index < 26; index++) {
            const row = document.createElement("tr");

            const observed =
                100 * counts[(index + key) % 26] / total;

            createCell(
                row,
                String.fromCharCode(65 + index)
            );

            createCell(
                row,
                (100 * probabilities[index]).toFixed(2) + "%"
            );

            createCell(
                row,
                observed.toFixed(2) + "%"
            );

            tbody.appendChild(row);
        }
    }

    function clearResults() {
        resultPanel.hidden = true;
        testPanel.hidden = true;
    }

    // Invalidate previous results when inputs change.
    ciphertextInput.addEventListener("input", () => {
        resultPanel.hidden = true;

        setStatus(
            statusOutput,
            "Ciphertext changed. Recover the key again."
        );
    });

    referenceInput.addEventListener("input", () => {
        clearResults();

        setStatus(
            statusOutput,
            "Reference changed. Recover the key again."
        );

        setStatus(
            testsStatus,
            "Run the length experiment with the new reference."
        );
    });

    // Import the encrypted message from Section 03.
    document.getElementById(
        "hw2-use-caesar"
    ).addEventListener("click", () => {
        const source = document.getElementById(
            "hw2-caesar-ciphertext"
        );

        const value = source
            ? source.textContent.trim()
            : "";

        if (!value) {
            setStatus(
                statusOutput,
                "First encrypt the message in Section 03.",
                true
            );

            return;
        }

        ciphertextInput.value = value;
        resultPanel.hidden = true;

        setStatus(
            statusOutput,
            "Caesar ciphertext imported. Ready to recover its key."
        );
    });

    // Generate a longer encrypted English sample.
    document.getElementById(
        "hw2-long-sample"
    ).addEventListener("click", () => {
        const keyInput = document.getElementById(
            "hw2-caesar-key"
        );

        const raw = keyInput
            ? keyInput.value.trim()
            : "";

        if (!/^\d+$/.test(raw) || Number(raw) > 25) {
            setStatus(
                statusOutput,
                "Set a Caesar shift from 0 to 25 in Section 03.",
                true
            );

            return;
        }

        ciphertextInput.value = shiftLetters(
            TEST_TEXT.slice(0, 1500),
            Number(raw)
        );

        resultPanel.hidden = true;

        setStatus(
            statusOutput,
            "Long English sample encrypted. Try recovering its key."
        );
    });

    // Run the statistical attack on the selected ciphertext.
    document.getElementById(
        "hw2-run-attack"
    ).addEventListener("click", () => {
        try {
            const ciphertext = ciphertextInput.value;

            const reference = getReference();

            const { candidates, total, counts } = rankKeys(
                ciphertext,
                reference.probabilities
            );

            const best = candidates[0];

            document.getElementById(
                "hw2-recovered-key"
            ).textContent = best.key;

            document.getElementById(
                "hw2-attack-length"
            ).textContent = total;

            document.getElementById(
                "hw2-attack-reference"
            ).textContent = reference.description;

            document.getElementById(
                "hw2-attack-plaintext"
            ).textContent = shiftLetters(
                ciphertext,
                -best.key
            );

            renderCandidates(
                document.getElementById(
                    "hw2-top-candidates"
                ),
                candidates,
                ciphertext,
                5
            );

            renderCandidates(
                document.getElementById(
                    "hw2-all-candidates"
                ),
                candidates,
                ciphertext,
                26
            );

            renderFrequencies(
                counts,
                total,
                best.key,
                reference.probabilities
            );

            resultPanel.hidden = false;

            setStatus(
                statusOutput,
                total < 100
                    ? "Best statistical guess found. " +
                      "Warning: short ciphertexts can " +
                      "produce unreliable rankings."
                    : "Best statistical guess found. " +
                      "Verify the recovered plaintext; " +
                      "the result is not guaranteed."
            );

        } catch (error) {
            resultPanel.hidden = true;

            setStatus(
                statusOutput,
                error.message,
                true
            );
        }
    });

    // Deterministic pseudorandom generator for reproducible tests.
    function makeRandom(seed) {
        let state = seed >>> 0;

        return () => {
            state = (
                1664525 * state + 1013904223
            ) >>> 0;

            return state / 4294967296;
        };
    }

    // Measure success rates for different ciphertext lengths.
    document.getElementById(
        "hw2-run-length-tests"
    ).addEventListener("click", () => {
        try {
            const reference = getReference();

            const letters = TEST_TEXT
                .toUpperCase()
                .replace(/[^A-Z]/g, "");

            const lengths = [
                10, 20, 50, 100, 250, 500, 1000
            ];

            const trials = 50;
            const random = makeRandom(20261019);

            const rows = document.getElementById(
                "hw2-length-rows"
            );

            const bars = document.getElementById(
                "hw2-length-bars"
            );

            rows.replaceChildren();
            bars.replaceChildren();

            for (const length of lengths) {
                let successes = 0;

                for (
                    let trial = 0;
                    trial < trials;
                    trial++
                ) {
                    const start = Math.floor(
                        random() *
                        (letters.length - length + 1)
                    );

                    const actualKey =
                        1 + Math.floor(random() * 25);

                    const message = letters.slice(
                        start,
                        start + length
                    );

                    const ciphertext = shiftLetters(
                        message,
                        actualKey
                    );

                    const { candidates } = rankKeys(
                        ciphertext,
                        reference.probabilities
                    );

                    if (
                        candidates[0].key === actualKey
                    ) {
                        successes++;
                    }
                }

                const accuracy =
                    100 * successes / trials;

                // Table row.
                const row = document.createElement("tr");

                createCell(row, length);

                createCell(
                    row,
                    successes + " / " + trials
                );

                createCell(
                    row,
                    accuracy.toFixed(1) + "%"
                );

                rows.appendChild(row);

                // Chart row.
                const barRow = document.createElement("div");
                barRow.className = "hw2-length-bar-row";

                const label = document.createElement("span");
                label.textContent = length + " letters";

                const track = document.createElement("div");
                track.className = "hw2-length-bar-track";

                const bar = document.createElement("div");
                bar.className = "hw2-length-bar-fill";
                bar.style.width = accuracy + "%";

                track.appendChild(bar);

                const percentage = document.createElement(
                    "strong"
                );

                percentage.textContent =
                    accuracy.toFixed(0) + "%";

                barRow.append(
                    label,
                    track,
                    percentage
                );

                bars.appendChild(barRow);
            }

            testPanel.hidden = false;

            if (window.ChartMotion) {
                ChartMotion.observeBars(bars, ".hw2-length-bar-fill", 90);
            }

            setStatus(
                testsStatus,
                "Completed 50 trials per length using " +
                "held-out English text and random Caesar keys."
            );

        } catch (error) {
            testPanel.hidden = true;

            setStatus(
                testsStatus,
                error.message,
                true
            );
        }
    });

})();


/* =========================================
   SECTION 06 — ECC PRIVATE-KEY RECOVERY
   ========================================= */

(() => {
    "use strict";

    // secp256k1 field prime.
    const P =
        0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2Fn;

    // secp256k1 generator.
    const G = {
        x: 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n,
        y: 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n
    };

    const targetInput = document.getElementById(
        "hw2-ecc-attack-target"
    );

    const limitInput = document.getElementById(
        "hw2-ecc-attack-limit"
    );

    const loadButton = document.getElementById(
        "hw2-load-ecc-public-key"
    );

    const attackButton = document.getElementById(
        "hw2-run-ecc-attack"
    );

    const statusOutput = document.getElementById(
        "hw2-ecc-attack-status"
    );

    const progressPanel = document.getElementById(
        "hw2-ecc-attack-progress"
    );

    const progressTrack = document.getElementById(
        "hw2-ecc-progress-track"
    );

    const progressFill = document.getElementById(
        "hw2-ecc-progress-fill"
    );

    const progressLabel = document.getElementById(
        "hw2-ecc-progress-label"
    );

    const resultPanel = document.getElementById(
        "hw2-ecc-attack-result"
    );

    if (!targetInput || !attackButton) return;

    let running = false;

    function mod(value) {
        return ((value % P) + P) % P;
    }

    // Extended Euclidean modular inverse.
    function inverse(value) {
        let a = mod(value);
        let b = P;

        let x = 1n;
        let y = 0n;

        while (b !== 0n) {
            const quotient = a / b;

            [a, b] = [
                b,
                a - quotient * b
            ];

            [x, y] = [
                y,
                x - quotient * y
            ];
        }

        if (a !== 1n) {
            throw new Error(
                "Modular inverse does not exist."
            );
        }

        return mod(x);
    }

    // Elliptic-curve point addition.
    function pointAdd(a, b) {
        if (a === null) return b;
        if (b === null) return a;

        if (
            a.x === b.x &&
            mod(a.y + b.y) === 0n
        ) {
            return null;
        }

        let slope;

        if (a.x === b.x) {
            slope = mod(
                3n * a.x * a.x *
                inverse(2n * a.y)
            );
        } else {
            slope = mod(
                (b.y - a.y) *
                inverse(b.x - a.x)
            );
        }

        const x = mod(
            slope * slope - a.x - b.x
        );

        const y = mod(
            slope * (a.x - x) - a.y
        );

        return { x, y };
    }

    // Compressed secp256k1 public-key representation.
    function compressPoint(point) {
        const prefix =
            point.y % 2n === 0n ? "02" : "03";

        return prefix +
            point.x.toString(16).padStart(64, "0");
    }

    function setStatus(message, error = false) {
        statusOutput.textContent = message;

        statusOutput.classList.toggle(
            "hw2-error",
            error
        );
    }

    function updateProgress(attempts, limit) {
        const percentage =
            100 * attempts / limit;

        progressFill.style.width =
            percentage + "%";

        progressTrack.setAttribute(
            "aria-valuemax",
            String(limit)
        );

        progressTrack.setAttribute(
            "aria-valuenow",
            String(attempts)
        );

        progressLabel.textContent =
            attempts.toLocaleString() +
            " / " +
            limit.toLocaleString() +
            " candidate keys tested (" +
            percentage.toFixed(1) +
            "%)";
    }

    function resetAttack() {
        if (running) return;

        resultPanel.hidden = true;
        progressPanel.hidden = true;

        setStatus(
            "Ready to perform exhaustive key search."
        );
    }

    targetInput.addEventListener(
        "input",
        resetAttack
    );

    limitInput.addEventListener(
        "change",
        resetAttack
    );

    // Import only the PUBLIC key from Section 02.
    loadButton.addEventListener("click", () => {
        const publicKey = document.getElementById(
            "hw2-public-key"
        );

        const value = publicKey
            ? publicKey.textContent.trim()
            : "";

        if (!/^(02|03)[0-9a-f]{64}$/i.test(value)) {
            setStatus(
                "First encrypt a message in Section 02 " +
                "to generate the receiver's public key.",
                true
            );

            return;
        }

        targetInput.value = value;

        resetAttack();

        setStatus(
            "Public key imported. " +
            "The attacker can now search for the private key."
        );
    });

    // Exhaustively test d = 1, 2, ..., searchLimit.
    attackButton.addEventListener("click", async () => {
        if (running) return;

        const target = targetInput.value
            .trim()
            .toLowerCase();

        if (!/^(02|03)[0-9a-f]{64}$/.test(target)) {
            setStatus(
                "Enter a valid 66-character compressed " +
                "secp256k1 public key.",
                true
            );

            return;
        }

        const limit = Number(limitInput.value);

        if (
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > 4096
        ) {
            setStatus(
                "The search limit must be between 1 and 4096.",
                true
            );

            return;
        }

        running = true;

        attackButton.disabled = true;
        loadButton.disabled = true;
        targetInput.disabled = true;
        limitInput.disabled = true;

        resultPanel.hidden = true;
        progressPanel.hidden = false;

        updateProgress(0, limit);

        setStatus(
            "Searching for a matching private key..."
        );

        try {
            const startTime = performance.now();

            let currentPoint = G;
            let recoveredKey = null;
            let verifiedPublicKey = null;
            let attempts = 0;

            /*
             * Candidate d = 1 corresponds to G.
             * Each next candidate is calculated
             * by adding G to the previous point.
             *
             * This searches for d using ONLY Q.
             */

            for (
                let candidate = 1;
                candidate <= limit;
                candidate++
            ) {
                attempts++;

                const candidatePublicKey =
                    compressPoint(currentPoint);

                if (candidatePublicKey === target) {
                    recoveredKey = candidate;
                    verifiedPublicKey = candidatePublicKey;

                    break;
                }

                if (candidate < limit) {
                    currentPoint = pointAdd(
                        currentPoint,
                        G
                    );
                }

                // Yield periodically to update the interface.
                if (candidate % 128 === 0) {
                    updateProgress(
                        attempts,
                        limit
                    );

                    await new Promise(resolve => {
                        setTimeout(resolve, 0);
                    });
                }
            }

            const elapsed =
                performance.now() - startTime;

            const coverage =
                100 * attempts / limit;

            updateProgress(
                attempts,
                limit
            );

            document.getElementById(
                "hw2-ecc-recovered-key"
            ).textContent =
                recoveredKey === null
                    ? "Not found"
                    : String(recoveredKey);

            document.getElementById(
                "hw2-ecc-attempts"
            ).textContent =
                attempts.toLocaleString();

            document.getElementById(
                "hw2-ecc-attack-time"
            ).textContent =
                elapsed.toFixed(2) + " ms";

            document.getElementById(
                "hw2-ecc-coverage"
            ).textContent =
                coverage.toFixed(1) + "%";

            const verification = document.getElementById(
                "hw2-ecc-attack-verification"
            );

            const observation = document.getElementById(
                "hw2-ecc-attack-observation"
            );

            if (recoveredKey !== null) {
                verification.textContent =
                    "Matching public key:\n" +
                    verifiedPublicKey;

                observation.textContent =
                    "Private key d = " +
                    recoveredKey +
                    " was recovered after " +
                    attempts +
                    " candidate tests. " +
                    "The attack used only the public key " +
                    "and the restricted search interval.";

                setStatus(
                    "Attack successful: " +
                    "the receiver's private key was recovered."
                );

            } else {
                verification.textContent =
                    "No matching public key found " +
                    "within the selected search interval.";

                observation.textContent =
                    "All " +
                    limit.toLocaleString() +
                    " candidate keys were tested. " +
                    "The target private key may lie " +
                    "outside this interval, or the " +
                    "supplied public key may not belong " +
                    "to the restricted toy key space.";

                setStatus(
                    "Search completed: no matching key " +
                    "found in the selected interval."
                );
            }

            resultPanel.hidden = false;

        } catch (error) {
            resultPanel.hidden = true;

            setStatus(
                "Attack failed: " + error.message,
                true
            );

        } finally {
            running = false;

            attackButton.disabled = false;
            loadButton.disabled = false;
            targetInput.disabled = false;
            limitInput.disabled = false;
        }
    });

})();


/* =========================================
   SECTION 07 — EXPERIMENT SUMMARY
   ========================================= */

(() => {
    "use strict";

    const updateButton = document.getElementById(
        "hw2-update-summary"
    );

    if (!updateButton) return;

    function textOf(id) {
        const element = document.getElementById(id);

        return element
            ? element.textContent.trim()
            : "";
    }

    function isVisible(id) {
        const element = document.getElementById(id);

        return element && !element.hidden;
    }

    function setText(id, value) {
        document.getElementById(id).textContent = value;
    }

    updateButton.addEventListener("click", () => {

        // Caesar statistical attack summary.
        if (isVisible("hw2-attack-result")) {

            const key = textOf(
                "hw2-recovered-key"
            );

            const length = textOf(
                "hw2-attack-length"
            );

            setText(
                "hw2-summary-caesar-key",
                "k = " + key
            );

            setText(
                "hw2-summary-caesar-detail",
                "Best chi-squared candidate from " +
                length +
                " analyzed letters."
            );

        } else {

            setText(
                "hw2-summary-caesar-key",
                "Not tested"
            );

            setText(
                "hw2-summary-caesar-detail",
                "Run the statistical attack in Section 05."
            );
        }

        // ECC private-key recovery summary.
        if (isVisible("hw2-ecc-attack-result")) {

            const key = textOf(
                "hw2-ecc-recovered-key"
            );

            const attempts = textOf(
                "hw2-ecc-attempts"
            );

            const time = textOf(
                "hw2-ecc-attack-time"
            );

            setText(
                "hw2-summary-ecc-key",
                key === "Not found"
                    ? "No match"
                    : "d = " + key
            );

            setText(
                "hw2-summary-ecc-detail",
                attempts +
                " candidate keys tested in " +
                time +
                "."
            );

        } else {

            setText(
                "hw2-summary-ecc-key",
                "Not tested"
            );

            setText(
                "hw2-summary-ecc-detail",
                "Run the restricted-key attack in Section 06."
            );
        }

        // Ciphertext-length experiment summary.
        if (isVisible("hw2-length-results")) {

            const rows = Array.from(
                document.querySelectorAll(
                    "#hw2-length-rows tr"
                )
            );

            if (rows.length > 0) {

                const first = rows[0];
                const last = rows[rows.length - 1];

                const shortLength =
                    first.cells[0].textContent.trim();

                const shortRate =
                    first.cells[2].textContent.trim();

                const longLength =
                    last.cells[0].textContent.trim();

                const longRate =
                    last.cells[2].textContent.trim();

                setText(
                    "hw2-summary-length",
                    rows.length + " lengths"
                );

                setText(
                    "hw2-summary-length-detail",
                    shortLength +
                    " letters: " +
                    shortRate +
                    " success. " +
                    longLength +
                    " letters: " +
                    longRate +
                    " success."
                );

            }

        } else {

            setText(
                "hw2-summary-length",
                "Not tested"
            );

            setText(
                "hw2-summary-length-detail",
                "Run the length experiment in Section 05."
            );
        }

        document.getElementById(
            "hw2-final-summary"
        ).hidden = false;

    });

})();
