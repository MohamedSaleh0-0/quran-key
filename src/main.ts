import { Plugin, TFile } from "obsidian";
import type { Editor } from "obsidian";
import type { Extension } from "@codemirror/state";

import { DEFAULT_SETTINGS, migrateLegacySettings } from "./config/defaults";
import type { PluginConfig } from "./config/types";
import type { TafsirBook } from "./domain/entities/TafsirBook";
import type { ReflectionCategory } from "./domain/entities/ReflectionCategory";
import type { Ayah } from "./domain/entities/Ayah";
import { ArabicNormalizer } from "./domain/services/ArabicNormalizer";
import { PhraseMatcher } from "./domain/services/PhraseMatcher";
import { FuzzyMatcher } from "./domain/services/FuzzyMatcher";
import { SlidingWindowSearch } from "./domain/services/SlidingWindowSearch";
import { SnippetExtractor } from "./domain/services/SnippetExtractor";
import { OrnateNumberConverter } from "./domain/services/OrnateNumberConverter";
import { VerseOutputFormatter, type FormattingOptions } from "./domain/services/VerseOutputFormatter";
import { TafsirCatalog } from "./domain/services/TafsirCatalog";
import { ReflectionCategoryCatalog } from "./domain/services/ReflectionCategoryCatalog";
import { VerseReference } from "./domain/value-objects/VerseReference";

import { SearchQuranVerses } from "./application/use-cases/SearchQuranVerses";
import { AnalyzeLineContext } from "./application/use-cases/AnalyzeLineContext";
import { ExtractAndInsertVerse } from "./application/use-cases/ExtractAndInsertVerse";
import { ExtractAyahSections } from "./application/use-cases/ExtractAyahSections";
import { ToggleSnippetView } from "./application/use-cases/ToggleSnippetView";
import { FetchAndInsertTafsir, type TafsirFormattingOptions } from "./application/use-cases/FetchAndInsertTafsir";
import { LinkReflectionToVerses, type ReflectionLinkOptions } from "./application/use-cases/LinkReflectionToVerses";
import { LinkAyahsTogether } from "./application/use-cases/LinkAyahsTogether";
import { RemoveQuranReference } from "./application/use-cases/RemoveQuranReference";
import { ConvertReferenceToFootnote } from "./application/use-cases/ConvertReferenceToFootnote";
import { StripTashkeel } from "./application/use-cases/StripTashkeel";

import { ObsidianQuranRepository } from "./infrastructure/obsidian/ObsidianQuranRepository";
import { ObsidianEditorAdapter } from "./infrastructure/obsidian/ObsidianEditorAdapter";
import { ObsidianNoticeAdapter } from "./infrastructure/obsidian/ObsidianNoticeAdapter";
import { ObsidianAyahNoteRepository } from "./infrastructure/obsidian/ObsidianAyahNoteRepository";
import {
	applyStyleVariables,
	cleanupStyleVariables,
	createLazyAyahMarkerPostProcessor,
	createMarkdownPostProcessor,
	createOrnateNumberHighlightExtension,
	createOrnateNumberPostProcessor,
	createQuranHighlightExtension,
} from "./infrastructure/obsidian/QuranHighlightExtension";
import { HttpTafsirRepository } from "./infrastructure/http/HttpTafsirRepository";
import { InMemoryInsertionMemento } from "./infrastructure/memory/InMemoryInsertionMemento";

import type { AppServices } from "./presentation/AppServices";
import { registerCommands } from "./presentation/commands/CommandRegistry";
import { createLinkReflectionCommand } from "./presentation/commands/definitions/linkReflection";
import { registerAllCommands } from "./presentation/commands/registerCommands";
import { QuranKeySettingsTab } from "./presentation/settings/QuranKeySettingsTab";

import builtinTafsirBooksData from "../data/tafsirBooks.json";
import builtinReflectionCategoriesData from "../data/reflectionCategories.json";

export default class QuranKeyPlugin extends Plugin {
	settings: PluginConfig = DEFAULT_SETTINGS;

	private repository!: ObsidianQuranRepository;
	private readonly tafsirRepository = new HttpTafsirRepository();
	private readonly notice = new ObsidianNoticeAdapter();
	private readonly memento = new InMemoryInsertionMemento();
	private readonly editorExtension: Extension[] = [];
	private lazyAyahNoteOpener: (surahId: number, ayahId: number) => Promise<void> = async () => undefined;

	services!: AppServices;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.repository = new ObsidianQuranRepository(
			this.app.vault,
			new ArabicNormalizer(this.settings.normalizationRules),
		);
		await this.repository.loadAll();

		this.refreshStyles();
		this.rebuildCoreServices();
		this.refreshHighlightExtension();
		this.registerEditorExtension(this.editorExtension);

		this.registerMarkdownPostProcessor((el, ctx) => {
			createMarkdownPostProcessor(this.settings.wrapperStart, this.settings.wrapperEnd)(el);
			const sourceFile = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
			const surahId = sourceFile instanceof TFile ? Number(this.app.metadataCache.getFileCache(sourceFile)?.frontmatter?.surahId) : NaN;
			createLazyAyahMarkerPostProcessor((surahId, ayahId) => this.lazyAyahNoteOpener(surahId, ayahId), surahId)(el);
			if (this.settings.styleOrnateNumbers) {
				createOrnateNumberPostProcessor()(el);
			}
		});

