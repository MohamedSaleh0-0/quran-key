import { Notice } from "obsidian";
import type { CommandDefinition } from "../CommandRegistry";
import type { AppServices } from "../../AppServices";
import { t } from "../../../config/strings";
import type { ReflectionDestination } from "../../modals/ReflectionCategoryPickerModal";
import { LogAyahEntryModal } from "../../modals/LogAyahEntryModal";
import { QuranSearchModal } from "../../modals/QuranSearchModal";
import { parseReflectionInput } from "../../../domain/services/ReflectionEntrySyntax";
import { createTemporaryReflectionCategory } from "../../../domain/services/TemporaryReflectionCategory";

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
			const parsed = parseReflectionInput(selectedText, services.settings.reflectionCategoryDelimiter);

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

			if (!parsed.categoryName) {
				const initialAyah = initialDestination
					? services.repository.findAyah(initialDestination.surahId, initialDestination.startAyah)
					: null;
				new LogAyahEntryModal(services.app, services, selectedText, initialAyah).open();
				return;
			}

			const category = services.reflectionCatalog
				.all()
				.find((candidate) => candidate.id.toLowerCase() === parsed.categoryName!.toLowerCase() || candidate.name.trim().toLowerCase() === parsed.categoryName!.toLowerCase());
			const destinationCategory = category ?? createTemporaryReflectionCategory(parsed.categoryName);

			const log = (destination: ReflectionDestination) =>
				services.useCases.linkReflection.execute(
					parsed.content,
					destinationCategory,
					destination.surahId,
					destination.surahName,
					destination.startAyah,
					destination.startAyah,
					services.buildReflectionOptions()
				);

			if (initialDestination) {
				void log(initialDestination).catch(() => new Notice(t(locale, "entry.failed")));
				return;
			}

			new QuranSearchModal(services, editor, "", null, null, null, async (ayahs) => {
				const first = ayahs[0];
				if (!first) return;
				try {
					await log({ surahId: first.surahId, surahName: first.surahName, startAyah: first.ayahId, endAyah: first.ayahId });
				} catch {
					new Notice(t(locale, "entry.failed"));
				}
			}).open();
		},
	};
}
