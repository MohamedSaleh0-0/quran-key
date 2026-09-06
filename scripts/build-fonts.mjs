import fs from "node:fs";
import path from "node:path";

const STYLES_PATH = path.resolve("styles.css");
const FONTS_DIR = path.resolve("assets/fonts-src");

const KFGQPC_CANDIDATES = [
	path.join(FONTS_DIR, "UthmanicHafs.woff"),
	path.join(FONTS_DIR, "UthmanicHafs.woff2"),
	path.join(FONTS_DIR, "UthmanicHafs.ttf"),
	path.join(FONTS_DIR, "KFGQPC.woff"),
	path.join(FONTS_DIR, "KFGQPC.woff2"),
	path.join(FONTS_DIR, "KFGQPC.ttf"),
];

const AMIRI_CANDIDATES = [
	path.join(FONTS_DIR, "AmiriQuran.woff2"),
	path.join(FONTS_DIR, "AmiriQuran.ttf"),
	path.join(FONTS_DIR, "amiri-quran.woff2"),
	path.join(FONTS_DIR, "amiri-quran.ttf"),
];

function resolveFile(candidates) {
	for (const file of candidates) {
		if (fs.existsSync(file)) return file;
	}
	return null;
}

function detectFormat(filePath) {
	if (filePath.endsWith(".woff2")) return "woff2";
	if (filePath.endsWith(".woff")) return "woff";
	if (filePath.endsWith(".otf")) return "opentype";
	return "truetype";
}

function buildFontFace(family, filePath) {
	const buffer = fs.readFileSync(filePath);
	const format = detectFormat(filePath);
	const base64 = buffer.toString("base64");
	const sizeKb = (buffer.length / 1024).toFixed(1);

	console.log(`[build-fonts] Embedding ${family} from ${path.basename(filePath)} (${sizeKb} KB)`);

	return `@font-face {
\tfont-family: '${family}';
\tsrc: url('data:font/${format};base64,${base64}') format('${format}');
\tfont-weight: normal;
\tfont-style: normal;
\tfont-display: swap;
}\n`;
}

async function main() {
	if (!fs.existsSync(FONTS_DIR)) {
		fs.mkdirSync(FONTS_DIR, { recursive: true });
	}

	const kfgqpcFile = resolveFile(KFGQPC_CANDIDATES);
	const amiriFile = resolveFile(AMIRI_CANDIDATES);

	if (!kfgqpcFile && !amiriFile) {
		console.warn("\n[build-fonts] تنبيه: لم يتم العثور على ملفات الخطوط داخل assets/fonts-src/.");
		console.warn("ضع ملف 'UthmanicHafs.woff2' أو 'AmiriQuran.woff2' داخل المجلد ليتم دمجهما.");
		return;
	}

	let fontFaceBlocks = "/* === AUTO-GENERATED EMBEDDED FONTS - DO NOT EDIT MANUALLY === */\n";

	if (kfgqpcFile) {
		fontFaceBlocks += buildFontFace("KFGQPC Uthmanic Script HAFS", kfgqpcFile);
	}
	if (amiriFile) {
		fontFaceBlocks += buildFontFace("Amiri Quran", amiriFile);
	}

	fontFaceBlocks += "/* === END AUTO-GENERATED EMBEDDED FONTS === */\n\n";

	let stylesContent = "";
	if (fs.existsSync(STYLES_PATH)) {
		stylesContent = fs.readFileSync(STYLES_PATH, "utf-8");
	}

	// إزالة أي كتل سابقة تم توليدها
	const markerRegex = /\/\* === AUTO-GENERATED EMBEDDED FONTS[\s\S]*?\/\* === END AUTO-GENERATED EMBEDDED FONTS === \*\/\s*/g;
	stylesContent = stylesContent.replace(markerRegex, "");
	stylesContent = stylesContent.replace(/\/\* === KFGQPC Uthmanic Font Embedded[\s\S]*?\}\s*/g, "");
	stylesContent = stylesContent.replace(/\/\* === Amiri Quran Font[\s\S]*?\}\s*/g, "");

	fs.writeFileSync(STYLES_PATH, fontFaceBlocks + stylesContent.trimStart(), "utf-8");
	console.log("[build-fonts] styles.css was successfully updated with offline Base64 fonts!");
}

main().catch((err) => {
	console.error("[build-fonts] Error:", err);
	process.exit(1);
});