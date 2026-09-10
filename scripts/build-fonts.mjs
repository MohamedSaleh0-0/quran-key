import fs from "node:fs";
import path from "node:path";

const STYLES_PATH = path.resolve("styles.css");
const FONTS_DIR = path.resolve("assets/fonts-src");

const QPC_HAFS_V18_CANDIDATES = [
	path.join(FONTS_DIR, "UthmanicHafs1Ver18.woff2"),
	path.join(FONTS_DIR, "UthmanicHafs1Ver18.ttf"),
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

function buildGlyphOverrideFontFace(family, filePath, unicodeRange) {
	const buffer = fs.readFileSync(filePath);
	const format = detectFormat(filePath);
	const base64 = buffer.toString("base64");
	const sizeKb = (buffer.length / 1024).toFixed(1);

	console.log(`[build-fonts] Embedding ${family} (${unicodeRange}) from ${path.basename(filePath)} (${sizeKb} KB)`);

	return `@font-face {
\tfont-family: '${family}';
\tsrc: url('data:font/${format};base64,${base64}') format('${format}');
\tfont-weight: normal;
\tfont-style: normal;
\tfont-display: swap;
\tunicode-range: ${unicodeRange};
}\n`;
}

async function main() {
	if (!fs.existsSync(FONTS_DIR)) {
		fs.mkdirSync(FONTS_DIR, { recursive: true });
	}

	const qpcHafsV18File = resolveFile(QPC_HAFS_V18_CANDIDATES);
	if (!qpcHafsV18File) {
		console.warn("\n[build-fonts] تنبيه: لم يتم العثور على ملفات الخطوط داخل assets/fonts-src/.");
		console.warn("ضع ملف 'UthmanicHafs1Ver18.woff2' داخل المجلد ليتم دمجه.");
		return;
	}

	let fontFaceBlocks = "/* === AUTO-GENERATED EMBEDDED FONTS - DO NOT EDIT MANUALLY === */\n";

	if (qpcHafsV18File) {
		fontFaceBlocks += buildFontFace("QPC Hafs v18", qpcHafsV18File);
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
	stylesContent = stylesContent.replace(/\/\* === me_quran Font Embedded[\s\S]*?\}\s*/g, "");
	stylesContent = stylesContent.replace(/\/\* === QPC Hafs v18 Font Embedded[\s\S]*?\}\s*/g, "");
	stylesContent = stylesContent.replace(/\/\* === Amiri Quran Font[\s\S]*?\}\s*/g, "");
	stylesContent = stylesContent.replace(/\/\* === QPC Hafs v18 Glyph Overrides[\s\S]*?\/\* === END QPC Hafs v18 Glyph Overrides === \*\/\s*/g, "");

	fs.writeFileSync(STYLES_PATH, fontFaceBlocks + stylesContent.trimStart(), "utf-8");
	console.log("[build-fonts] styles.css was successfully updated with offline Base64 fonts!");
}

main().catch((err) => {
	console.error("[build-fonts] Error:", err);
	process.exit(1);
});
