import type { CommandDefinition } from "../CommandRegistry";
import type { AppServices } from "../../AppServices";
import { TafsirBookPickerModal } from "../../modals/TafsirBookPickerModal";
import { QuranSearchModal } from "../../modals/QuranSearchModal";

/** FR-26 "current line" entry point: run context analysis first; only
 *  fall back to a manual picker if the line doesn't resolve to an ayah. */
export function createFetchContextualTafsirCommand(services: AppServices): CommandDefinition {
	return {
		id: "fetch-contextual-tafsir",
		name: "Fetch contextual tafsir for current line",
		run: async (editor) => {
			const editorPort = services.wrapEditor(editor);
			const cursor = editorPort.getCursor();
			const lineText = editorPort.getLine(cursor.line);
			const context = services.useCases.analyzeContext.execute(editorPort);

			if (context) {
				await services.useCases.fetchTafsir.execute(
					editorPort,
					lineText,
					cursor.line,
					context.surahId,
					context.surahName,
					context.startAyah,
					context.endAyah,
					services.buildTafsirOptions()
				);
				return;
			}

			new TafsirBookPickerModal(services.app, services, (chosenBooks) => {
				if (chosenBooks.length === 0) return;
				new QuranSearchModal(services, editor, "", null, null, null, async (ayahs) => {
					if (ayahs.length === 0) return;
					const first = ayahs[0];
					const last = ayahs[ayahs.length - 1];
					await services.useCases.fetchTafsir.execute(
						editorPort,
						lineText,
						cursor.line,
						first.surahId,
						first.surahName,
						first.ayahId,
						last.ayahId,
						services.buildTafsirOptions(),
						chosenBooks
					);
				}).open();
			}).open();
		},
	};
}