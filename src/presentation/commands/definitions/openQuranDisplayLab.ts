import type { CommandDefinition } from "../CommandRegistry";
import type { AppServices } from "../../AppServices";
import { QuranDisplayLabModal } from "../../modals/QuranDisplayLabModal";

export function createOpenQuranDisplayLabCommand(services: AppServices): CommandDefinition {
	return {
		id: "open-quran-display-lab",
		name: "Open Quran display laboratory",
		requiresEditor: false,
		run: () => {
			new QuranDisplayLabModal(services.app, services).open();
		},
	};
}
