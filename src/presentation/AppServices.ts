import type { App, Editor } from "obsidian";
import type { PluginConfig } from "../config/types";
import type { EditorPort } from "../domain/ports/EditorPort";
import type { QuranRepository } from "../domain/ports/QuranRepository";
import type { AyahNoteRepository } from "../domain/ports/AyahNoteRepository";
import type { ArabicNormalizer } from "../domain/services/ArabicNormalizer";
import type { TafsirCatalog } from "../domain/services/TafsirCatalog";
import type { ReflectionCategoryCatalog } from "../domain/services/ReflectionCategoryCatalog";
import type { AnalyzeLineContext } from "../application/use-cases/AnalyzeLineContext";
import type { ConvertReferenceToFootnote } from "../application/use-cases/ConvertReferenceToFootnote";
import type { ExtractAndInsertVerse } from "../application/use-cases/ExtractAndInsertVerse";
import type { ExtractAyahSections } from "../application/use-cases/ExtractAyahSections";
import type { FetchAndInsertTafsir, TafsirFormattingOptions } from "../application/use-cases/FetchAndInsertTafsir";
import type { LinkReflectionToVerses, ReflectionLinkOptions } from "../application/use-cases/LinkReflectionToVerses";
import type { LinkAyahsTogether } from "../application/use-cases/LinkAyahsTogether";
import type { RemoveQuranReference } from "../application/use-cases/RemoveQuranReference";
import type { SearchQuranVerses } from "../application/use-cases/SearchQuranVerses";
import type { StripTashkeel } from "../application/use-cases/StripTashkeel";

/**
 * The single object presentation code (commands, modals, the settings
 * tab) depends on. Built once in main.ts's composition root and rebuilt
 * (see `main.ts` `rebuildCoreServices`) whenever a setting that affects
 * parsing/formatting changes — presentation code never constructs a
 * concrete adapter or use case itself.
 */
export interface AppServices {
	app: App;
	settings: PluginConfig;
	repository: QuranRepository;
	ayahNotes: AyahNoteRepository;
	catalog: TafsirCatalog;
	reflectionCatalog: ReflectionCategoryCatalog;
	normalizer: ArabicNormalizer;
	useCases: {
		search: SearchQuranVerses;
		analyzeContext: AnalyzeLineContext;
		extract: ExtractAndInsertVerse;
		extractAyahSections: ExtractAyahSections;
		fetchTafsir: FetchAndInsertTafsir;
		removeReference: RemoveQuranReference;
		convertToFootnote: ConvertReferenceToFootnote;
		stripTashkeel: StripTashkeel;
		linkReflection: LinkReflectionToVerses;
		linkAyahsTogether: LinkAyahsTogether;
	};
	buildTafsirOptions: () => TafsirFormattingOptions;
	buildReflectionOptions: () => ReflectionLinkOptions;
	wrapEditor: (editor: Editor) => EditorPort;
	saveSettings: () => Promise<void>;
	/** Registers a single reflection category's dedicated command
	 *  on-the-fly (so it's immediately bindable to a hotkey), without
	 *  touching any other already-registered command. Used both by the
	 *  Settings "add category" flow and by ReflectionCategoryPickerModal's
	 *  "create new" flow — startup instead loops the whole catalog
	 *  through registerAllCommands. */
	registerReflectionCategoryCommand: (categoryId: string) => void;
	/** Best-effort removal of a category's dedicated command (unofficial
	 *  Obsidian API — see main.ts for the try/catch). If it fails or the
	 *  API is gone in some future Obsidian version, the command just
	 *  lingers harmlessly in the palette until the next reload; nothing
	 *  else is affected. */
	unregisterReflectionCategoryCommand: (categoryId: string) => void;
}
