import { Notice } from "obsidian";
import type { CommandDefinition } from "../CommandRegistry";
import type { AppServices } from "../../AppServices";
import { LogAyahEntryModal } from "../../modals/LogAyahEntryModal";
import { QuranSearchModal } from "../../modals/QuranSearchModal";
import { parseReflectionInput } from "../../../domain/services/ReflectionEntrySyntax";
import { createTemporaryReflectionCategory } from "../../../domain/services/TemporaryReflectionCategory";
import { t } from "../../../config/strings";

export function createLogAyahEntryCommand(services: AppServices): CommandDefinition {
	return {
		id: "log-quran-ayah-entry",
		name: "Log note on Quran ayah or selection",
		run: (editor) => {
			const selectedText = services.wrapEditor(editor).getSelection().trim();
			if (!selectedText) {
				new LogAyahEntryModal(services.app, services).open();
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
			const destination = noteDestination
				? { surahId: noteDestination.surahId, surahName: noteDestination.surahName, startAyah: noteDestination.ayahId }
				: detected
					? { surahId: detected.surahId, surahName: detected.surahName, startAyah: detected.startAyah }
					: null;

			if (!parsed.categoryName) {
				const initialAyah = destination
					? services.repository.findAyah(destination.surahId, destination.startAyah)
					: null;
				new LogAyahEntryModal(services.app, services, selectedText, initialAyah).open();
				return;
			}

			const locale = services.settings.interfaceLanguage;
			const category = services.reflectionCatalog
				.all()
				.find((candidate) => candidate.id.toLowerCase() === parsed.categoryName!.toLowerCase() || candidate.name.trim().toLowerCase() === parsed.categoryName!.toLowerCase())
				?? createTemporaryReflectionCategory(parsed.categoryName);
			const log = (surahId: number, surahName: string, ayahId: number) =>
				services.useCases.linkReflection.execute(
					parsed.content,
					category,
					surahId,
					surahName,
					ayahId,
					ayahId,
					services.buildReflectionOptions()
				);

			if (destination) {
				void log(destination.surahId, destination.surahName, destination.startAyah).catch(() => new Notice(t(locale, "entry.failed")));
				return;
			}

			new QuranSearchModal(services, editor, "", null, null, null, async (ayahs) => {
				const first = ayahs[0];
				if (!first) return;
				try {
					await log(first.surahId, first.surahName, first.ayahId);
				} catch {
					new Notice(t(locale, "entry.failed"));
				}
			}).open();
		},
	};
}
