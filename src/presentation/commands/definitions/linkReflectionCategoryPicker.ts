import { Notice } from "obsidian";
import type { CommandDefinition } from "../CommandRegistry";
import type { AppServices } from "../../AppServices";
import { ReflectionCategoryPickerModal } from "../../modals/ReflectionCategoryPickerModal";
import { t } from "../../../config/strings";
import type { ReflectionDestination } from "../../modals/ReflectionCategoryPickerModal";

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

			const activeFile = services.app.workspace.getActiveFile();
			const frontmatter = activeFile ? services.app.metadataCache.getFileCache(activeFile)?.frontmatter : undefined;
			const noteDestination =
				frontmatter?.type === "quran-ayah" && Number.isInteger(Number(frontmatter.surahId)) && Number.isInteger(Number(frontmatter.ayahId))
					? services.repository.findAyah(Number(frontmatter.surahId), Number(frontmatter.ayahId))
					: null;
			const detected = services.useCases.linkReflection.detectExistingCitation(selectedText);
			const initialDestination: ReflectionDestination | null = noteDestination
				? { surahId: noteDestination.surahId, surahName: noteDestination.surahName, startAyah: noteDestination.ayahId, endAyah: noteDestination.ayahId }
				: detected
					? { surahId: detected.surahId, surahName: detected.surahName, startAyah: detected.startAyah, endAyah: detected.endAyah }
					: null;

			new ReflectionCategoryPickerModal(
				services.app,
				services,
				async (cat, destination) => {
					if (!destination) return;
					await services.useCases.linkReflection.execute(
						editorPort,
						from,
						to,
						selectedText,
						cat,
						destination.surahId,
						destination.surahName,
						destination.startAyah,
						destination.endAyah,
						services.buildReflectionOptions()
					);
				},
				{ destination: initialDestination, editor, requireDestination: true }
			).open();
		},
	};
}
