import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inputPath = process.argv[2]
	? path.resolve(projectRoot, process.argv[2])
	: path.join(projectRoot, "data", "vendor", "quranic-corpus-morphology-0.4", "quranic-corpus-morphology-0.4.txt");
const outputPath = process.argv[3]
	? path.resolve(projectRoot, process.argv[3])
	: path.join(projectRoot, "data", "quran-root-index.json");

const BUCKWALTER_TO_ARABIC = new Map([
	["'", "ء"],
	["|", "آ"],
	[">", "أ"],
	["&", "ؤ"],
	["<", "إ"],
	["}", "ئ"],
	["{", "ا"],
	["A", "ا"],
	["b", "ب"],
	["t", "ت"],
	["v", "ث"],
	["j", "ج"],
	["H", "ح"],
	["x", "خ"],
	["d", "د"],
	["*", "ذ"],
	["r", "ر"],
	["z", "ز"],
	["s", "س"],
	["$", "ش"],
	["S", "ص"],
	["D", "ض"],
	["T", "ط"],
	["Z", "ظ"],
	["E", "ع"],
	["g", "غ"],
	["f", "ف"],
	["q", "ق"],
	["k", "ك"],
	["l", "ل"],
	["m", "م"],
	["n", "ن"],
	["h", "ه"],
	["w", "و"],
	["Y", "ى"],
	["y", "ي"],
	["p", "ة"],
]);

function buckwalterToArabic(value) {
	const diacritics = new Set(["a", "i", "u", "o", "~", "F", "N", "K", "`", "^"]);
	return Array.from(value, (char) => {
		if (diacritics.has(char)) return "";
		return BUCKWALTER_TO_ARABIC.get(char) ?? "";
	}).join("");
}

function normalizeArabic(text) {
	return text
		.trim()
		.replace(/[\u0670\u0610-\u061A\u064B-\u065F\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g, "")
		.replace(/ذى/g, "ذي")
		.replace(/[\u0623\u0625\u0622\u0671\u0621]/g, "ا")
		.replace(/ى/g, "ي")
		.replace(/[يئ]/g, "ي")
		.replace(/ؤ/g, "و")
		.replace(/ة/g, "ه")
		.replace(/ـ/g, "")
		.replace(/ياا/g, "يا")
		.replace(/[^\u0621-\u064A\s0-9\u0660-\u0669]/g, "")
		.replace(/ا+/g, "ا")
		.replace(/\s+/g, " ")
		.trim();
}

function removeArabicClitics(word) {
	const variants = new Set([word]);
	if (word.startsWith("ال") && word.length > 2) variants.add(word.slice(2));
	for (const prefix of ["و", "ف", "ب", "ك", "ل"]) {
		if (word.startsWith(prefix) && word.length > 2) variants.add(word.slice(1));
	}
	if (word.startsWith("وال") && word.length > 3) variants.add(word.slice(3));
	if (word.startsWith("فال") && word.length > 3) variants.add(word.slice(3));
	return variants;
}

function parseFeatures(features) {
	const result = {};
	for (const feature of features.split("|")) {
		const separator = feature.indexOf(":");
		if (separator === -1) continue;
		result[feature.slice(0, separator)] = feature.slice(separator + 1);
	}
	return result;
}

if (!fs.existsSync(inputPath)) {
	throw new Error(`Quranic Arabic Corpus morphology file not found: ${inputPath}`);
}

const ayahWords = new Map();
const termRoots = new Map();
let dataLines = 0;
let rootedSegments = 0;

function addTermRoot(term, root) {
	const normalized = normalizeArabic(term);
	if (!normalized || !root) return;
	const roots = termRoots.get(normalized) ?? new Set();
	roots.add(root);
	termRoots.set(normalized, roots);
}

for (const line of fs.readFileSync(inputPath, "utf8").split(/\r?\n/)) {
	if (!line || line.startsWith("#") || line.startsWith("LOCATION\t")) continue;
	const columns = line.split("\t");
	if (columns.length < 4) continue;

	const location = columns[0].match(/^\((\d+):(\d+):(\d+):(\d+)\)$/);
	if (!location) continue;
	dataLines += 1;

	const surahId = Number(location[1]);
	const ayahId = Number(location[2]);
	const wordIndex = Number(location[3]);
	const features = parseFeatures(columns[3]);
	const root = features.ROOT ? buckwalterToArabic(features.ROOT) : null;
	const lemma = features.LEM ? buckwalterToArabic(features.LEM) : null;
	const key = `${surahId}:${ayahId}`;
	const words = ayahWords.get(key) ?? [];
	while (words.length < wordIndex) words.push({ formParts: [], roots: [], lemmas: [] });
	const word = words[wordIndex - 1];
	word.formParts.push(columns[1]);
	if (root && !word.roots.includes(root)) {
		word.roots.push(root);
		rootedSegments += 1;
	}
	if (lemma && !word.lemmas.includes(lemma)) word.lemmas.push(lemma);
	ayahWords.set(key, words);
}

for (const words of ayahWords.values()) {
	for (const word of words) {
		word.form = normalizeArabic(buckwalterToArabic(word.formParts.join("")));
		for (const root of word.roots) {
			addTermRoot(root, root);
			for (const lemma of word.lemmas) addTermRoot(lemma, root);
			for (const variant of removeArabicClitics(word.form)) addTermRoot(variant, root);
		}
		delete word.formParts;
	}
}

const serializedAyahs = Object.fromEntries(
	Array.from(ayahWords.entries(), ([key, words]) => [
		key,
		words.map((word) => ({
			form: word.form,
			roots: word.roots.sort(),
			lemmas: word.lemmas.sort(),
		})),
	])
);

const serializedTerms = Object.fromEntries(
	Array.from(termRoots.entries(), ([term, roots]) => [term, Array.from(roots).sort()])
);

const output = {
	version: "Quranic Arabic Corpus 0.4",
	source: "https://corpus.quran.com/download/",
	copyright: "Copyright (C) 2011 Kais Dukes",
	license: "GNU General Public License; preserve the upstream copyright and terms of use.",
	wordIndexBase: 1,
	ayahWords: serializedAyahs,
	termRoots: serializedTerms,
};

fs.writeFileSync(outputPath, `${JSON.stringify(output)}\n`, "utf8");
console.log(`Wrote ${outputPath}`);
console.log(`Parsed ${dataLines} morphology segments; indexed ${rootedSegments} rooted segments across ${ayahWords.size} ayahs.`);
