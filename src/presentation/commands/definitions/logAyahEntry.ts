import type { CommandDefinition } from "../CommandRegistry";
import type { AppServices } from "../../AppServices";
import { LogAyahEntryModal } from "../../modals/LogAyahEntryModal";

export function createLogAyahEntryCommand(services: AppServices): CommandDefinition {
	return {
		id: "log-quran-ayah-entry",
		name: "Log note on Quran ayah",
		run: () => {
			new LogAyahEntryModal(services.app, services).open();
		},
	};
}
