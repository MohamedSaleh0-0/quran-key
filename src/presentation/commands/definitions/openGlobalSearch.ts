import type { CommandDefinition } from "../CommandRegistry";
import type { AppServices } from "../../AppServices";
import { QuranSearchModal } from "../../modals/QuranSearchModal";

export function createOpenGlobalSearchCommand(services: AppServices): CommandDefinition {
	return {
		id: "open-quran-global-search",
		name: "Open global Quran search modal",
		run: (editor) => {
			new QuranSearchModal(services, editor).open();
		},
	};
}