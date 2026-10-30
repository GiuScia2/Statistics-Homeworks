
/* ==========================================
   HOMEWORK 2 - ETHEREUM WALLET DERIVATION
   STEP 1: BIP-39 MNEMONIC TO SEED
========================================== */

// Official BIP-39 test vector
const EXPECTED_SEED =
    "c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e" +
    "53495531f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2" +
    "f001698e7463b04";

// 1. Derive a 512-bit seed using PBKDF2-HMAC-SHA512
async function mnemonicToSeed(mnemonic, passphrase) {
    const encoder = new TextEncoder();

    const password = encoder.encode(mnemonic.normalize("NFKD"));
    const salt = encoder.encode(
        ("mnemonic" + passphrase).normalize("NFKD")
    );

    const key = await crypto.subtle.importKey(
        "raw",
        password,
        "PBKDF2",
        false,
        ["deriveBits"]
    );

    const seed = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt,
            iterations: 2048,
            hash: "SHA-512"
        },
        key,
        512
    );

    return Array.from(
        new Uint8Array(seed),
        byte => byte.toString(16).padStart(2, "0")
    ).join("");
}

// 2. Interactive demonstration
const deriveButton = document.getElementById("derive-seed-button");
const seedOutput = document.getElementById("seed-output");
const seedStatus = document.getElementById("seed-status");

deriveButton.addEventListener("click", async () => {
    const mnemonic = document.getElementById("test-mnemonic")
        .textContent.trim().replace(/\s+/g, " ");

    const passphrase = document.getElementById("test-passphrase")
        .textContent.trim();

    deriveButton.disabled = true;
    seedStatus.textContent = "Deriving seed...";

    try {
        if (!window.crypto?.subtle) {
            throw new Error("Web Crypto API is unavailable.");
        }

        const seed = await mnemonicToSeed(mnemonic, passphrase);

        seedOutput.textContent = "0x" + seed;

        seedStatus.textContent = seed === EXPECTED_SEED
            ? "✓ Seed verified against the official BIP-39 test vector."
            : "✗ Verification failed: unexpected seed.";

    } catch (error) {
        seedOutput.textContent = "Seed derivation failed.";
        seedStatus.textContent = error.message;

    } finally {
        deriveButton.disabled = false;
    }
});


/* ==========================================
   STEP 2: BIP-32 MASTER KEY DERIVATION
========================================== */

// Expected values for our public BIP-39 test seed
const EXPECTED_MASTER_KEY =
    "cbedc75b0d6412c85c79bc13875112ef" +
    "912fd1e756631b5a00330866f22ff184";

const EXPECTED_CHAIN_CODE =
    "a3fa8c983223306de0f0f65e74ebb1e" +
    "98aba751633bf91d5fb56529aa5c132c1";

// 1. Convert a hexadecimal string to bytes
const hexToBytes = hex => Uint8Array.from(
    hex.match(/.{2}/g),
    byte => parseInt(byte, 16)
);

// 2. Convert bytes to a hexadecimal string
const bytesToHex = bytes => Array.from(
    bytes,
    byte => byte.toString(16).padStart(2, "0")
).join("");

// 3. Derive the master private key and chain code
async function seedToMaster(seedHex) {
    const hmacKey = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode("Bitcoin seed"),
        { name: "HMAC", hash: "SHA-512" },
        false,
        ["sign"]
    );

    const result = new Uint8Array(
        await crypto.subtle.sign(
            "HMAC",
            hmacKey,
            hexToBytes(seedHex)
        )
    );

    const privateKey = bytesToHex(result.slice(0, 32));
    const chainCode = bytesToHex(result.slice(32));

    // Check the validity of the master private key
    const n = BigInt(
        "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFE" +
        "BAAEDCE6AF48A03BBFD25E8CD0364141"
    );

    const k = BigInt("0x" + privateKey);

    if (k === 0n || k >= n) {
        throw new Error("Invalid BIP-32 master private key.");
    }

    return { privateKey, chainCode };
}

