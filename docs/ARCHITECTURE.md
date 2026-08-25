# Quran Key — Architecture

## 1. Methodology: Clean Architecture (Ports & Adapters)

We use **Clean/Hexagonal Architecture**: concentric layers with a single
dependency rule — *source code dependencies only point inward*. Domain
knows nothing about Obsidian; Obsidian knows about the domain through
narrow interfaces ("ports") that the domain defines and infrastructure
implements.

```
┌─────────────────────────────────────────────────────────────┐
│ presentation   (Modals, SettingsTab, Commands)               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ infrastructure (Obsidian adapters, HTTP tafsir client)  │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │ application (use cases — orchestration only)     │  │  │
│  │  │  ┌───────────────────────────────────────────┐  │  │  │
│  │  │  │ domain (entities, value objects, services, │  │  │  │
│  │  │  │         ports — pure TS, no Obsidian import)│  │  │  │
│  │  │  └───────────────────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Why this, for a ~15-command Obsidian plugin?** Because the two things the
user asked for — *customizability* and *room to grow* — are architectural
properties, not features. A hardcoded 42-book array can't become a
user-editable list until something in the code stops assuming "the
catalogue is this literal." That "something" is the dependency rule: once
`FetchAndInsertTafsir` (application) depends only on a `TafsirCatalog` port
it receives, the concrete catalogue is free to become JSON, then
Settings-editable JSON, without the use case changing at all.

Rejected alternatives:
- **MVC/MVP** — natural for the UI layer, but doesn't say anything about
  where normalization/formatting logic should live, which is where v1's
  actual pain was (hardcoded tables inside DOM-building code).
- **Flat "just organize main.ts into files"** — would satisfy "cleaner
  file layout" but not "customizable"; the coupling to Obsidian types is
  what made v1's tables hard to externalize in the first place.

## 2. Dependency rule in practice

- `src/domain/**` — **zero** imports from `obsidian`, `@codemirror/*`, or
  any infrastructure file. Pure functions/classes over plain data.
- `src/application/**` — orchestrates domain services via **ports**
  (interfaces) defined in `src/domain/ports`. Still zero Obsidian imports.
- `src/infrastructure/**` — implements the ports using real Obsidian APIs
  (`Editor`, `requestUrl`, `Vault`, CodeMirror `ViewPlugin`). This is the
  only layer allowed to import `obsidian`/`@codemirror/*` besides
  presentation.
- `src/presentation/**` — Modals, the Settings tab, and command
  definitions. Thin: builds UI, calls a use case, renders the result.
- `src/config/**` — typed settings schema, defaults, and the string table.
  Imported by every layer (it's data, not behavior).
- `src/main.ts` — the **composition root**. The only file that constructs
  concrete adapters and wires them into use cases. Nothing else does `new
  HttpTafsirRepository()` or similar.

## 3. Folder map

```
src/
  config/
    types.ts            PluginConfig interface (typed settings schema)
    defaults.ts          DEFAULT_SETTINGS
    strings.ts            UI string table (ar/en), keyed by component
  domain/
    entities/            Ayah, TafsirBook — plain data shapes
    value-objects/        VerseReference — parses/formats using the
                           *configurable* reference-format template (NFR-3)
    services/              pure logic: ArabicNormalizer, PatternBuilder,
                           SnippetExtractor, VerseOutputFormatter,
                           OrnateNumberConverter, AnalyticsCalculator
    ports/                interfaces: QuranRepository, TafsirRepository,
                           EditorPort, NoticePort, InsertionMemento
  application/
    use-cases/            one class per user-facing action (§5)
  infrastructure/
    obsidian/              ObsidianQuranRepository, ObsidianEditorAdapter,
                           ObsidianNoticeAdapter, QuranHighlightExtension
    http/                  HttpTafsirRepository (configurable base URL,
                           request template, rate limit)
    memory/                InMemoryInsertionMemento, InMemoryTafsirCache
  presentation/
    commands/              CommandRegistry + one file per command
    modals/                QuranSearchModal, RangeEndSuggestModal,
                           TafsirBookPickerModal
    components/             AnalyticsDashboard (DOM builder, CSS-var driven)
    settings/               declarative SettingsSchema + generic renderer
  main.ts                 composition root
data/
  tafsirBooks.json         the 42-book catalogue, now data (NFR-1)
  normalizationRules.json  the letter-substitution table, now data (NFR-2)
  ayahs.sample.json         5-ayah sample corpus + schema comment
```

## 4. Key patterns used, and why

| Pattern | Where | Solves |
|---|---|---|
| **Repository** | `QuranRepository`, `TafsirRepository` ports | Swap the corpus source (bundled JSON today, a vault file or plugin-to-plugin API tomorrow) or the tafsir source (HTTP today, local/offline tomorrow) without touching use cases. |
| **Strategy** | `ArabicNormalizer` rule pipeline, `tafsirBookResolutionOrder` | v1 had one fixed normalization function and one fixed book-resolution `if/else` chain. Both are now ordered lists of strategies that Settings can reorder/extend. |
| **Template Method (data-driven)** | `VerseReference` (reference format), `VerseOutputFormatter` (wrapper glyphs) | Replaces hardcoded `[`, `:`, `]`, `﴿`, `﴾` literals with a template string containing `{surah}`/`{verse}` placeholders, compiled once into a regex + a formatter. |
| **Registry** | `CommandRegistry`, `SettingsSchema` | Adding a command or a settings field is additive — append an entry — instead of editing a large imperative `onload()`/`display()`. |
| **Composition root** | `main.ts` | All `new ConcreteAdapter()` calls live in exactly one place, so every use case can be constructed in a test with fakes instead. |
| **Memento** | `InsertionMemento` port | Isolates the "toggle full ayah ↔ snippet on double-invoke" state (FR-9) from the editor adapter itself. |

## 5. Use case inventory (application layer)

Each maps 1:1 to a functional requirement group in `docs/REQUIREMENTS.md`:

- `SearchQuranVerses` — FR-16/17 (fuzzy search against the corpus)
- `AnalyzeLineContext` — FR-6/7/8 (read-only line analysis)
- `ExtractAndInsertVerse` — FR-9…15 (the main command, delegates ambiguity
  back to presentation via a callback parameter — the use case never
  imports a Modal type)
- `ToggleSnippetView` — FR-9 (isolated so it's independently testable)
- `FetchAndInsertTafsir` — FR-21…26
- `RemoveQuranReference` — FR-27
- `ConvertReferenceToFootnote` — FR-28
- `StripTashkeel` — FR-29

## 6. Hardcoded → configurable migration map

This is the concrete answer to "make it customizable": every row is a
place v1 had a literal, and where it lives now.

| v1 (hardcoded) | v2 location | Configurable via |
|---|---|---|
| `TAFSIR_BOOKS_LIST` inline array (42 entries) in `main.js` | `data/tafsirBooks.json` + user-added entries merged in `ObsidianSettingsStore` | Settings → "Custom tafsir sources" |
| `صلوة→صلاة` etc. substitution table inside `QuranText.normalizeForSearch` | `data/normalizationRules.json`, consumed by `ArabicNormalizer` | Settings → "Normalization rules" (advanced, collapsible) |
| `referenceFormat` setting declared but **never read** | `VerseReference.compile(settings.referenceFormat)` — actually drives the regex and the output string | Settings → "Reference format" (now functional) |
| `﴿ … ﴾` wrapper glyphs, hardcoded 4 places | `settings.wrapperStart` / `wrapperEnd`, single source read by formatter, CM decorator, and post-processor | Settings → "Verse wrapper glyphs" |
| `۝` ornate-number ring glyph, hardcoded | `settings.ornateRingGlyph` | Settings → "Ornate number style" |
| Sliding window cap `12` | `settings.maxSlidingWindowWords` | Settings → Advanced |
| Tafsir delay `150ms`, threshold `>2` | `settings.tafsirFetchDelayMs`, `settings.tafsirFetchDelayThreshold` | Settings → Advanced |
| Suggestion cap `.slice(0, 30)` (×2 modals) | `settings.maxSuggestionResults` | Settings → Advanced |
| Book resolution order fixed in code (`if aliases… else if favorites… else default`) | `settings.tafsirBookResolutionOrder: string[]` | Settings → Advanced (reorderable list) |
| Arabic-only UI strings inline in DOM builders | `src/config/strings.ts`, looked up by key | Settings → "Interface language" |
| `style.cssText = "...!important..."` in 5 components | `styles.css` classes + CSS custom properties written once in `applyStyleSettings()` | Settings → "Qur'anic text style" (unchanged UX, clean implementation) |

## 7. Testing strategy

Because `domain/**` and `application/**` never import `obsidian`, they run
under plain Vitest (see `tests/`). `tests/domain/ArabicNormalizer.spec.ts`
and `tests/domain/VerseOutputFormatter.spec.ts` are seeded examples;
`SnippetExtractor`, `AnalyzeLineContext`, and the tafsir book-resolution
strategy are the next highest-value additions. Infrastructure adapters are
thin enough to leave to manual testing in a real vault (per the Obsidian
skill: this sandbox can't run `npm install`/a real vault, so nothing here
has been compiled or executed — see `README.md` "Status").

## 8. Extension guides

**Add a tafsir source** (e.g. a local/offline corpus): implement
`TafsirRepository` (one method: `fetchTafsir(bookId, surahId, ayahId)`) in
`src/infrastructure/`, then in `main.ts` either replace or wrap
`HttpTafsirRepository` (e.g. a `CachingTafsirRepository` decorator that
tries local first, then HTTP). No use case or UI code changes.

**Add a command**: create `src/presentation/commands/definitions/myCommand.ts`
exporting a `CommandDefinition`, add it to the array in
`registerCommands.ts`. See §5 for which use case to call.

**Add a settings field**: add a typed field to `PluginConfig`
(`src/config/types.ts`), a default in `defaults.ts`, and an entry in
`SettingsSchema.ts`. The settings tab renders it automatically — no DOM
code required unless the field needs a bespoke control.

**Add a normalization rule**: append `{pattern, replacement}` to
`data/normalizationRules.json`, or let a user add one from Settings —
`ArabicNormalizer` compiles the list at load time.
