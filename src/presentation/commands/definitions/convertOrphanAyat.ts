import { Notice } from "obsidian";
import type { CommandDefinition } from "../CommandRegistry";
import type { AppServices } from "../../AppServices";
import { ConvertOrphanAyatModal } from "../../modals/ConvertOrphanAyatModal";

export function createConvertOrphanAyatCommand(services: AppServices): CommandDefinition {
	return {
		id: "convert-orphan-ayat",
		name: "Convert orphan ayat to linked notes",
		run: async (editor) => {
			if (services.settings.showOrphanAyahConversionPreview) {
				new ConvertOrphanAyatModal(services.app, services, editor).open();
				return;
			}

			const adapter = services.wrapEditor(editor);
			const options = services.buildOrphanAyatOptions();
			const scan = services.useCases.convertOrphanAyat.scan(adapter.getValue(), options);
			try {
				const result = await services.useCases.convertOrphanAyat.execute(adapter, scan, options);
				new Notice(result.converted.length > 0
					? services.settings.interfaceLanguage === "ar" ? `تم ربط ${result.converted.length} آية.` : `Linked ${result.converted.length} ayah(s).`
					: services.settings.interfaceLanguage === "ar" ? "لم تُعثر على آيات غير مرتبطة." : "No orphan ayahs were found.");
			} catch {
				new Notice(services.settings.interfaceLanguage === "ar" ? "تعذر تحويل الآيات." : "The ayahs could not be converted.");
			}
		},
	};
}
