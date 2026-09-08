import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(projectRoot, "quran-uthmani.xml");
const outputPath = path.join(projectRoot, "data", "ayahs.json");

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

function parseTanzilXml(xml) {
	if (!xml.includes("Tanzil Quran Text (Uthmani, Version 1.1)")) {
		throw new Error("quran-uthmani.xml does not identify itself as Tanzil Uthmani v1.1");
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

	if (expectedSurahId !== 115) throw new Error(`Expected 114 surahs, found ${expectedSurahId - 1}`);
	if (ayahs.length !== 6236) throw new Error(`Expected 6236 ayahs, found ${ayahs.length}`);
	return ayahs;
}

const xml = fs.readFileSync(sourcePath, "utf8");
const ayahs = parseTanzilXml(xml);
const sha256 = crypto.createHash("sha256").update(xml, "utf8").digest("hex");
const output = {
	source: {
		provider: "Tanzil Project",
		edition: "Uthmani",
		version: "1.1",
		license: "Creative Commons Attribution 3.0",
		url: "https://tanzil.net/",
		file: "quran-uthmani.xml",
		sha256,
		derivedNotice: "Derived from Tanzil Quran Text (Uthmani, Version 1.1). The original source file is retained unchanged.",
	},
	ayahs,
};

fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`Imported ${ayahs.length} ayahs from quran-uthmani.xml into data/ayahs.json`);
