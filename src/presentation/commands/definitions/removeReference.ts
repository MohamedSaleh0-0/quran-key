import type { CommandDefinition } from "../CommandRegistry";
import type { AppServices } from "../../AppServices";

export function createRemoveReferenceCommand(services: AppServices): CommandDefinition {
	return {
		id: "remove-quran-reference",
		name: "Remove Quran Reference From Line",
		run: (editor) => {
			services.useCases.removeReference.execute(services.wrapEditor(editor));
		},
	};
}
