import type { Ayah } from "../entities/Ayah";
import type { AyahMarkerStyle } from "./AyahMarkerFormatter";
import { formatAyahMarker } from "./AyahMarkerFormatter";
import type { CompiledVerseReference } from "../value-objects/VerseReference";
import { ArabicNormalizer } from "./ArabicNormalizer";

export type OrphanAyahStatus = "orphan" | "linked" | "unresolved" | "ambiguous";

export interface OrphanAyahCandidate {
	id: string;
	content: string;
	marker: string;
	markerStart: number;
	markerEnd: number;
	ayah: Ayah | null;
	alternatives: readonly Ayah[];
	status: OrphanAyahStatus;
	reason?: string;
}

export interface OrphanAyahScanResult {
	sourceText: string;
	candidates: readonly OrphanAyahCandidate[];
}

export interface OrphanAyahScannerOptions {
	wrapperStart: string;
	wrapperEnd: string;
	ayahMarkerStyle: AyahMarkerStyle;
	reference: CompiledVerseReference;
	normalizer: ArabicNormalizer;
	ayahs: readonly Ayah[];
}

interface OffsetRange {
	start: number;
	end: number;
}

/** Scans the content of ornate Quran wrappers first, then uses numbers,
 * adjacent references, or partial normalized text only as resolution hints.
 * A number is not required for a wrapper to be convertible. */
export class OrphanAyahScanner {
	scan(sourceText: string, options: OrphanAyahScannerOptions): OrphanAyahScanResult {
		const candidates: OrphanAyahCandidate[] = [];
		const wrapperRegex = new RegExp(
			`${escapeRegExp(options.wrapperStart)}([\\s\\S]*?)${escapeRegExp(options.wrapperEnd)}`,
			"g"
		);
		let wrapperMatch: RegExpExecArray | null;

		while ((wrapperMatch = wrapperRegex.exec(sourceText)) !== null) {
			const body = wrapperMatch[1];
			const bodyStart = wrapperMatch.index + options.wrapperStart.length;
			const linkedRanges = findRanges(body, /\[\[[^\]\n]*\]\]/g, bodyStart);
			const markerMatches = Array.from(body.matchAll(/(?:۝\s*)?(?:\([0-9٠-٩۰-۹]+\)|[0-9٠-٩۰-۹]+)/g));
			const adjacentReference = findAdjacentReference(
				sourceText,
				wrapperMatch.index + wrapperMatch[0].length,
				options
			);

			if (markerMatches.length > 0) {
				for (const markerMatch of markerMatches) {
					const marker = markerMatch[0];
					const markerStart = bodyStart + (markerMatch.index ?? 0);
					const markerEnd = markerStart + marker.length;
					const linked = linkedRanges.some((range) => markerStart >= range.start && markerEnd <= range.end);
					const markerNumber = parseMarkerNumber(marker);
					const resolution = linked
						? { kind: "linked" as const, ayah: null, alternatives: [], reason: undefined }
						: resolveAyah(body, markerNumber, adjacentReference, options);

					candidates.push({
						id: `${markerStart}:${markerEnd}`,
						content: body.trim(),
						marker,
						markerStart,
						markerEnd,
						ayah: resolution.ayah,
						alternatives: resolution.alternatives,
						status: resolution.kind,
						reason: resolution.reason,
					});
				}
				continue;
			}

			// No visible number: use the whole wrapper as the candidate and insert
			// the linked marker immediately before its trailing whitespace.
			const resolution = resolveAyah(body, null, adjacentReference, options);
			const insertion = body.search(/\s*$/);
			const markerStart = bodyStart + (insertion === -1 ? body.length : insertion);
			const marker = resolution.ayah ? formatAyahMarker(resolution.ayah.ayahId, options.ayahMarkerStyle) : "";
			candidates.push({
				id: `${markerStart}:${markerStart}`,
				content: body.trim(),
				marker,
				markerStart,
				markerEnd: markerStart,
				ayah: resolution.ayah,
				alternatives: resolution.alternatives,
				status: resolution.kind,
				reason: resolution.reason,
			});
		}

		return { sourceText, candidates };
	}
}

