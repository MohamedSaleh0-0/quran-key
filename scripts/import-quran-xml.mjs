import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const canonicalSourcePath = path.join(projectRoot, "quran-uthmani.xml");
const displaySourcePath = path.join(projectRoot, "quran-uthmani-sequential.xml");
const outputPath = path.join(projectRoot, "data", "ayahs.json");
const canonicalOutputPath = path.join(projectRoot, "data", "ayahs-canonical.json");

function decodeXmlEntities(value) {
	return value.replace(/&(?:quot|apos|amp|lt|gt|#x[0-9a-f]+|#[0-9]+);/gi, (entity) => {
		if (entity === "&quot;") return '"';
		if (entity === "&apos;") return "'";
		if (entity === "&amp;") return "&";
		if (entity === "&lt;") return "<";
		if (entity === "&gt;") return ">";
		const code = entity.startsWith("&#x") || entity.startsWith("&#X")
			? Number.parseInt(entity.slice(3, -1), 16)
			: Number.parseInt(entity.slice(2, -1), 10);
		return Number.isInteger(code) ? String.fromCodePoint(code) : entity;
	});
}

function parseAttributes(raw) {
	const attributes = {};
	const pattern = /([A-Za-z_:][A-Za-z0-9_.:-]*)="([^"]*)"/g;
	let match;
	while ((match = pattern.exec(raw)) !== null) {
		attributes[match[1]] = decodeXmlEntities(match[2]);
	}
	return attributes;
}

function requiredNumber(attributes, name, context) {
	const value = Number(attributes[name]);
	if (!Number.isInteger(value)) throw new Error(`Missing or invalid ${name} in ${context}`);
	return value;
}

function parseTanzilXml(xml, fileName) {
	if (!xml.includes("Tanzil Quran Text (Uthmani, Version 1.1)")) {
		throw new Error(`${fileName} does not identify itself as Tanzil Uthmani v1.1`);
	}

	const ayahs = [];
	const suraPattern = /<sura\b([^>]*)>([\s\S]*?)<\/sura>/g;
	let suraMatch;
	let expectedSurahId = 1;
	while ((suraMatch = suraPattern.exec(xml)) !== null) {
		const suraAttributes = parseAttributes(suraMatch[1]);
		const surahId = requiredNumber(suraAttributes, "index", "sura");
		if (surahId !== expectedSurahId) throw new Error(`Expected surah ${expectedSurahId}, found ${surahId}`);
		const surahName = suraAttributes.name;
		if (!surahName) throw new Error(`Missing name for surah ${surahId}`);

		const ayaPattern = /<aya\b([^>]*)\/>/g;
		let ayaMatch;
		let expectedAyahId = 1;
		while ((ayaMatch = ayaPattern.exec(suraMatch[2])) !== null) {
			const ayaAttributes = parseAttributes(ayaMatch[1]);
			const ayahId = requiredNumber(ayaAttributes, "index", `surah ${surahId}`);
			if (ayahId !== expectedAyahId) {
				throw new Error(`Expected ayah ${surahId}:${expectedAyahId}, found ${surahId}:${ayahId}`);
			}
			if (!ayaAttributes.text) throw new Error(`Missing text for ayah ${surahId}:${ayahId}`);

			const ayah = {
				surah_id: surahId,
				ayah_id: ayahId,
				text: ayaAttributes.text,
				surah_name: surahName,
			};
			if (ayaAttributes.bismillah) ayah.bismillah = ayaAttributes.bismillah;
			ayahs.push(ayah);
			expectedAyahId += 1;
		}
		expectedSurahId += 1;
	}

	if (expectedSurahId !== 115) throw new Error(`${fileName}: expected 114 surahs, found ${expectedSurahId - 1}`);
	if (ayahs.length !== 6236) throw new Error(`${fileName}: expected 6236 ayahs, found ${ayahs.length}`);
	return ayahs;
}

const quranicMarks = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;
function letterSkeleton(value) {
	return value
		.normalize("NFC")
		.replace(quranicMarks, "")
		.replace(/\s+/g, " ")
		.trim();
}

function validateDisplayVariant(canonicalAyahs, displayAyahs) {
	if (canonicalAyahs.length !== displayAyahs.length) {
		throw new Error(`Display variant has ${displayAyahs.length} ayahs; canonical source has ${canonicalAyahs.length}`);
	}

	for (let index = 0; index < canonicalAyahs.length; index += 1) {
		const canonical = canonicalAyahs[index];
		const display = displayAyahs[index];
		const reference = `${canonical.surah_id}:${canonical.ayah_id}`;
		if (canonical.surah_id !== display.surah_id || canonical.ayah_id !== display.ayah_id) {
			throw new Error(`Display variant changed ayah ordering at ${reference}`);
		}
		if (canonical.surah_name !== display.surah_name) {
			throw new Error(`Display variant changed the surah name at ${reference}`);
		}
		if (letterSkeleton(canonical.text) !== letterSkeleton(display.text)) {
			throw new Error(`Display variant changed Quran letters at ${reference}`);
		}
		if (letterSkeleton(canonical.bismillah ?? "") !== letterSkeleton(display.bismillah ?? "")) {
			throw new Error(`Display variant changed Bismillah text at ${reference}`);
		}
	}
}

function sha256(value) {
	return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

const canonicalXml = fs.readFileSync(canonicalSourcePath, "utf8");
const displayXml = fs.readFileSync(displaySourcePath, "utf8");
const canonicalAyahs = parseTanzilXml(canonicalXml, "quran-uthmani.xml");
const displayAyahs = parseTanzilXml(displayXml, "quran-uthmani-sequential.xml");
validateDisplayVariant(canonicalAyahs, displayAyahs);

function buildOutput(ayahs, displayProfile, displayFile, fontFamily, derivedNotice) {
	return {
		source: {
			provider: "Tanzil Project",
			edition: "Uthmani",
			version: "1.1",
			license: "Creative Commons Attribution 3.0",
			url: "https://tanzil.net/",
			file: "quran-uthmani.xml",
			canonicalFile: "quran-uthmani.xml",
			canonicalSha256: sha256(canonicalXml),
			displayFile,
			displaySha256: sha256(displayFile === "quran-uthmani.xml" ? canonicalXml : displayXml),
			displayProfile,
			fontFamily,
			derivedNotice,
		},
		ayahs,
	};
}

const canonicalOutput = buildOutput(
	canonicalAyahs,
	"canonical-uthmani",
	"quran-uthmani.xml",
	"font-independent",
	"Canonical Tanzil Uthmani text retained unchanged for source/font comparison in the display laboratory."
);
const sequentialOutput = buildOutput(
	displayAyahs,
	"sequential-tanween",
	"quran-uthmani-sequential.xml",
	"me_quran",
	"Canonical Tanzil Uthmani text is retained unchanged. The generated text field uses Tanzil's extended sequential-tanween display profile and is validated against the canonical letter skeleton."
);

fs.writeFileSync(canonicalOutputPath, `${JSON.stringify(canonicalOutput, null, 2)}\n`, "utf8");
fs.writeFileSync(outputPath, `${JSON.stringify(sequentialOutput, null, 2)}\n`, "utf8");
console.log(`Imported ${canonicalAyahs.length} canonical and ${displayAyahs.length} sequential ayahs into data/`);
