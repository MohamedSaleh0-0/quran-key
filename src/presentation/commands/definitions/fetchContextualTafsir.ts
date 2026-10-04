import type { CommandDefinition } from "../CommandRegistry";
import type { AppServices } from "../../AppServices";
import { TafsirBookPickerModal } from "../../modals/TafsirBookPickerModal";
import { QuranSearchModal } from "../../modals/QuranSearchModal";

/** Single tafsir flow: resolve the target from the current line when
 * possible, otherwise use the same command to search for the target. */
export function createFetchContextualTafsirCommand(services: AppServices): CommandDefinition {
	return {
		id: "fetch-tafsir",
		name: "Fetch tafsir",
		hotkeys: [{ modifiers: ["Ctrl"], key: "t" }],
		run: (editor) => {
			const editorPort = services.wrapEditor(editor);
			const cursor = editorPort.getCursor();
			const lineText = editorPort.getLine(cursor.line);
			const context = services.useCases.analyzeContext.execute(editorPort);

			const openBookPicker = (surahId: number, surahName: string, startAyah: number, endAyah: number) => new TafsirBookPickerModal(services.app, services, (chosenBooks) => {
				if (chosenBooks.length === 0) return;
				void services.useCases.fetchTafsir.execute(
					editorPort,
					lineText,
					cursor.line,
					surahId,
					surahName,
					startAyah,
					endAyah,
					services.buildTafsirOptions(),
					chosenBooks
				);
			}).open();

			if (context) {
				const fetchContext = (surahId: number, surahName: string, startAyah: number, endAyah: number) => {
					const mentionedBooks = services.catalog.findMentionedIn(lineText);
					if (mentionedBooks.length > 0) {
						void services.useCases.fetchTafsir.execute(
							editorPort,
							lineText,
							cursor.line,
							surahId,
							surahName,
							startAyah,
							endAyah,
							services.buildTafsirOptions(),
							mentionedBooks
						);
						return;
					}
					openBookPicker(surahId, surahName, startAyah, endAyah);
				};

				if (context.candidates && context.candidates.length > 1) {
					new QuranSearchModal(
						services,
						editor,
						context.query ?? "",
						context.candidates,
						null,
						null,
						(ayahs) => {
							const selected = ayahs[0];
							if (!selected) return;
							fetchContext(selected.surahId, selected.surahName, selected.ayahId, selected.ayahId);
						}
					).open();
					return;
				}

				fetchContext(context.surahId, context.surahName, context.startAyah, context.endAyah);
				return;
			}

			new QuranSearchModal(services, editor, "", null, null, null, (ayahs) => {
				const first = ayahs[0];
				const last = ayahs[ayahs.length - 1];
				if (!first || !last) return;
				openBookPicker(first.surahId, first.surahName, first.ayahId, last.ayahId);
			}).open();
		},
	};
}
