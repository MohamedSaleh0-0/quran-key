import type { CommandDefinition } from "../CommandRegistry";
import type { AppServices } from "../../AppServices";
import { QuranSearchModal } from "../../modals/QuranSearchModal";

export function createOpenGlobalSearchCommand(services: AppServices): CommandDefinition {
	return {
		id: "open-quran-global-search",
		name: "Open Global Quran Search Modal",
		run: (editor) => {
			new QuranSearchModal(services, editor).open();
		},
	};
}
