import type { CommandDefinition } from "../CommandRegistry";
import type { AppServices } from "../../AppServices";

export function createConvertToFootnoteCommand(services: AppServices): CommandDefinition {
	return {
		id: "convert-reference-to-footnote",
		name: "Convert Quran reference to footnote",
		run: (editor) => {
			services.useCases.convertToFootnote.execute(services.wrapEditor(editor));
		},
	};
}