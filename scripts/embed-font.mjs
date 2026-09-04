import fs from "node:fs";
import path from "node:path";
import https from "node:https";

const CSS_URL = "https://fonts.googleapis.com/css2?family=Amiri+Quran&display=swap";
const STYLES_PATH = path.resolve("styles.css");

function download(url, headers = {}) {
	return new Promise((resolve, reject) => {
		https.get(url, { headers }, (res) => {
			if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
				return download(res.headers.location, headers).then(resolve, reject);
			}
			if (res.statusCode !== 200) {
				return reject(new Error(`Failed to fetch ${url} (status: ${res.statusCode})`));
			}
			const chunks = [];
			res.on("data", (chunk) => chunks.push(chunk));
			res.on("end", () => resolve(Buffer.concat(chunks)));
		}).on("error", reject);
	});
}

async function run() {
	let stylesContent = "";
	if (fs.existsSync(STYLES_PATH)) {
		stylesContent = fs.readFileSync(STYLES_PATH, "utf-8");
	}

	const force = process.argv.includes("--force");
	if (!force && stylesContent.includes("data:font/woff2;base64,")) {
		console.log("Font is already embedded in styles.css. Skipping download.");
		return;
	}

	console.log("Downloading Amiri Quran metadata...");
	const cssData = await download(CSS_URL, {
		"User-Agent":
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
	});
	const cssText = cssData.toString("utf-8");
	const match = cssText.match(/url\((https:[^)]+?\.woff2)\)/);
	if (!match) {
		throw new Error("Could not find WOFF2 URL in Google Fonts CSS");
	}

	const woff2Url = match[1];
	console.log("Downloading WOFF2 binary file...");
	const fontBuffer = await download(woff2Url);
	const base64 = fontBuffer.toString("base64");

	console.log(`Font downloaded (${(fontBuffer.length / 1024).toFixed(1)} KB). Embedding into styles.css...`);

	const fontFaceBlock = `/* === Amiri Quran Font (Embedded Base64 - Offline & Obsidian Compliant) === */\n@font-face {\n\tfont-family: 'Amiri Quran';\n\tsrc: url('data:font/woff2;base64,${base64}') format('woff2');\n\tfont-weight: normal;\n\tfont-style: normal;\n\tfont-display: swap;\n}\n\n`;

	stylesContent = stylesContent.replace(/@import\s+url\(['"][^'"]+Amiri\+Quran[^'"]*['"]\);?\s*/g, "");
	stylesContent = stylesContent.replace(/\/\* === Amiri Quran Font[\s\S]*?\}\s*/g, "");

	fs.writeFileSync(STYLES_PATH, fontFaceBlock + stylesContent.trimStart(), "utf-8");
	console.log("styles.css is now self-contained and offline-ready!");
}

run().catch((err) => {
	console.error("Failed to embed font:", err);
	process.exit(1);
});