// 4. Interactive demonstration
const masterButton = document.getElementById("derive-master-button");
const masterKeyOutput = document.getElementById("master-key-output");
const chainCodeOutput = document.getElementById("chain-code-output");
const masterStatus = document.getElementById("master-status");

masterButton.addEventListener("click", async () => {
    const seedHex = seedOutput.textContent.trim().replace(/^0x/, "");

    if (!/^[0-9a-f]{128}$/.test(seedHex)) {
        masterStatus.textContent =
            "Please derive the BIP-39 seed first.";
        return;
    }

    masterButton.disabled = true;
    masterStatus.textContent = "Deriving master key...";

    try {
        const { privateKey, chainCode } =
            await seedToMaster(seedHex);

        masterKeyOutput.textContent = "0x" + privateKey;
        chainCodeOutput.textContent = "0x" + chainCode;

        const verified =
            privateKey === EXPECTED_MASTER_KEY &&
            chainCode === EXPECTED_CHAIN_CODE;

        masterStatus.textContent = verified
            ? "✓ Master key and chain code verified."
            : "✗ Unexpected values for the test vector.";

    } catch (error) {
        masterKeyOutput.textContent = "Derivation failed.";
        chainCodeOutput.textContent = "Derivation failed.";
        masterStatus.textContent = error.message;

    } finally {
        masterButton.disabled = false;
    }
});


/* ==========================================
   STEP 3: BIP-44 ETHEREUM KEY DERIVATION
========================================== */

const DERIVATION_PATH = "m/44'/60'/0'/0/0";

const EXPECTED_ETHEREUM_KEY =
    "62f1d86b246c81bdd8f6c166d56896a4" +
    "a5e1eddbcaebe06480e5c0bc74c28224";

const ethereumButton =
    document.getElementById("derive-ethereum-button");

const derivedPrivateOutput =
    document.getElementById("derived-private-output");

const derivedChainOutput =
    document.getElementById("derived-chain-output");

const ethereumStatus =
    document.getElementById("ethereum-derivation-status");

// Derive the first Ethereum account
ethereumButton.addEventListener("click", () => {
    const seed = seedOutput.textContent.trim();
    const masterKey = masterKeyOutput.textContent.trim();
    const masterChain = chainCodeOutput.textContent.trim();

    if (!/^0x[0-9a-f]{128}$/i.test(seed) ||
        !/^0x[0-9a-f]{64}$/i.test(masterKey) ||
        !/^0x[0-9a-f]{64}$/i.test(masterChain)) {
        ethereumStatus.textContent =
            "Please derive the seed and master key first.";
        return;
    }

    ethereumButton.disabled = true;
    ethereumStatus.textContent = "Deriving Ethereum key...";

    try {
        if (typeof ethers === "undefined") {
            throw new Error("The ethers.js library is unavailable.");
        }

        // Reconstruct the BIP-32 master node from the seed
        const master = ethers.HDNodeWallet.fromSeed(seed);

        // Verify consistency with the previous step
        if (master.privateKey.toLowerCase() !== masterKey.toLowerCase() ||
            master.chainCode.toLowerCase() !== masterChain.toLowerCase()) {
            throw new Error("Master key verification failed.");
        }

        // Derive the first Ethereum key using BIP-44
        const wallet = master.derivePath(DERIVATION_PATH);

        derivedPrivateOutput.textContent = wallet.privateKey;
        derivedChainOutput.textContent = wallet.chainCode;

        ethereumStatus.textContent =
            wallet.privateKey.slice(2).toLowerCase() === EXPECTED_ETHEREUM_KEY
                ? "✓ Ethereum private key verified."
                : "✗ Unexpected key for the test vector.";

    } catch (error) {
        derivedPrivateOutput.textContent = "Derivation failed.";
        derivedChainOutput.textContent = "Derivation failed.";
        ethereumStatus.textContent = error.message;

    } finally {
        ethereumButton.disabled = false;
    }
});


/* ==========================================
   STEP 4: SECP256K1 PUBLIC KEY GENERATION
========================================== */