function resolveAyah(
	body: string,
	markerNumber: number | null,
	reference: { surahId: number; startAyah: number; endAyah: number } | null,
	options: OrphanAyahScannerOptions
):
		| { kind: "orphan"; ayah: Ayah; alternatives: readonly Ayah[]; reason?: undefined }
		| { kind: "unresolved" | "ambiguous"; ayah: null; alternatives: readonly Ayah[]; reason: string } {
	const text = normalizeCandidateText(body, options.normalizer);
	const scoped = reference
		? options.ayahs.filter(
				(item) =>
					item.surahId === reference.surahId &&
					item.ayahId >= reference.startAyah &&
					item.ayahId <= reference.endAyah
			  )
		: options.ayahs;

	// A reference identifies the surah; its ayah number remains authoritative
	// when one exists, even when the copied text is only a fragment.
	if (reference && markerNumber !== null && markerNumber >= reference.startAyah && markerNumber <= reference.endAyah) {
		const ayah = scoped.find((item) => item.ayahId === markerNumber);
		return ayah
			? { kind: "orphan", ayah, alternatives: [ayah] }
			: { kind: "unresolved", ayah: null, alternatives: [], reason: "لم تُعثر الآية في المصحف" };
	}

	// A single reference identifies the ayah even if the wrapper contains only
	// a partial quote and no visible number.
	if (reference && reference.startAyah === reference.endAyah) {
		const ayah = scoped[0] ?? null;
		return ayah
			? { kind: "orphan", ayah, alternatives: [ayah] }
			: { kind: "unresolved", ayah: null, alternatives: [], reason: "لم تُعثر الآية في المصحف" };
	}

	if (!text) return { kind: "unresolved", ayah: null, alternatives: [], reason: "لم يُعثر على نص آية قابل للمطابقة" };
	let matches = scoped.filter((ayah) => containsQuranPhrase(ayah.text, text, options.normalizer));
	if (markerNumber !== null) matches = matches.filter((ayah) => ayah.ayahId === markerNumber);
	if (matches.length > 0) return { kind: "orphan", ayah: matches[0], alternatives: matches };
	return { kind: "unresolved", ayah: null, alternatives: [], reason: "لم تُعثر آية مطابقة" };
}

function containsQuranPhrase(ayahText: string, candidateText: string, normalizer: ArabicNormalizer): boolean {
	const ayahWords = normalizer.normalizeForSearch(ayahText).split(/\s+/).filter(Boolean);
	const candidateWords = candidateText.split(/\s+/).filter(Boolean);
	if (candidateWords.length === 0) return false;
	if (candidateWords.length > ayahWords.length) {
		return containsWordSequence(candidateWords, ayahWords) && ayahWords.length >= 3;
	}
	return containsWordSequence(ayahWords, candidateWords);
}

function containsWordSequence(words: readonly string[], phrase: readonly string[]): boolean {
	if (phrase.length === 0 || phrase.length > words.length) return false;
	for (let index = 0; index <= words.length - phrase.length; index++) {
		if (phrase.every((word, offset) => words[index + offset] === word)) return true;
	}
	return false;
}

function findAdjacentReference(
	text: string,
	start: number,
	options: OrphanAyahScannerOptions
): { surahId: number; startAyah: number; endAyah: number } | null {
	const line = text.slice(start).split(/\r?\n/, 1)[0];
	const match = options.reference.find(line);
	if (!match || match.index > 120) return null;
	const normalizedName = options.normalizer.normalizeForSearch(match.surahName);
	const surah = options.ayahs.find((ayah) => options.normalizer.normalizeForSearch(ayah.surahName) === normalizedName);
	return surah ? { surahId: surah.surahId, startAyah: match.startAyah, endAyah: match.endAyah } : null;
}

function normalizeCandidateText(body: string, normalizer: ArabicNormalizer): string {
	return normalizer.normalizeForSearch(
		body
			.replace(/\[\[[^\]\n]*\]\]/g, "")
			.replace(/(?:۝\s*)?(?:\([0-9٠-٩۰-۹]+\)|[0-9٠-٩۰-۹]+)/g, " ")
	);
}

function parseMarkerNumber(marker: string): number | null {
	const digits = marker.match(/[0-9٠-٩۰-۹]+/g)?.join("") ?? "";
	if (!digits) return null;
	return Number(ArabicNormalizer.normalizeNumbers(digits));
}

function findRanges(text: string, regex: RegExp, offset: number): OffsetRange[] {
	const ranges: OffsetRange[] = [];
	let match: RegExpExecArray | null;
	while ((match = regex.exec(text)) !== null) {
		ranges.push({ start: offset + match.index, end: offset + match.index + match[0].length });
	}
	return ranges;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
