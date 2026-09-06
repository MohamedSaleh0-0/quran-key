import { Notice } from "obsidian";
import type { CommandDefinition } from "../CommandRegistry";
import type { AppServices } from "../../AppServices";
import type { ReflectionCategory } from "../../../domain/entities/ReflectionCategory";
import { ReflectionCategoryPickerModal } from "../../modals/ReflectionCategoryPickerModal";
import { QuranSearchModal } from "../../modals/QuranSearchModal";
import { t } from "../../../config/strings";

export function createLinkReflectionPickerCommand(services: AppServices): CommandDefinition {
	return {
		id: "link-reflection-picker",
		name: "Log selection to reflection (choose category)",
		run: (editor) => {
			const locale = services.settings.interfaceLanguage;
			const editorPort = services.wrapEditor(editor);
			const selectedText = editorPort.getSelection().trim();
			if (!selectedText) {
				new Notice(t(locale, "reflection.noSelection"));
				return;
			}
			const from = editorPort.getCursor("from");
			const to = editorPort.getCursor("to");

			new ReflectionCategoryPickerModal(services.app, services, (cat: ReflectionCategory) => {
				const link = (surahId: number, surahName: string, startAyah: number, endAyah: number) =>
					services.useCases.linkReflection.execute(
						editorPort,
						from,
						to,
						selectedText,
						cat,
						surahId,
						surahName,
						startAyah,
						endAyah,
						services.buildReflectionOptions()
					);

				const detected = services.useCases.linkReflection.detectExistingCitation(selectedText);
				if (detected) {
					void link(detected.surahId, detected.surahName, detected.startAyah, detected.endAyah);
					return;
				}

				new QuranSearchModal(services, editor, "", null, null, null, async (ayahs) => {
					if (ayahs.length === 0) return;
					const first = ayahs[0];
					const last = ayahs[ayahs.length - 1];
					await link(first.surahId, first.surahName, first.ayahId, last.ayahId);
				}).open();
			}).open();
		},
	};
}