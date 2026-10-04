import { describe, expect, it } from "vitest";
import type { Ayah } from "../../src/domain/entities/Ayah";
import type { EditorPort } from "../../src/domain/ports/EditorPort";
import type { AyahNoteRepository } from "../../src/domain/ports/AyahNoteRepository";
import { ArabicNormalizer } from "../../src/domain/services/ArabicNormalizer";
import { ConvertOrphanAyat } from "../../src/application/use-cases/ConvertOrphanAyat";
import { VerseReference } from "../../src/domain/value-objects/VerseReference";

const ayah: Ayah = {
	id: 1,
	surahId: 1,
	ayahId: 1,
	surahName: "الفاتحة",
	text: "بسم الله الرحمن الرحيم",
};

class FakeEditor implements EditorPort {
	constructor(private value: string) {}

	getCursor() { return { line: 0, ch: 0 }; }
	getLine() { return this.value; }
	lineCount() { return 1; }
	setLine(_line: number, text: string) { this.value = text; }
	replaceRange(text: string) { this.value = text; }
	getSelection() { return ""; }
	getValue() { return this.value; }
}

describe("ConvertOrphanAyat", () => {
	it("links only the orphan marker and removes only its created files on rollback", async () => {
		const source = "﴿ بسم الله الرحمن الرحيم (1) ﴾ [الفاتحة:1]";
		const editor = new FakeEditor(source);
		const snapshots = [
			{ path: "ayah.md", content: "new ayah" },
			{ path: "surah.md", content: "new surah" },
		];
		let deleted: readonly typeof snapshots = [];
		const ayahNotes = {
			ensureUnifiedNote: async () => ({ title: "ayah-note", createdFiles: snapshots.map((file) => file.path) }),
			snapshotFiles: async () => snapshots,
			deleteCreatedFiles: async (files: typeof snapshots) => {
				deleted = files;
				return files.map((file) => file.path);
			},
		} as unknown as AyahNoteRepository;
		const useCase = new ConvertOrphanAyat(ayahNotes);
		const options = {
			wrapperStart: "﴿",
			wrapperEnd: "﴾",
			ayahMarkerStyle: "parenthesized" as const,
			reference: VerseReference.compile("[{surah}:{verse}]"),
			normalizer: new ArabicNormalizer([]),
			ayahs: [ayah],
			fileNameTemplate: "{ayahText}",
			noteTemplate: "{ayah}",
			formatAyahNoteBody: () => "formatted",
		};
		const scan = useCase.scan(source, options);
		const result = await useCase.execute(editor, scan, options);

		expect(editor.getValue()).toContain("[[ayah-note|(1)]]");
		expect(editor.getValue()).toContain("[الفاتحة:1]");
		expect(result.converted).toHaveLength(1);

		const rollback = await useCase.rollback(editor, result);
		expect(rollback.restored).toBe(true);
		expect(editor.getValue()).toBe(source);
		expect(deleted).toHaveLength(2);
	});
});
