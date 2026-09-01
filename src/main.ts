import { Plugin } from "obsidian";
import type { Editor } from "obsidian";
import type { Extension } from "@codemirror/state";

import { DEFAULT_SETTINGS, migrateLegacySettings } from "./config/defaults";
import type { PluginConfig } from "./config/types";
import type { TafsirBook } from "./domain/entities/TafsirBook";
import type { ReflectionCategory } from "./domain/entities/ReflectionCategory";
import { ArabicNormalizer } from "./domain/services/ArabicNormalizer";
import { PhraseMatcher } from "./domain/services/PhraseMatcher";
import { FuzzyMatcher } from "./domain/services/FuzzyMatcher";
import { SlidingWindowSearch } from "./domain/services/SlidingWindowSearch";
import { SnippetExtractor } from "./domain/services/SnippetExtractor";
import { OrnateNumberConverter } from "./domain/services/OrnateNumberConverter";
import { VerseOutputFormatter, type FormattingOptions } from "./domain/services/VerseOutputFormatter";
import { TafsirCatalog } from "./domain/services/TafsirCatalog";
import { ReflectionCategoryCatalog } from "./domain/services/ReflectionCategoryCatalog";
import { ReflectionFileNameBuilder } from "./domain/services/ReflectionFileNameBuilder";
import { VerseReference } from "./domain/value-objects/VerseReference";

import { SearchQuranVerses } from "./application/use-cases/SearchQuranVerses";
import { AnalyzeLineContext } from "./application/use-cases/AnalyzeLineContext";
import { ExtractAndInsertVerse } from "./application/use-cases/ExtractAndInsertVerse";
import { ToggleSnippetView } from "./application/use-cases/ToggleSnippetView";
import { FetchAndInsertTafsir, type TafsirFormattingOptions } from "./application/use-cases/FetchAndInsertTafsir";
import { LinkReflectionToVerses, type ReflectionLinkOptions } from "./application/use-cases/LinkReflectionToVerses";
import { RemoveQuranReference } from "./application/use-cases/RemoveQuranReference";
import { ConvertReferenceToFootnote } from "./application/use-cases/ConvertReferenceToFootnote";
import { StripTashkeel } from "./application/use-cases/StripTashkeel";

import { ObsidianQuranRepository } from "./infrastructure/obsidian/ObsidianQuranRepository";
import { ObsidianEditorAdapter } from "./infrastructure/obsidian/ObsidianEditorAdapter";
import { ObsidianNoticeAdapter } from "./infrastructure/obsidian/ObsidianNoticeAdapter";
import { ObsidianReflectionFileRepository } from "./infrastructure/obsidian/ObsidianReflectionFileRepository";
import {
	applyStyleVariables,
	createMarkdownPostProcessor,
	createOrnateNumberHighlightExtension,
	createOrnateNumberPostProcessor,
	createQuranHighlightExtension,
} from "./infrastructure/obsidian/QuranHighlightExtension";
import { HttpTafsirRepository } from "./infrastructure/http/HttpTafsirRepository";
import { InMemoryInsertionMemento } from "./infrastructure/memory/InMemoryInsertionMemento";

import type { AppServices } from "./presentation/AppServices";
import { registerAllCommands } from "./presentation/commands/registerCommands";
import { QuranKeySettingsTab, type SettingsHost } from "./presentation/settings/QuranKeySettingsTab";

import builtinTafsirBooksData from "../data/tafsirBooks.json";
import builtinReflectionCategoriesData from "../data/reflectionCategories.json";

export default class QuranKeyPlugin extends Plugin implements SettingsHost {
	settings: PluginConfig = DEFAULT_SETTINGS;

	private repository!: ObsidianQuranRepository;
	private readonly tafsirRepository = new HttpTafsirRepository();
	private readonly notice = new ObsidianNoticeAdapter();
	private readonly memento = new InMemoryInsertionMemento();
	private styleEl!: HTMLStyleElement;
	/** Mutated in place (not reassigned) so registerEditorExtension's
	 *  reference stays valid — see refreshHighlightExtension(). */
	private readonly editorExtension: Extension[] = [];

	services!: AppServices;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.repository = new ObsidianQuranRepository(this.app.vault, new ArabicNormalizer(this.settings.normalizationRules));
		await this.repository.loadAll();

		this.initStyleSheet();
		this.rebuildCoreServices();
		this.refreshHighlightExtension();
		this.registerEditorExtension(this.editorExtension);

		this.registerMarkdownPostProcessor((el) => {
			createMarkdownPostProcessor(this.settings.wrapperStart, this.settings.wrapperEnd)(el);
			if (this.settings.styleOrnateNumbers) {
				createOrnateNumberPostProcessor(this.settings.ornateRingGlyph)(el);
			}
		});

