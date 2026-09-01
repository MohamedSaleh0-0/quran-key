import type { CommandDefinition } from "../CommandRegistry";
import type { AppServices } from "../../AppServices";
import { TafsirBookPickerModal } from "../../modals/TafsirBookPickerModal";
import { QuranSearchModal } from "../../modals/QuranSearchModal";

/** FR-26 "global" entry point: pick books first, then pick verse(s) — via
 *  the current line's context if it resolves to one, otherwise via the
 *  search modal's override mode. */
export function createOpenGlobalTafsirCommand(services: AppServices): CommandDefinition {
	return {
		id: "open-tafsir-global-modal",
		name: "Open global tafsir selection modal",
		run: (editor) => {
			new TafsirBookPickerModal(services.app, services, (chosenBooks) => {
				if (chosenBooks.length === 0) return;
				const editorPort = services.wrapEditor(editor);
				const cursor = editorPort.getCursor();
				const lineText = editorPort.getLine(cursor.line);
				const context = services.useCases.analyzeContext.execute(editorPort);

				if (context) {
					void services.useCases.fetchTafsir.execute(
						editorPort,
						lineText,
						cursor.line,
						context.surahId,
						context.surahName,
						context.startAyah,
						context.endAyah,
						services.buildTafsirOptions(),
						chosenBooks
					);
					return;
				}

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