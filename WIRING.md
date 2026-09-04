# Wiring these changes into `src/main.ts`

`main.ts` itself is mostly unchanged (still the single composition root —
see docs/ARCHITECTURE.md §2/§6). Rather than reproducing the whole file,
here are the exact edits `rebuildCoreServices()` and its imports need.

## Imports

Remove:
```ts
import { ObsidianReflectionFileRepository } from "./infrastructure/obsidian/ObsidianReflectionFileRepository";
```
Add:
```ts
import { ObsidianAyahNoteRepository } from "./infrastructure/obsidian/ObsidianAyahNoteRepository";
import { LinkAyahsTogether } from "./application/use-cases/LinkAyahsTogether";
```

## Repository construction

Replace:
```ts
const reflectionFiles = new ObsidianReflectionFileRepository(this.app);
```
with:
```ts
const ayahNotes = new ObsidianAyahNoteRepository(this.app, () => this.settings);
```
(`ReflectionFileNameBuilder` is still used, just internally by
`ObsidianAyahNoteRepository` now instead of being passed a pre-built
instance — you can drop the standalone `reflectionFileNameBuilder`
construction in `main.ts` too, it's unused elsewhere.)

## `LinkReflectionToVerses` construction

Replace:
```ts
const linkReflection = new LinkReflectionToVerses(
	this.repository,
	normalizer,
	reference,
	formatter,
	reflectionFileNameBuilder,
	reflectionFiles
);
```
with:
```ts
const linkReflection = new LinkReflectionToVerses(
	this.repository,
	normalizer,
	reference,
	formatter,
	reflectionCatalog,
	ayahNotes
);
const linkAyahsTogether = new LinkAyahsTogether(ayahNotes, formatter);
```

## `buildReflectionOptions`

Replace the whole function with:
```ts
const buildReflectionOptions = (): ReflectionLinkOptions => ({
	locale: this.settings.interfaceLanguage,
	replaceSelectionWithBacklink: this.settings.deleteSelectionAfterLinkingReflection,
	entryPrefixTemplate: this.settings.reflectionEntryPrefixTemplate,
	entrySeparator: this.settings.reflectionEntrySeparator,
	insertionMode: this.settings.reflectionInsertionMode,
	includeAyahTextInNote: this.settings.includeAyahTextInReflectionNote,
	fileNameTemplate: this.settings.reflectionFileNameTemplate,
	backlinkAliasTemplate: this.settings.reflectionBacklinkAliasTemplate,
	backlinkWrapTemplate: this.settings.reflectionBacklinkWrapTemplate,
	quoteFormattingOptions: getFormattingOptions(),
});
```

## `AppServices` object literal

Add `ayahNotes` alongside `repository`, and `linkAyahsTogether` alongside
`linkReflection` in the `useCases` object:
```ts
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
};
```

## Delete

`src/infrastructure/obsidian/ObsidianReflectionFileRepository.ts` and
`src/domain/ports/ReflectionFileRepository.ts` are superseded by
`ObsidianAyahNoteRepository.ts` / `AyahNoteRepository.ts` and can be
removed — nothing else references them after the edits above.

Nothing else in `main.ts` (styles, highlight extension, settings load/save,
`onload`/`onunload`) needs to change.
