import type { CommandDefinition } from "../CommandRegistry";
import type { AppServices } from "../../AppServices";
import { SurahNoteModal } from "../../modals/SurahNoteModal";

export function createOpenSurahNoteCommand(services: AppServices): CommandDefinition {
	return {
		id: "open-quran-surah-note",
		name: "Open or create Quran surah note",
		run: () => {
			new SurahNoteModal(services.app, services).open();
		},
	};
}
