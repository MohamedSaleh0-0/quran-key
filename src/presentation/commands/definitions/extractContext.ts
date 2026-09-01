import type { CommandDefinition } from "../CommandRegistry";
import type { AppServices } from "../../AppServices";
import { QuranSearchModal } from "../../modals/QuranSearchModal";

/** FR-9..15: the plugin's primary "do the thing" command. */
export function createExtractContextCommand(services: AppServices): CommandDefinition {
	return {
		id: "extract-quran-context",
		name: "Extract Quran verse from context",
		run: (editor) => {
			const editorPort = services.wrapEditor(editor);
			const success = services.useCases.extract.execute(editorPort, (query, matches, start, end) => {
				new QuranSearchModal(services, editor, query, matches, start, end).open();
			});
			if (!success) {
				new QuranSearchModal(services, editor).open();
			}
		},
	};
}