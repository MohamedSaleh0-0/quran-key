import type { CommandDefinition } from "../CommandRegistry";
import type { AppServices } from "../../AppServices";

export function createStripTashkeelCommand(services: AppServices): CommandDefinition {
	return {
		id: "strip-tashkeel-globally",
		name: "Strip tashkeel from selection or line",
		run: (editor) => {
			services.useCases.stripTashkeel.execute(services.wrapEditor(editor));
		},
	};
}