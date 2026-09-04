import type { CommandDefinition } from "../CommandRegistry";
import type { AppServices } from "../../AppServices";
import { LinkAyatModal } from "../../modals/LinkAyatModal";

export function createLinkAyatCommand(services: AppServices): CommandDefinition {
	return {
		id: "link-ayat-together",
		name: "Link related ayahs",
		run: () => {
			new LinkAyatModal(services.app, services).open();
		},
	};
}