const EXPECTED_PUBLIC_KEY = "0x04" +
    "986dee3b8afe24cb8ccb2ac23dac3f8c43d22850d14b809b26d6b8aa5a1f4778" +
    "4152cd2c7d9edd0ab20392a837464b5a750b2a7f3f06e6a5756b5211b6a6ed05";

const publicButton = document.getElementById("derive-public-button");
const publicKeyOutput = document.getElementById("public-key-output");
const publicXOutput = document.getElementById("public-x-output");
const publicYOutput = document.getElementById("public-y-output");
const publicStatus = document.getElementById("public-key-status");

publicButton.addEventListener("click", () => {
    const privateKey = derivedPrivateOutput.textContent.trim();

    if (!/^0x[0-9a-f]{64}$/i.test(privateKey)) {
        publicStatus.textContent =
            "Please derive the Ethereum private key first.";
        return;
    }

    try {
        if (typeof ethers === "undefined") {
            throw new Error("The ethers.js library is unavailable.");
        }

        // Compute Q = kG using secp256k1
        const publicKey = ethers.SigningKey.computePublicKey(
            privateKey, false
        );

        // Extract the two coordinates (without the 04 prefix)
        const x = "0x" + publicKey.slice(4, 68);
        const y = "0x" + publicKey.slice(68);

        publicKeyOutput.textContent = publicKey;
        publicXOutput.textContent = x;
        publicYOutput.textContent = y;

        publicStatus.textContent =
            publicKey.toLowerCase() === EXPECTED_PUBLIC_KEY
                ? "✓ Public key verified."
                : "✗ Unexpected public key.";

    } catch (error) {
        publicStatus.textContent = error.message;
    }
});


/* ==========================================
   STEP 5: ETHEREUM ADDRESS GENERATION
========================================== */

const EXPECTED_KECCAK =
    "0x0bd327d22d48a0c851efe43d9c32f71d4db8fb9e1a58b0a80df79935e7256fa6";

const EXPECTED_ADDRESS =
    "0x9c32f71d4db8fb9e1a58b0a80df79935e7256fa6";

const addressButton = document.getElementById("derive-address-button");
const addressInputOutput = document.getElementById("address-input-output");
const keccakOutput = document.getElementById("keccak-output");
const ethereumAddressOutput = document.getElementById("ethereum-address-output");
const addressStatus = document.getElementById("address-status");

addressButton.addEventListener("click", () => {
    const publicKey = publicKeyOutput.textContent.trim();

    if (!/^0x04[0-9a-f]{128}$/i.test(publicKey)) {
        addressStatus.textContent =
            "Please generate the public key first.";
        return;
    }

    try {
        if (typeof ethers === "undefined") {
            throw new Error("The ethers.js library is unavailable.");
        }

        // Remove the 04 prefix (keep the 64-byte coordinates)
        const publicKeyBytes = "0x" + publicKey.slice(4);

        // Hash the public key bytes using Keccak-256
        const hash = ethers.keccak256(publicKeyBytes);

        // Extract the last 20 bytes (40 hexadecimal characters)
        const address = "0x" + hash.slice(-40);

        addressInputOutput.textContent = publicKeyBytes;
        keccakOutput.textContent = hash;
        ethereumAddressOutput.textContent = address;

        // Compare against independently calculated results
        const verified =
            hash === EXPECTED_KECCAK &&
            address === EXPECTED_ADDRESS &&
            ethers.computeAddress(publicKey).toLowerCase() === address;

        addressStatus.textContent = verified
            ? "✓ Ethereum address verified."
            : "✗ Unexpected Ethereum address.";

    } catch (error) {
        addressStatus.textContent = error.message;
    }
});


/* ==========================================
   STEP 6: EIP-55 ADDRESS CHECKSUM
========================================== */

const EXPECTED_EIP55_HASH =
    "0x13229dada889f3731fa9b862009428fd50fbdee1b53f2000c7181647b0bc7f53";

