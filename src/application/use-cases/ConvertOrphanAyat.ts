import type { Ayah } from "../../domain/entities/Ayah";
import type { EditorPort, EditorPosition } from "../../domain/ports/EditorPort";
import type { AyahIdentity, CreatedNoteFileSnapshot, AyahNoteRepository } from "../../domain/ports/AyahNoteRepository";
import type { CompiledVerseReference } from "../../domain/value-objects/VerseReference";
import { ArabicNormalizer } from "../../domain/services/ArabicNormalizer";
import { formatAyahMarker } from "../../domain/services/AyahMarkerFormatter";
import {
	OrphanAyahScanner,
	type OrphanAyahCandidate,
	type OrphanAyahScanResult,
} from "../../domain/services/OrphanAyahScanner";

export interface ConvertOrphanAyatOptions {
	wrapperStart: string;
	wrapperEnd: string;
	ayahMarkerStyle: "plain" | "parenthesized" | "end-symbol";
	reference: CompiledVerseReference;
	normalizer: ArabicNormalizer;
	ayahs: readonly Ayah[];
	fileNameTemplate: string;
	noteTemplate: string;
	formatAyahNoteBody: (ayah: Ayah) => string;
}

export interface OrphanAyatConversionResult {
	originalText: string;
	transformedText: string;
	converted: readonly OrphanAyahCandidate[];
	createdFiles: readonly CreatedNoteFileSnapshot[];
}

export interface OrphanAyatRollbackResult {
	restored: boolean;
	deletedFiles: readonly string[];
}

export type OrphanAyatDecisions = ReadonlyMap<string, Ayah | null>;

export class ConvertOrphanAyat {
	private readonly scanner = new OrphanAyahScanner();

	constructor(private readonly ayahNotes: AyahNoteRepository) {}

	scan(sourceText: string, options: ConvertOrphanAyatOptions): OrphanAyahScanResult {
		return this.scanner.scan(sourceText, {
			wrapperStart: options.wrapperStart,
			wrapperEnd: options.wrapperEnd,
			ayahMarkerStyle: options.ayahMarkerStyle,
			reference: options.reference,
			normalizer: options.normalizer,
			ayahs: options.ayahs,
		});
	}

	async execute(
		editor: EditorPort,
		scan: OrphanAyahScanResult,
		options: ConvertOrphanAyatOptions,
		decisions?: OrphanAyatDecisions
	): Promise<OrphanAyatConversionResult> {
		const currentText = editor.getValue();
		if (currentText !== scan.sourceText) throw new Error("note-changed");

		const converted = scan.candidates.flatMap((candidate) => {
			if (candidate.status !== "orphan") return [];
			const selectedAyah = decisions?.has(candidate.id) ? decisions.get(candidate.id) ?? null : candidate.ayah;
			if (!selectedAyah) return [];
			const marker = selectedAyah.ayahId === candidate.ayah?.ayahId
				? candidate.marker
				: formatAyahMarker(selectedAyah.ayahId, options.ayahMarkerStyle);
			return [{ ...candidate, ayah: selectedAyah, marker }];
		});
		const createdPaths = new Set<string>();
		const links = new Map<string, string>();

		try {
			for (const candidate of converted) {
				const ayah = candidate.ayah;
				const identity: AyahIdentity = {
					surahId: ayah.surahId,
					surahName: ayah.surahName,
					ayahId: ayah.ayahId,
					ayahTextRaw: ayah.text,
					ayahTextBodyFormatted: options.formatAyahNoteBody(ayah),
				};
				const ensured = await this.ayahNotes.ensureUnifiedNote(identity, options.fileNameTemplate, options.noteTemplate);
				for (const path of ensured.createdFiles) createdPaths.add(path);
				links.set(candidate.id, ensured.title);
			}

			const createdFiles = await this.ayahNotes.snapshotFiles(Array.from(createdPaths));
			const transformedText = replaceMarkers(scan.sourceText, converted, links);
			if (transformedText !== scan.sourceText) {
				editor.replaceRange(transformedText, startOfDocument(editor), endOfDocument(editor), "input.quran-key-orphan-conversion");
			}
			return { originalText: scan.sourceText, transformedText, converted, createdFiles };
		} catch (error) {
			if (createdPaths.size > 0) {
				const snapshots = await this.ayahNotes.snapshotFiles(Array.from(createdPaths));
				await this.ayahNotes.deleteCreatedFiles(snapshots);
			}
			throw error;
		}
	}

	async rollback(editor: EditorPort, result: OrphanAyatConversionResult): Promise<OrphanAyatRollbackResult> {
		if (editor.getValue() !== result.transformedText) return { restored: false, deletedFiles: [] };
		editor.replaceRange(result.originalText, startOfDocument(editor), endOfDocument(editor), "input.quran-key-orphan-rollback");
		const deletedFiles = await this.ayahNotes.deleteCreatedFiles(result.createdFiles);
		return { restored: true, deletedFiles };
	}
}

function replaceMarkers(
	sourceText: string,
	converted: readonly OrphanAyahCandidate[],
	links: ReadonlyMap<string, string>
): string {
	let output = sourceText;
	for (const candidate of [...converted].sort((a, b) => b.markerStart - a.markerStart)) {
		const title = links.get(candidate.id);
		if (!title) continue;
		output = `${output.slice(0, candidate.markerStart)}[[${title}|${candidate.marker}]]${output.slice(candidate.markerEnd)}`;
	}
	return output;
}

function startOfDocument(editor: EditorPort): EditorPosition {
	return { line: 0, ch: 0 };
}

function endOfDocument(editor: EditorPort): EditorPosition {
	const lastLine = Math.max(0, editor.lineCount() - 1);
	return { line: lastLine, ch: editor.getLine(lastLine).length };
}