		this.addSettingTab(new QuranKeySettingsTab(this.app, this, this.services));
		registerAllCommands(this, this.services);
	}

	onunload(): void {
		cleanupStyleVariables();
	}

	async loadSettings(): Promise<void> {
		const rawData = (await this.loadData()) as Partial<PluginConfig> | undefined;
		const raw = migrateLegacySettings(rawData);
		this.settings = Object.assign({}, DEFAULT_SETTINGS, raw);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.rebuildCoreServices();
		this.refreshHighlightExtension();
		this.refreshStyles();
	}

	private refreshStyles(): void {
		applyStyleVariables(this.settings);
	}

	private refreshHighlightExtension(): void {
		this.editorExtension.length = 0;
		this.editorExtension.push(createQuranHighlightExtension(this.settings.wrapperStart, this.settings.wrapperEnd));
		if (this.settings.styleOrnateNumbers) {
			this.editorExtension.push(createOrnateNumberHighlightExtension());
		}
		this.app.workspace.updateOptions();
	}

	private rebuildCoreServices(): void {
		const normalizer = new ArabicNormalizer(this.settings.normalizationRules);
		this.repository = new ObsidianQuranRepository(
			this.app.vault,
			normalizer,
		);
		void this.repository.loadAll();

		const reference = VerseReference.compile(this.settings.referenceFormat);
		const phraseMatcher = new PhraseMatcher(normalizer);
		const fuzzyMatcher = new FuzzyMatcher(normalizer);
		const slidingWindow = new SlidingWindowSearch(
			normalizer,
			phraseMatcher,
			this.settings.wrapperStart,
			this.settings.wrapperEnd,
			this.settings.maxSlidingWindowWords
		);
		const snippetExtractor = new SnippetExtractor(normalizer, this.settings.wrapperStart, this.settings.wrapperEnd);
		const ornateConverter = new OrnateNumberConverter();
		const formatter = new VerseOutputFormatter(ornateConverter, reference, (text) => normalizer.stripTashkeel(text));
		const toggle = new ToggleSnippetView(snippetExtractor, formatter);

		const builtinBooks = builtinTafsirBooksData as unknown as TafsirBook[];
		const catalog = new TafsirCatalog(builtinBooks, this.settings.customTafsirBooks);

		const builtinReflectionCategories = builtinReflectionCategoriesData as unknown as ReflectionCategory[];
		const reflectionCatalog = new ReflectionCategoryCatalog(
			builtinReflectionCategories,
			this.settings.customReflectionCategories
		);

		const ayahNotes = new ObsidianAyahNoteRepository(this.app, () => ({
			ayahNotesFolder: this.settings.ayahNotesFolder,
			reflectionFileNameAyahTextMaxLength: this.settings.reflectionFileNameAyahTextMaxLength,
			surahNotesFolder: this.settings.surahNotesFolder,
			surahNoteFileNameTemplate: this.settings.surahNoteFileNameTemplate,
			referenceFormat: this.settings.referenceFormat,
			wrapperStart: this.settings.wrapperStart,
			wrapperEnd: this.settings.wrapperEnd,
			ayahMarkerStyle: this.settings.ayahMarkerStyle,
			getSurahAyahs: (surahId) => this.repository.getAllAyahs().filter((ayah) => ayah.surahId === surahId),
		}));

		const getFormattingOptions = (): FormattingOptions => ({
			wrapperStart: this.settings.wrapperStart,
			wrapperEnd: this.settings.wrapperEnd,
			useOrnateNumbers: true,
			stripTashkeelOnOutput: this.settings.stripTashkeel,
			ayahMarkerStyle: this.settings.ayahMarkerStyle,
		});

		this.lazyAyahNoteOpener = async (surahId, ayahId) => {
			const ayah = this.repository.findAyah(surahId, ayahId);
			if (!ayah) return;
			const title = await ayahNotes.resolveUnifiedNoteTitle(
				{
					surahId: ayah.surahId,
					surahName: ayah.surahName,
					ayahId: ayah.ayahId,
					ayahTextRaw: ayah.text,
					ayahTextBodyFormatted: formatter.format([ayah], getFormattingOptions()),
				},
				this.settings.reflectionFileNameTemplate,
				this.settings.includeAyahTextInReflectionNote,
				true
			);
			if (title) await this.app.workspace.openLinkText(title, "", false);
		};

		const prepareFormattingOptions = async (ayahs: readonly Ayah[]): Promise<FormattingOptions> => {
			const base = getFormattingOptions();
			if (!this.settings.linkAyahMarkersOnInsert) return base;

			const links = new Map<string, string>();
			// Keep this sequential: multiple ayahs from the same range may all
			// need to create the same parent surah note.
			for (const ayah of ayahs) {
				const canonical = this.repository.findAyah(ayah.surahId, ayah.ayahId) ?? ayah;
				const title = await ayahNotes.resolveUnifiedNoteTitle(
					{
						surahId: canonical.surahId,
						surahName: canonical.surahName,
						ayahId: canonical.ayahId,
						ayahTextRaw: canonical.text,
						ayahTextBodyFormatted: formatter.format([canonical], base),
					},
					this.settings.reflectionFileNameTemplate,
					this.settings.includeAyahTextInReflectionNote,
					true
				);
				if (title) links.set(`${canonical.surahId}:${canonical.ayahId}`, title);
			}
			return { ...base, ayahNoteLinks: links };
		};

		const linkReflection = new LinkReflectionToVerses(
			this.repository,
			normalizer,
			reference,
			formatter,
			reflectionCatalog,
			ayahNotes
		);

		const linkAyahsTogether = new LinkAyahsTogether(ayahNotes, formatter);
		const extractAyahSections = new ExtractAyahSections(ayahNotes);

		const extract = new ExtractAndInsertVerse(
			this.repository,
			normalizer,
			phraseMatcher,
			slidingWindow,
			snippetExtractor,
			formatter,
			reference,
			this.memento,
			toggle,
			this.settings.wrapperStart,
			this.settings.wrapperEnd,
			prepareFormattingOptions
		);

		const search = new SearchQuranVerses(
			this.repository,
			phraseMatcher,
			fuzzyMatcher,
			this.settings.maxSuggestionResults,
			this.settings.searchStrategy
		);
		const analyzeContext = new AnalyzeLineContext(this.repository, normalizer, reference, slidingWindow);
		const fetchTafsir = new FetchAndInsertTafsir(this.repository, this.tafsirRepository, catalog, this.notice);
		const removeReference = new RemoveQuranReference(reference);
		const convertToFootnote = new ConvertReferenceToFootnote(reference);
		const stripTashkeel = new StripTashkeel(normalizer);

		const buildTafsirOptions = (): TafsirFormattingOptions => ({
			locale: this.settings.interfaceLanguage,
			wrapperStart: this.settings.wrapperStart,
			wrapperEnd: this.settings.wrapperEnd,
			includeAyahText: this.settings.includeAyahTextInTafsir,
			useHorizontalDivider: this.settings.useHorizontalDivider,
			rangeHeadingLevel: this.settings.rangeHeadingLevel,
			bookHeadingLevel: this.settings.bookHeadingLevel,
			fetchDelayMs: this.settings.tafsirFetchDelayMs,
			fetchDelayThreshold: this.settings.tafsirFetchDelayThreshold,
			resolutionOrder: this.settings.tafsirBookResolutionOrder,
			favoriteBookIds: this.settings.favoriteBooksIds,
			defaultBookId: this.settings.defaultTafsirBookId,
		});

		const buildReflectionOptions = (): ReflectionLinkOptions => ({
			locale: this.settings.interfaceLanguage,
			replaceSelectionWithBacklink: this.settings.deleteSelectionAfterLinkingReflection,
			entryPrefixTemplate: this.settings.reflectionEntryPrefixTemplate.replace(/\\n/g, "\n").replace(/\\t/g, "\t"),
			includeReflectionEntryDate: this.settings.includeReflectionEntryDate,
			entrySeparator: this.settings.reflectionEntrySeparator.replace(/\\n/g, "\n").replace(/\\t/g, "\t"),
			insertionMode: this.settings.reflectionInsertionMode,
			includeAyahTextInNote: this.settings.includeAyahTextInReflectionNote,
			fileNameTemplate: this.settings.reflectionFileNameTemplate,
			backlinkAliasTemplate: this.settings.reflectionBacklinkAliasTemplate,
			backlinkWrapTemplate: this.settings.reflectionBacklinkWrapTemplate,
			quoteFormattingOptions: getFormattingOptions(),
		});

		const rebuilt: AppServices = {
			app: this.app,
			settings: this.settings,
			repository: this.repository,
			ayahNotes,
			catalog,
			reflectionCatalog,
			normalizer,
			useCases: {
				search,
				analyzeContext,
				extract,
				extractAyahSections,
				fetchTafsir,
				removeReference,
				convertToFootnote,
				stripTashkeel,
				linkReflection,
				linkAyahsTogether,
			},
			buildTafsirOptions,
			buildReflectionOptions,
			wrapEditor: (editor: Editor) => new ObsidianEditorAdapter(editor),
			saveSettings: () => this.saveSettings(),
			registerReflectionCategoryCommand: (categoryId: string) => {
				registerCommands(this, [createLinkReflectionCommand(this.services, categoryId)]);
			},
			unregisterReflectionCategoryCommand: (categoryId: string) => {
				interface InternalApp {
					commands?: {
						removeCommand?: (id: string) => void;
					};
				}
				try {
					const commandId = `${this.manifest.id}:link-reflection-${categoryId}`;
					const internalApp = this.app as unknown as InternalApp;
					internalApp.commands?.removeCommand?.(commandId);
				} catch {
					// Degrading gracefully if unofficial API is unavailable
				}
			},
		};

		if (this.services) {
			Object.assign(this.services, rebuilt);
		} else {
			this.services = rebuilt;
		}
	}
}