const EXPECTED_CHECKSUM_ADDRESS =
    "0x9c32F71D4DB8Fb9e1A58B0a80dF79935e7256FA6";

const checksumButton =
    document.getElementById("derive-checksum-button");

const checksumInputOutput =
    document.getElementById("checksum-input-output");

const checksumHashOutput =
    document.getElementById("checksum-hash-output");

const checksummedAddressOutput =
    document.getElementById("checksummed-address-output");

const checksumStatus =
    document.getElementById("checksum-status");

checksumButton.addEventListener("click", () => {
    const address = ethereumAddressOutput.textContent.trim();

    if (!/^0x[0-9a-f]{40}$/i.test(address)) {
        checksumStatus.textContent =
            "Please generate the Ethereum address first.";
        return;
    }

    try {
        if (typeof ethers === "undefined") {
            throw new Error("The ethers.js library is unavailable.");
        }

        // Lowercase address without the 0x prefix
        const hexAddress = address.slice(2).toLowerCase();

        // Hash the ASCII text, not the address bytes
        const hash = ethers.keccak256(
            ethers.toUtf8Bytes(hexAddress)
        );

        // Apply EIP-55 capitalization rules
        const checksummed = "0x" + [...hexAddress]
            .map((char, i) =>
                parseInt(hash[i + 2], 16) >= 8
                    ? char.toUpperCase()
                    : char
            ).join("");

        checksumInputOutput.textContent = address;
        checksumHashOutput.textContent = hash;
        checksummedAddressOutput.textContent = checksummed;

        // Verify using ethers.js and our reference values
        const verified =
            hash === EXPECTED_EIP55_HASH &&
            checksummed === EXPECTED_CHECKSUM_ADDRESS &&
            checksummed === ethers.getAddress(address);

        checksumStatus.textContent = verified
            ? "✓ EIP-55 checksum verified."
            : "✗ Unexpected checksum result.";

    } catch (error) {
        checksumStatus.textContent = error.message;
    }
});



/* ==========================================
   STEP 7: KECCAK-256 STATISTICAL EXPLORATION
========================================== */

const STAT_TRIALS = 64;

const statisticsButton =
    document.getElementById("run-statistics-button");

const statisticsStatus =
    document.getElementById("statistics-status");

const hamming256Output =
    document.getElementById("stat-hamming-256");

const hamming160Output =
    document.getElementById("stat-hamming-160");

const bitBalanceOutput =
    document.getElementById("stat-bit-balance");

const entropyOutput =
    document.getElementById("stat-entropy");

const histogramOutput =
    document.getElementById("statistics-histogram");

// Count the number of 1 bits in a byte
function popcount(byte) {
    let count = 0;

    while (byte !== 0) {
        byte &= byte - 1;
        count++;
    }

    return count;
}

// Count 1 bits in a byte array
function countOneBits(bytes) {
    return bytes.reduce(
        (total, byte) => total + popcount(byte),
        0
    );
}

// Count differing bits between two byte arrays
function hammingDistanceBytes(first, second) {
    if (first.length !== second.length) {
        throw new Error("Inputs must have equal length.");
    }

    let distance = 0;

    for (let i = 0; i < first.length; i++) {
        distance += popcount(first[i] ^ second[i]);
    }

    return distance;
}

// Compute the arithmetic mean
function average(values) {
    return values.reduce((sum, value) => sum + value, 0)
        / values.length;
}

// Compute binary Shannon entropy from the fraction of 1 bits
function binaryEntropy(p) {
    if (p === 0 || p === 1) {
        return 0;
    }

    return -p * Math.log2(p)
        - (1 - p) * Math.log2(1 - p);
}