		this.addSettingTab(new QuranKeySettingsTab(this.app, this, this.services));
		registerAllCommands(this, this.services);
	}

	onunload(): void {
		this.styleEl?.remove();
	}

	async loadSettings(): Promise<void> {
		const raw = migrateLegacySettings(await this.loadData());
		this.settings = Object.assign({}, DEFAULT_SETTINGS, raw);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		// Cheap (a handful of regex compiles + remapping the bundled demo
		// corpus) — always rebuilding on every save is simpler than tracking
		// exactly which fields are "structural"; see docs/ARCHITECTURE.md §2.
		this.rebuildCoreServices();
		this.refreshHighlightExtension();
		this.refreshStyles();
	}

	private initStyleSheet(): void {
		this.styleEl = document.createElement("style");
		this.styleEl.id = "quran-key-dynamic-styles";
		document.head.appendChild(this.styleEl);
		this.refreshStyles();
	}

	private refreshStyles(): void {
		applyStyleVariables(this.styleEl, this.settings);
	}

	/** CodeMirror extensions aren't mutable in place once constructed, but
	 *  Obsidian's `registerEditorExtension` keeps the *array reference* it
	 *  was given live — mutating this array's contents and calling
	 *  `workspace.updateOptions()` is the documented way to hot-swap a
	 *  registered extension (e.g. after the wrapper glyphs change). */
	private refreshHighlightExtension(): void {
		this.editorExtension.length = 0;
		this.editorExtension.push(createQuranHighlightExtension(this.settings.wrapperStart, this.settings.wrapperEnd));
		if (this.settings.styleOrnateNumbers) {
			this.editorExtension.push(createOrnateNumberHighlightExtension(this.settings.ornateRingGlyph));
		}
		this.app.workspace.updateOptions();
	}

	/** Rebuilds every service compiled from a setting (normalization
	 *  rules, the reference-format template, wrapper glyphs) so structural
	 *  changes take effect immediately — no plugin reload required. This
	 *  is the composition root; nothing outside this method calls `new`
	 *  on a concrete adapter or use case. */
	private rebuildCoreServices(): void {
		const normalizer = new ArabicNormalizer(this.settings.normalizationRules);
		this.repository = new ObsidianQuranRepository(this.app.vault, normalizer);
		void this.repository.loadAll(); // bundled data: effectively synchronous

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
		const ornateConverter = new OrnateNumberConverter(this.settings.ornateRingGlyph);
		const formatter = new VerseOutputFormatter(ornateConverter, reference, (text) => normalizer.stripTashkeel(text));
		const toggle = new ToggleSnippetView(snippetExtractor, formatter);

		const builtinBooks = builtinTafsirBooksData as unknown as TafsirBook[];
		const catalog = new TafsirCatalog(builtinBooks, this.settings.customTafsirBooks as unknown as TafsirBook[]);

		const builtinReflectionCategories = builtinReflectionCategoriesData as unknown as ReflectionCategory[];
		const reflectionCatalog = new ReflectionCategoryCatalog(
			builtinReflectionCategories,
			this.settings.customReflectionCategories as unknown as ReflectionCategory[]
		);
		const reflectionFileNameBuilder = new ReflectionFileNameBuilder(
			this.settings.reflectionFileNameTemplate,
			this.settings.reflectionFileNameAyahTextMaxLength
		);
		const reflectionFiles = new ObsidianReflectionFileRepository(this.app);

		const getFormattingOptions = (): FormattingOptions => ({
			wrapperStart: this.settings.wrapperStart,
			wrapperEnd: this.settings.wrapperEnd,
			useOrnateNumbers: this.settings.useOrnateNumbers,
			stripTashkeelOnOutput: this.settings.stripTashkeel,
		});

		const linkReflection = new LinkReflectionToVerses(
			this.repository,
			normalizer,
			reference,
			formatter,
			reflectionFileNameBuilder,
			reflectionFiles
		);

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
			getFormattingOptions
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
			deleteSelectionAfterLinking: this.settings.deleteSelectionAfterLinkingReflection,
			entryPrefixTemplate: this.settings.reflectionEntryPrefixTemplate,
			quoteFormattingOptions: getFormattingOptions(),
		});

		const rebuilt: AppServices = {
			app: this.app,
			settings: this.settings,
			repository: this.repository,
			catalog,
			reflectionCatalog,
			normalizer,
			useCases: {
				search,
				analyzeContext,
				extract,
				fetchTafsir,
				removeReference,
				convertToFootnote,
				stripTashkeel,
				linkReflection,
			},
			buildTafsirOptions,
			buildReflectionOptions,
			wrapEditor: (editor: Editor) => new ObsidianEditorAdapter(editor),
			saveSettings: () => this.saveSettings(),
		};

		// Mutate the existing object in place (rather than reassigning
		// this.services) once it exists, so anything holding a reference
		// to it from an earlier rebuild — commands captured once at
		// registerAllCommands() time, the settings tab, an open modal —
		// observes the rebuilt catalog/use-cases/settings immediately
		// instead of a stale snapshot from onload. Reassignment only
		// happens on the very first call, when there's nothing to mutate.
		if (this.services) {
			Object.assign(this.services, rebuilt);
		} else {
			this.services = rebuilt;
		}
	}
}

