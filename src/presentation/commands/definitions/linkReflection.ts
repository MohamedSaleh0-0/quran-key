import { Notice } from "obsidian";
import type { CommandDefinition } from "../CommandRegistry";
import type { AppServices } from "../../AppServices";
import { QuranSearchModal } from "../../modals/QuranSearchModal";
import { t } from "../../../config/strings";

/**
 * Shared by every reflection category's link command — registerCommands.ts
 * calls this factory once per builtin category id ("tadabbur", "athar"),
 * each producing its own independent command-palette entry, since the
 * linking mechanics are identical and only the target category differs.
 * A custom category added from Settings doesn't automatically get a
 * command (needs its own registerCommands.ts line + a reload) — a
 * reasonable v1 boundary, see QuranKeySettingsTab's reflection-category
 * section.
 */
export function createLinkReflectionCommand(services: AppServices, categoryId: string): CommandDefinition {
	const category = services.reflectionCatalog.byId(categoryId);

	return {
		id: `link-reflection-${categoryId}`,
		name: category ? `Log Selection as ${category.name}` : `Log Selection (${categoryId})`,
		run: (editor) => {
			const locale = services.settings.interfaceLanguage;
			const cat = services.reflectionCatalog.byId(categoryId);
			if (!cat) {
				new Notice(t(locale, "reflection.unknownCategory"));
				return;
			}

			const editorPort = services.wrapEditor(editor);
			const selectedText = editorPort.getSelection().trim();
			if (!selectedText) {
				new Notice(t(locale, "reflection.noSelection"));
				return;
			}
			const from = editorPort.getCursor("from");
			const to = editorPort.getCursor("to");

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
		},
	};
}