// Display the Hamming distance distribution
function renderHammingHistogram(distances) {
    const bins = [
        { label: "0–95", min: 0, max: 95 },
        { label: "96–111", min: 96, max: 111 },
        { label: "112–127", min: 112, max: 127 },
        { label: "128–143", min: 128, max: 143 },
        { label: "144–159", min: 144, max: 159 },
        { label: "160–175", min: 160, max: 175 },
        { label: "176–191", min: 176, max: 191 },
        { label: "192–256", min: 192, max: 256 }
    ];

    const counts = bins.map(bin =>
        distances.filter(
            distance =>
                distance >= bin.min &&
                distance <= bin.max
        ).length
    );

    const maximum = Math.max(...counts, 1);

    histogramOutput.replaceChildren();

    bins.forEach((bin, index) => {
        const row = document.createElement("div");
        row.className = "statistics-histogram-row";

        const label = document.createElement("span");
        label.textContent = bin.label;

        const track = document.createElement("div");
        track.className = "statistics-bar-track";

        const bar = document.createElement("div");
        bar.className = "statistics-bar-fill";
        bar.style.width =
            (counts[index] / maximum * 100) + "%";

        track.appendChild(bar);

        const count = document.createElement("strong");
        count.textContent = counts[index];

        row.append(label, track, count);
        histogramOutput.appendChild(row);
    });

    if (window.ChartMotion) {
        ChartMotion.observeBars(histogramOutput, ".statistics-bar-fill", 75);
    }
}

// Run 64 one-bit modification experiments
statisticsButton.addEventListener("click", () => {
    const publicKey = publicKeyOutput.textContent.trim();
    const displayedHash = keccakOutput.textContent.trim();

    if (!/^0x04[0-9a-f]{128}$/i.test(publicKey) ||
        !/^0x[0-9a-f]{64}$/i.test(displayedHash)) {

        statisticsStatus.textContent =
            "Please generate the public key and address first.";
        return;
    }

    statisticsButton.disabled = true;
    statisticsStatus.textContent = "Running 64 experiments...";

    try {
        if (typeof ethers === "undefined") {
            throw new Error("The ethers.js library is unavailable.");
        }

        // Original 64-byte public key without the 04 prefix
        const inputBytes = ethers.getBytes(
            "0x" + publicKey.slice(4)
        );

        // Original Keccak-256 digest
        const originalHash = ethers.keccak256(inputBytes);

        if (originalHash.toLowerCase() !== displayedHash.toLowerCase()) {
            throw new Error("Original hash verification failed.");
        }

        const originalDigest = ethers.getBytes(originalHash);

        // Last 20 bytes (160 bits)
        const originalSuffix = originalDigest.slice(12);

        const hashDistances = [];
        const suffixDistances = [];

        let totalOneBits = 0;

        for (let i = 0; i < STAT_TRIALS; i++) {
            // Copy the input
            const modified = inputBytes.slice();

            // Flip exactly one bit in byte i
            modified[i] ^= 1 << (i % 8);

            // Hash the modified input
            const modifiedDigest = ethers.getBytes(
                ethers.keccak256(modified)
            );

            // Measure changed bits in the full digest
            hashDistances.push(
                hammingDistanceBytes(
                    originalDigest,
                    modifiedDigest
                )
            );

            // Measure changed bits in the final 20 bytes
            suffixDistances.push(
                hammingDistanceBytes(
                    originalSuffix,
                    modifiedDigest.slice(12)
                )
            );

            // Collect bit-frequency statistics
            totalOneBits += countOneBits(modifiedDigest);
        }

        const mean256 = average(hashDistances);
        const mean160 = average(suffixDistances);

        const oneFraction =
            totalOneBits / (STAT_TRIALS * 256);

        const entropy = binaryEntropy(oneFraction);

        // Display summary metrics
        hamming256Output.textContent =
            mean256.toFixed(2) + " / 256";

        hamming160Output.textContent =
            mean160.toFixed(2) + " / 160";

        bitBalanceOutput.textContent =
            (oneFraction * 100).toFixed(2) + "%";

        entropyOutput.textContent =
            entropy.toFixed(4);

        // Display histogram
        renderHammingHistogram(hashDistances);

        statisticsStatus.textContent =
            "✓ All 64 statistical trials completed.";

    } catch (error) {
        statisticsStatus.textContent = error.message;

    } finally {
        statisticsButton.disabled = false;
    }
});

