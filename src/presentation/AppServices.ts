import type { App, Editor } from "obsidian";
import type { PluginConfig } from "../config/types";
import type { EditorPort } from "../domain/ports/EditorPort";
import type { QuranRepository } from "../domain/ports/QuranRepository";
import type { ArabicNormalizer } from "../domain/services/ArabicNormalizer";
import type { TafsirCatalog } from "../domain/services/TafsirCatalog";
import type { ReflectionCategoryCatalog } from "../domain/services/ReflectionCategoryCatalog";
import type { AnalyzeLineContext } from "../application/use-cases/AnalyzeLineContext";
import type { ConvertReferenceToFootnote } from "../application/use-cases/ConvertReferenceToFootnote";
import type { ExtractAndInsertVerse } from "../application/use-cases/ExtractAndInsertVerse";
import type { FetchAndInsertTafsir, TafsirFormattingOptions } from "../application/use-cases/FetchAndInsertTafsir";
import type { LinkReflectionToVerses, ReflectionLinkOptions } from "../application/use-cases/LinkReflectionToVerses";
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
	catalog: TafsirCatalog;
	reflectionCatalog: ReflectionCategoryCatalog;
	normalizer: ArabicNormalizer;
	useCases: {
		search: SearchQuranVerses;
		analyzeContext: AnalyzeLineContext;
		extract: ExtractAndInsertVerse;
		fetchTafsir: FetchAndInsertTafsir;
		removeReference: RemoveQuranReference;
		convertToFootnote: ConvertReferenceToFootnote;
		stripTashkeel: StripTashkeel;
		linkReflection: LinkReflectionToVerses;
	};
	buildTafsirOptions: () => TafsirFormattingOptions;
	buildReflectionOptions: () => ReflectionLinkOptions;
	wrapEditor: (editor: Editor) => EditorPort;
	saveSettings: () => Promise<void>;
}

