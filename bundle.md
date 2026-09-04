## ARCHITECTURE.md

```markdown
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

```

## REQUIREMENTS.md

```markdown
# Quran Key — Requirements Document (v2)

## 1. Purpose

Quran Key is an Obsidian plugin that lets a note-taker quote, style, and
annotate the Qur'an without leaving the editor: type a recognizable Arabic
phrase (or a `Surah:Ayah` reference) and the plugin resolves it against a
local Qur'an corpus, wraps it in Qur'anic styling, and can pull in tafsir
(commentary) from one or more sources.

This document re-specifies the **existing, shipped behavior** of v1 (reverse
engineered from `main.js`) as explicit requirements, then adds the
requirements that motivate the v2 rewrite: **customizability** and
**extensibility** without editing source code.

## 2. Goals

- **G1 — Behavioral parity.** Every user-facing capability of v1 keeps
  working in v2 (see §4 for the full inventory).
- **G2 — No hardcoded tunables.** Anything that was a literal, a magic
  number, or an inline array in v1 becomes a typed setting or a data file in
  v2 (see §5.1 and `docs/ARCHITECTURE.md` §6 for the full before/after map).
- **G3 — Testable core.** The text-normalization, extraction, and
  formatting logic must be unit-testable without an Obsidian runtime.
- **G4 — Extensible without forking.** Adding a tafsir source, a
  normalization rule, a command, or a settings section should not require
  touching unrelated files.
- **G5 — Theme-safe UI.** No `!important`, no inline `style.cssText`
  fighting the user's theme (per Obsidian community guidelines).

## 3. Non-goals

- Shipping a specific Qur'an text corpus (copyright/licensing is the
  operator's responsibility — v2 ships a 5-ayah sample and a documented JSON
  schema; drop in your own `ayahs.json`).
- Offline tafsir (v1 and v2 both fetch tafsir over HTTP; a local tafsir
  corpus is a documented future extension, see §7).
- Full internationalization of UI strings (v2 introduces the string table
  needed for it — see `src/config/strings.ts` — but only ships Arabic +
  English).

## 4. Functional requirements (inventory of v1 behavior, retained in v2)

### 4.1 Data & normalization
- FR-1: Load a bundled Qur'an corpus (`{surah_id, ayah_id, surah_name,
  text}[]`) once per session into memory.
- FR-2: Build a normalized "giant string" of the whole corpus for
  substring/sliding-window search.
- FR-3: Normalize Arabic text for matching: strip tashkeel; unify hamza
  forms (أ إ آ ٱ ء ى → ا), ya forms, waw+hamza, ta marbuta; unify common
  "يا أيها" spelling variants; apply a substitution table for short-alef
  spellings (e.g. صلوة → صلاة); collapse repeated alefs and whitespace.
- FR-4: Normalize Arabic-Indic and Extended Arabic-Indic (Persian) digits to
  Western digits when parsing ayah numbers.
- FR-5: Build a regex pattern per word that makes **medial alefs optional**,
  so both "رحمن" and "رحمان" spellings match the same word.

### 4.2 Context parsing (non-destructive line analysis)
- FR-6: Detect an explicit `[Surah:N]` / `[Surah:N-M]` reference on the
  current line.
- FR-7: Detect a loose `Surah N` / `Surah N-M` pattern (surah name up to 3
  words, then a colon or space, then a number or range).
- FR-8: Fall back to a **sliding window** search: mask any text already
  inside `﴿…﴾`, then try shrinking windows (12 words down to 2) against the
  normalized corpus to auto-detect an unmarked Qur'anic quote already on the
  line and identify which ayah it belongs to.

### 4.3 Extraction & insertion (primary "do the thing" command)
- FR-9: **Toggle/undo behavior** — if the previous insertion happened on
  this exact line and the cursor is still inside its `﴿…﴾` block, toggle
  between the full ayah and the last-typed snippet.
- FR-10: **Range shorthand** — `(word1-word2)` next to a `[Surah:N]`
  reference crops the ayah between those two words inclusive.
- FR-11: **Selection query** — a text selection is treated as a search
  query and replaced with the resolved, formatted ayah.
- FR-12: **Curly-brace query** — `{query}` on the line is treated the same
  way as a selection.
- FR-13: **Explicit reference resolution** — `Surah N[-M][, N2[-M2]…]`
  resolves one or more ayahs/ranges directly.
- FR-14: **Sliding-window auto-detect** — same algorithm as FR-8, but
  replaces the matched span in place with the wrapped + referenced verse.
- FR-15: **Ambiguity handling** — if a query matches more than one ayah,
  insert the first match and open a suggest modal (pre-filled with the
  query) so the user can pick a different one; the modal shows a live
  analytics dashboard of the match set.

### 4.4 Search modals
- FR-16: A global fuzzy search modal (not context-bound) with highlighted
  matches (tolerant of tashkeel/hamza variants).
- FR-17: `Enter` inserts the active/selected match.
- FR-18: `Shift+Enter` or `Ctrl/Cmd+Enter` opens a **range-end modal**
  scoped to the same surah, to insert a multi-ayah range.
- FR-19: The range-end modal can also hand off directly into tafsir
  fetching for the resulting range (via the book picker).
- FR-20: An optional live analytics dashboard (toggle in settings) shows:
  total matches, the most-quoted surah (count + density%), and the
  highest-density surah, updated as the user types.

### 4.5 Tafsir
- FR-21: A catalogue of tafsir books (id, display name, search aliases),
  browsable/searchable/multi-selectable in a dedicated picker modal.
- FR-22: Fetch commentary per `(book, surah, ayah)` over HTTP, with an
  in-memory cache so repeat lookups don't re-hit the network.
- FR-23: **Book resolution precedence** when no explicit picker choice is
  made: (1) aliases mentioned in the current line's text, (2) the user's
  favorite books, (3) a single default book.
- FR-24: For a surah + ayah range: optionally prepend each ayah's own text
  before its commentary; insert a small delay between requests when the
  range is long, to be polite to the API.
- FR-25: Render output as a heading (configurable level) per book, with
  commentary reformatted into blockquoted paragraphs, and an optional
  divider between multiple books' output.
- FR-26: Two entry points: "fetch tafsir for the current line" (runs
  context parsing first) and a "global" flow (search modal → book picker).

### 4.6 Editing utilities
- FR-27: Remove an existing `[Surah:N-M]` reference from the current line.
- FR-28: Convert a `[Surah:N-M]` reference into an auto-numbered Markdown
  footnote appended at the end of the note.
- FR-29: Strip tashkeel diacritics from the current selection, or the whole
  line if nothing is selected.

### 4.7 Rendering
- FR-30: Any `﴿…﴾`-wrapped span gets dedicated styling (font family, size,
  line height, accent color — all user-configurable) in both Live Preview
  (CodeMirror6 decoration) and Reading view (markdown post-processor).

### 4.8 Settings
- FR-31: All of the following are user-configurable: strip-tashkeel
  default, ornate-number formatting, reference format, analytics dashboard
  visibility, default tafsir book, favorite tafsir books, heading levels
  (range + book), "include ayah text in tafsir", horizontal-divider
  between books, and the Qur'anic-text style group (font, size, line
  height, color).

## 5. New requirements for v2

### 5.1 Customizability (no source edits required)
- NFR-1: The tafsir catalogue is **data**, not code — users can add a
  custom book (id, name, aliases, and its own URL template) from Settings.
- NFR-2: The Arabic normalization substitution table is **data** — users
  can add/remove letter-substitution rules from Settings without a rebuild.
- NFR-3: `referenceFormat` must actually drive parsing and formatting (v1
  declared this setting but never consulted it — every regex was
  hardcoded to `[Surah:Verse]`). Changing the format in Settings changes
  both what the plugin recognizes on a line and what it writes.
- NFR-4: The wrapper glyphs (`﴿ ﴾`) and ornate-ring glyph (`۝`) are
  settings, not string literals scattered across formatter, decorator, and
  post-processor.
- NFR-5: Every magic number in v1 (12-word sliding window cap, 150 ms
  tafsir delay, ">2 ayahs" delay threshold, 30-item suggestion cap) is a
  named, documented setting with a sane default.
- NFR-6: The tafsir book-resolution precedence (FR-23) is itself an
  ordered, editable list, not fixed logic.

### 5.2 Architecture
- NFR-7: Core logic (normalization, extraction, formatting, analytics) has
  zero import-time dependency on the `obsidian` package, so it is
  unit-testable in plain Node/Vitest.
- NFR-8: Obsidian-specific code (Editor, Modal, requestUrl, CodeMirror) is
  isolated behind interfaces ("ports") in `src/domain/ports`, implemented
  once in `src/infrastructure`.
- NFR-9: Commands and settings sections are self-registering so a new
  feature is additive (new file + one registration line), not a change to
  a monolithic `onload()`/`display()`.

### 5.3 UI hygiene
- NFR-10: No `!important` in CSS; all plugin styling scoped under
  `.quran-key-*` classes and driven by CSS custom properties that Settings
  writes at runtime (see `styles.css`, `QuranHighlightExtension.ts`).

## 6. Constraints

- Must run on desktop **and** mobile (`isDesktopOnly: false`) → no Node
  `fs`/`path`/`child_process`; corpus and catalogues ship as bundled JSON,
  not files read from disk.
- Must use `this.app.vault` / `requestUrl` (Obsidian's fetch wrapper, which
  works on mobile where raw `fetch` to arbitrary origins may not).
- All registrations (`registerEvent`, `registerEditorExtension`,
  `addCommand`) must be reversible in `onunload()`.

## 7. Deferred / future work (explicitly out of scope for this pass)

- Localized UI strings beyond ar/en (the string-table seam exists; content
  doesn't yet).
- A local/offline tafsir data source implementing the same
  `TafsirRepository` port as the HTTP one (architecture supports it, see
  `docs/ARCHITECTURE.md` §8).
- A sidebar `ItemView` for browsing the corpus outside the editor.

## 8. Traceability

Every FR/NFR above maps to a specific module — see the table in
`docs/ARCHITECTURE.md` §6 rather than duplicating it here.

```

## application\use-cases\AnalyzeLineContext.ts

```typescript
import type { EditorPort } from "../../domain/ports/EditorPort";
import type { QuranRepository } from "../../domain/ports/QuranRepository";
import type { CompiledVerseReference } from "../../domain/value-objects/VerseReference";
import { ArabicNormalizer } from "../../domain/services/ArabicNormalizer";
import { SlidingWindowSearch } from "../../domain/services/SlidingWindowSearch";

export interface LineContext {
	surahId: number;
	surahName: string;
	startAyah: number;
	endAyah: number;
}

/** Loose "Surah N[-M]" prose pattern — independent of the configured
 *  bracket reference format, this recognizes plain mentions like
 *  "البقرة 255" or "البقرة: 255-257" (FR-7). */
const LOOSE_RANGE_REGEX = /(?:^|\s)([\u0600-\u06FF]+(?:\s+[\u0600-\u06FF]+){0,2})\s*[:\s]\s*(\d+(?:\s*-\s*\d+)?)/;

/** Read-only line analysis (FR-6/7/8): figure out which ayah(s) the
 *  cursor is near without mutating the editor. Used both by the extract
 *  command's context-parsing entry points and by the "fetch tafsir for
 *  current line" command. */
export class AnalyzeLineContext {
	constructor(
		private readonly repository: QuranRepository,
		private readonly normalizer: ArabicNormalizer,
		private readonly reference: CompiledVerseReference,
		private readonly slidingWindow: SlidingWindowSearch
	) {}

	execute(editor: EditorPort): LineContext | null {
		const cursor = editor.getCursor();
		const currentLine = editor.getLine(cursor.line);
		if (!currentLine || currentLine.trim() === "") return null;

		const explicit = this.reference.find(currentLine);
		if (explicit) {
			const surah = this.repository.findSurahByName(this.normalizer.normalizeForSearch(explicit.surahName));
			if (surah) {
				return {
					surahId: surah.id,
					surahName: surah.name,
					startAyah: explicit.startAyah,
					endAyah: explicit.endAyah,
				};
			}
		}

		const loose = currentLine.match(LOOSE_RANGE_REGEX);
		if (loose) {
			const surah = this.repository.findSurahByName(this.normalizer.normalizeForSearch(loose[1]));
			if (surah) {
				const parts = loose[2].split("-");
				const start = parseInt(ArabicNormalizer.normalizeNumbers(parts[0].trim()), 10);
				const end = parts[1] ? parseInt(ArabicNormalizer.normalizeNumbers(parts[1].trim()), 10) : start;
				return { surahId: surah.id, surahName: surah.name, startAyah: start, endAyah: end };
			}
		}

		const slid = this.slidingWindow.find(currentLine, this.repository.getAllAyahs(), this.repository.getSearchCorpusText());
		if (slid && slid.ayahs.length > 0) {
			const target = slid.ayahs[0];
			return {
				surahId: target.surahId,
				surahName: target.surahName,
				startAyah: target.ayahId,
				endAyah: target.ayahId,
			};
		}

		return null;
	}
}

```

## application\use-cases\ConvertReferenceToFootnote.ts

```typescript
import type { EditorPort, EditorPosition } from "../../domain/ports/EditorPort";
import type { CompiledVerseReference } from "../../domain/value-objects/VerseReference";

/** FR-28: replace a reference on the current line with an auto-numbered
 *  Markdown footnote marker, appending the reference itself as the
 *  footnote body at the end of the note. */
export class ConvertReferenceToFootnote {
	constructor(private readonly reference: CompiledVerseReference) {}

	execute(editor: EditorPort): void {
		const lineNum = editor.getCursor().line;
		const lineText = editor.getLine(lineNum);
		const match = this.reference.find(lineText);
		if (!match) return;

		const fullContent = editor.getValue();
		const existingFootnotes = fullContent.match(/\[\^quran\d+\]/g);
		const nextIndex = existingFootnotes ? existingFootnotes.length + 1 : 1;
		const footnoteTag = `[^quran${nextIndex}]`;

		const updatedLine = lineText.slice(0, match.index) + footnoteTag + lineText.slice(match.index + match.matchText.length);
		editor.setLine(lineNum, updatedLine);

		const lastLineNum = editor.lineCount() - 1;
		const lastLineText = editor.getLine(lastLineNum);
		const footerPos: EditorPosition = { line: lastLineNum, ch: lastLineText.length };
		editor.replaceRange(`\n\n${footnoteTag}: ${match.matchText}`, footerPos, footerPos);
	}
}
```

## application\use-cases\ExtractAndInsertVerse.ts

```typescript
import type { Ayah } from "../../domain/entities/Ayah";
import type { EditorPort, EditorPosition } from "../../domain/ports/EditorPort";
import type { InsertionMementoStore } from "../../domain/ports/InsertionMemento";
import type { QuranRepository } from "../../domain/ports/QuranRepository";
import type { CompiledVerseReference } from "../../domain/value-objects/VerseReference";
import { ArabicNormalizer } from "../../domain/services/ArabicNormalizer";
import { PhraseMatcher } from "../../domain/services/PhraseMatcher";
import { SlidingWindowSearch } from "../../domain/services/SlidingWindowSearch";
import { SnippetExtractor } from "../../domain/services/SnippetExtractor";
import type { FormattingOptions, VerseOutputFormatter } from "../../domain/services/VerseOutputFormatter";
import { ToggleSnippetView } from "./ToggleSnippetView";

export type AmbiguityHandler = (
	query: string,
	matches: Ayah[],
	startPos: EditorPosition,
	endPos: EditorPosition
) => void;

/** Matches "(word1-word2)" range shorthand — deliberately permissive about
 *  what's inside the parens; SnippetExtractor.extractRange does the real
 *  word-matching work and simply falls back to "no crop" if it can't. */
const RANGE_SHORTHAND_REGEX = /\(([^)]+?-[^)]+?)\)/g;

const EXPLICIT_RESOLUTION_REGEX =
	/(?:^|\s)([\u0600-\u06FF]+(?:\s+[\u0600-\u06FF]+){0,2})\s*[:\s]\s*(\d+(?:\s*-\s*\d+)?(?:\s*[,\u060C]\s*\d+(?:\s*-\s*\d+)?)*)/g;

/**
 * The plugin's primary "do the thing" command (FR-9..15). Tries, in
 * order: toggle full<->snippet, range shorthand next to a reference, a
 * text selection as a query, a {query} shorthand, an explicit
 * "Surah N[-M][, N2[-M2]]" resolution, then a sliding-window auto-detect
 * fallback. Ambiguous query matches are handed to `onAmbiguity` (a
 * presentation-layer callback) rather than this use case importing a
 * Modal type — keeps application code Obsidian-free (NFR-7).
 */
export class ExtractAndInsertVerse {
	constructor(
		private readonly repository: QuranRepository,
		private readonly normalizer: ArabicNormalizer,
		private readonly phraseMatcher: PhraseMatcher,
		private readonly slidingWindow: SlidingWindowSearch,
		private readonly snippetExtractor: SnippetExtractor,
		private readonly formatter: VerseOutputFormatter,
		private readonly reference: CompiledVerseReference,
		private readonly memento: InsertionMementoStore,
		private readonly toggle: ToggleSnippetView,
		private readonly wrapperStart: string,
		private readonly wrapperEnd: string,
		private readonly getFormattingOptions: () => FormattingOptions
	) {}

	execute(editor: EditorPort, onAmbiguity: AmbiguityHandler): boolean {
		const cursor = editor.getCursor();
		const currentLine = editor.getLine(cursor.line);

		// FR-9
		const last = this.memento.get();
		if (last) {
			const toggled = this.toggle.attempt(
				last,
				currentLine,
				cursor.line,
				this.wrapperStart,
				this.wrapperEnd,
				this.getFormattingOptions()
			);
			if (toggled) {
				editor.setLine(cursor.line, toggled.output);
				this.memento.set(toggled.nextMemento);
				return true;
			}
		}

		// FR-10
		let parenMatch: RegExpExecArray | null;
		RANGE_SHORTHAND_REGEX.lastIndex = 0;
		while ((parenMatch = RANGE_SHORTHAND_REGEX.exec(currentLine)) !== null) {
			const startCh = parenMatch.index;
			const endCh = parenMatch.index + parenMatch[0].length;
			if (cursor.ch < startCh || cursor.ch > endCh) continue;

			const refMatch = this.reference.find(currentLine);
			if (!refMatch) continue;
			const surah = this.repository.findSurahByName(this.normalizer.normalizeForSearch(refMatch.surahName));
			if (!surah) continue;
			const actualAyah = this.repository.findAyah(surah.id, refMatch.startAyah);
			if (!actualAyah) continue;

			const parts = parenMatch[1].split("-");
			const cropped = this.snippetExtractor.extractRange(actualAyah.text, parts[0].trim(), parts[1]?.trim() ?? "");
			if (cropped && cropped !== actualAyah.text) {
				const dummy: Ayah = { ...actualAyah, text: cropped };
				editor.setLine(cursor.line, this.formatter.format([dummy], this.getFormattingOptions()));
				return true;
			}
		}

		// FR-11
		const selectedText = editor.getSelection().trim();
		if (selectedText.length > 0) {
			return this.resolveTextQuery(editor, selectedText, editor.getCursor("from"), editor.getCursor("to"), onAmbiguity);
		}

		// FR-12
		const curlyMatch = currentLine.match(/\{([^}]+)\}/);
		if (curlyMatch) {
			const fullCurly = curlyMatch[0];
			const innerText = curlyMatch[1].trim();
			const start: EditorPosition = { line: cursor.line, ch: currentLine.indexOf(fullCurly) };
			const end: EditorPosition = { line: cursor.line, ch: start.ch + fullCurly.length };
			return this.resolveTextQuery(editor, innerText, start, end, onAmbiguity);
		}

		if (currentLine.trim().length === 0) return false;

		// FR-13
		EXPLICIT_RESOLUTION_REGEX.lastIndex = 0;
		let match: RegExpExecArray | null;
		while ((match = EXPLICIT_RESOLUTION_REGEX.exec(currentLine)) !== null) {
			const surah = this.repository.findSurahByName(this.normalizer.normalizeForSearch(match[1]));
			if (!surah) continue;
			const trimmedMatch = match[0].trim();
			const start: EditorPosition = { line: cursor.line, ch: currentLine.indexOf(trimmedMatch) };
			const end: EditorPosition = { line: cursor.line, ch: start.ch + trimmedMatch.length };
			const targetIds = this.parseVerseNumbers(match[2]);
			const matched = this.repository.getAllAyahs().filter((a) => a.surahId === surah.id && targetIds.includes(a.ayahId));
			if (matched.length > 0) {
				this.insert(editor, start, end, matched, "");
				return true;
			}
		}

		// FR-14
		return this.executeSlidingWindow(editor, currentLine, cursor.line, onAmbiguity);
	}

	private resolveTextQuery(
		editor: EditorPort,
		query: string,
		start: EditorPosition,
		end: EditorPosition,
		onAmbiguity: AmbiguityHandler
	): boolean {
		const matches = this.phraseMatcher.findMatches(query, this.repository.getAllAyahs());
		if (matches.length === 1) {
			this.insert(editor, start, end, [matches[0]], query);
			return true;
		}
		if (matches.length > 1) {
			this.insert(editor, start, end, [matches[0]], query);
			const newEnd: EditorPosition = {
				line: start.line,
				ch: start.ch + this.formatter.format([matches[0]], this.getFormattingOptions()).length,
			};
			onAmbiguity(query, matches, start, newEnd); // FR-15
			return true;
		}
		return false;
	}

	private executeSlidingWindow(
		editor: EditorPort,
		lineText: string,
		lineIdx: number,
		onAmbiguity: AmbiguityHandler
	): boolean {
		const slid = this.slidingWindow.find(lineText, this.repository.getAllAyahs(), this.repository.getSearchCorpusText());
		if (!slid) return false;
		const matchChIndex = lineText.indexOf(slid.segment);
		if (matchChIndex === -1) return false;

		const start: EditorPosition = { line: lineIdx, ch: matchChIndex };
		const end: EditorPosition = { line: lineIdx, ch: matchChIndex + slid.segment.length };

		if (slid.ayahs.length === 1) {
			this.insert(editor, start, end, [slid.ayahs[0]], slid.segment);
		} else {
			this.insert(editor, start, end, [slid.ayahs[0]], slid.segment);
			const newEnd: EditorPosition = {
				line: start.line,
				ch: start.ch + this.formatter.format([slid.ayahs[0]], this.getFormattingOptions()).length,
			};
			onAmbiguity(slid.segment, slid.ayahs, start, newEnd);
		}
		return true;
	}

	/** Public so presentation code (the search/range-end modals) can reuse
	 *  the exact same insert-and-remember-for-toggle behavior as the
	 *  extract command itself, instead of duplicating it. */
	insertAyahs(editor: EditorPort, start: EditorPosition, end: EditorPosition, ayahs: Ayah[], query: string): string {
		const output = this.formatter.format(ayahs, this.getFormattingOptions());
		editor.replaceRange(output, start, end);
		this.memento.set({ line: start.line, query, ayahs, isSnippet: false });
		return output;
	}

	private insert(editor: EditorPort, start: EditorPosition, end: EditorPosition, ayahs: Ayah[], query: string): void {
		this.insertAyahs(editor, start, end, ayahs, query);
	}

	private parseVerseNumbers(rangeStr: string): number[] {
		const parts = rangeStr.split(/[,\u060C]/);
		const ids: number[] = [];
		for (const rawPart of parts) {
			const part = rawPart.trim();
			if (part.includes("-")) {
				const [a, b] = part.split("-");
				const startN = parseInt(ArabicNormalizer.normalizeNumbers(a.trim()), 10);
				const endN = parseInt(ArabicNormalizer.normalizeNumbers(b.trim()), 10);
				for (let id = startN; id <= endN; id++) ids.push(id);
			} else {
				const id = parseInt(ArabicNormalizer.normalizeNumbers(part), 10);
				if (!isNaN(id)) ids.push(id);
			}
		}
		return Array.from(new Set(ids)).sort((a, b) => a - b);
	}
}

```

## application\use-cases\FetchAndInsertTafsir.ts

```typescript
import type { TafsirBook } from "../../domain/entities/TafsirBook";
import type { EditorPort, EditorPosition } from "../../domain/ports/EditorPort";
import type { NoticePort } from "../../domain/ports/NoticePort";
import type { QuranRepository } from "../../domain/ports/QuranRepository";
import type { TafsirRepository } from "../../domain/ports/TafsirRepository";
import type { TafsirCatalog } from "../../domain/services/TafsirCatalog";
import type { HeadingLevel, Locale, TafsirResolutionStrategy } from "../../config/types";
import { t } from "../../config/strings";

export interface TafsirFormattingOptions {
	locale: Locale;
	wrapperStart: string;
	wrapperEnd: string;
	includeAyahText: boolean;
	useHorizontalDivider: boolean;
	rangeHeadingLevel: HeadingLevel;
	bookHeadingLevel: HeadingLevel;
	fetchDelayMs: number;
	fetchDelayThreshold: number;
	resolutionOrder: readonly TafsirResolutionStrategy[];
	favoriteBookIds: readonly string[];
	defaultBookId: string;
}

export class FetchAndInsertTafsir {
	constructor(
		private readonly quranRepository: QuranRepository,
		private readonly tafsirRepository: TafsirRepository,
		private readonly catalog: TafsirCatalog,
		private readonly notice: NoticePort
	) {}

	resolveBooks(explicitBooks: TafsirBook[] | null, lineText: string, options: TafsirFormattingOptions): TafsirBook[] {
		for (const strategy of options.resolutionOrder) {
			switch (strategy) {
				case "explicit":
					if (explicitBooks && explicitBooks.length > 0) return explicitBooks;
					break;
				case "lineAliases": {
					const mentioned = this.catalog.findMentionedIn(lineText);
					if (mentioned.length > 0) return mentioned;
					break;
				}
				case "favorites": {
					const favorites = this.catalog.byIds(options.favoriteBookIds);
					if (favorites.length > 0) return favorites;
					break;
				}
				case "default": {
					const def = this.catalog.byId(options.defaultBookId);
					if (def) return [def];
					break;
				}
			}
		}
		return [];
	}

	async execute(
		editor: EditorPort,
		lineText: string,
		lineNum: number,
		surahId: number,
		surahName: string,
		startAyah: number,
		endAyah: number,
		options: TafsirFormattingOptions,
		explicitBooks: TafsirBook[] | null = null
	): Promise<boolean> {
		const selectedBooks = this.resolveBooks(explicitBooks, lineText, options);
		if (selectedBooks.length === 0) return false;

		const ayahRange = Array.from({ length: endAyah - startAyah + 1 }, (_, i) => startAyah + i);
		let finalOutput = `${options.rangeHeadingLevel} ${t(options.locale, "tafsir.rangeHeading", {
			surah: surahName,
			start: startAyah,
			end: endAyah,
		})}\n\n`;

		try {
			for (let bIdx = 0; bIdx < selectedBooks.length; bIdx++) {
				const book = selectedBooks[bIdx];
				let combinedBookText = "";
				for (const ayahId of ayahRange) {
					if (options.includeAyahText) {
						const local = this.quranRepository.findAyah(surahId, ayahId);
						if (local) {
							combinedBookText += `${options.wrapperStart} ${local.text} ${options.wrapperEnd} (${ayahId})\n\n`;
						}
					}
					if (ayahRange.length > options.fetchDelayThreshold) {
						await new Promise((resolve) => window.setTimeout(resolve, options.fetchDelayMs));
					}
					const rawContent = await this.tafsirRepository.fetchTafsir(book, surahId, ayahId);
					if (rawContent && rawContent.trim() !== "") {
						combinedBookText +=
							ayahRange.length > 1
								? `${t(options.locale, "tafsir.ayahHeadingLabel", { ayah: ayahId })}\n${rawContent}\n\n`
								: `${rawContent}\n\n`;
					}
				}
				finalOutput += formatBookContent(book.name, combinedBookText, options.bookHeadingLevel, options.locale);
				if (options.useHorizontalDivider && bIdx < selectedBooks.length - 1) {
					finalOutput += "---\n\n";
				}
			}

			const start: EditorPosition = { line: lineNum, ch: 0 };
			const end: EditorPosition = { line: lineNum, ch: lineText ? lineText.length : 0 };
			editor.replaceRange(finalOutput.trim() + "\n", start, end);
			return true;
		} catch {
			this.notice.show(t(options.locale, "tafsir.fetchFailed"));
			return false;
		}
	}
}

function formatBookContent(bookName: string, textContent: string, bookHeadingLevel: HeadingLevel, locale: Locale): string {
	if (!textContent || textContent.trim() === "") {
		return `${bookHeadingLevel} ${bookName}\n\n> ${t(locale, "tafsir.emptyBook")}\n\n`;
	}
	let cleanText = textContent
		.replace(/\[\[(.*?)\]\]/g, "($1)")
		.replace(/==/g, "")
		.replace(/_/g, "")
		.replace(/^-{3,}/gm, "");
	cleanText = cleanText.replace(/(?:\s*\*){2,}/g, " ");
	cleanText = cleanText.replace(/\*/g, "\u2055");

	const paragraphs = cleanText
		.split(/\n+/)
		.map((line) => line.trim())
		.filter((line) => line !== "")
		.map((line) => `> ${line}`);

	return `${bookHeadingLevel} ${bookName}\n\n${paragraphs.join("\n>\n")}\n\n`;
}
```

## application\use-cases\LinkAyahsTogether.ts

```typescript
import type { Ayah } from "../../domain/entities/Ayah";
import type { AyahNoteRepository } from "../../domain/ports/AyahNoteRepository";
import type { FormattingOptions, VerseOutputFormatter } from "../../domain/services/VerseOutputFormatter";

/**
 * Backs the "link ayat" command (e.g. البقرة 155 <-> هود 7 <-> الملك 2,
 * every one of which contains "ليبلوكم أيكم أحسن عملا"): the user picks
 * 2+ ayahs in a modal, and every one of their unified notes ends up with
 * the others listed in its `relatedAyat` frontmatter.
 *
 * No "reason/description" field by design (kept deliberately simple) —
 * just the links. Merge is a union (see AyahNoteRepository.linkRelatedAyat
 * and the architecture discussion this was designed in): linking a new
 * ayah into an existing group never drops links already recorded from a
 * previous linking session.
 */
export class LinkAyahsTogether {
	constructor(
		private readonly ayahNotes: AyahNoteRepository,
		private readonly formatter: VerseOutputFormatter
	) {}

	async execute(
		ayahs: readonly Ayah[],
		fileNameTemplate: string,
		includeAyahText: boolean,
		quoteFormatting: FormattingOptions
	): Promise<void> {
		if (ayahs.length < 2) return; // nothing to link

		const identities = ayahs.map((a) => ({
			surahId: a.surahId,
			surahName: a.surahName,
			ayahId: a.ayahId,
			ayahTextRaw: a.text,
			ayahTextBodyFormatted: this.formatter.format([a], quoteFormatting),
		}));

		// Resolve (creating if needed) every note's title up front, so
		// linking is symmetric even when some of these ayahs have never
		// had a note before.
		const titles = await Promise.all(
			identities.map((id) => this.ayahNotes.resolveUnifiedNoteTitle(id, fileNameTemplate, includeAyahText, true))
		);

		for (let i = 0; i < identities.length; i++) {
			const others = titles.filter((_, j) => j !== i).filter((title): title is string => title !== null);
			if (others.length === 0) continue;
			await this.ayahNotes.linkRelatedAyat(identities[i], fileNameTemplate, includeAyahText, others);
		}
	}
}

```

## application\use-cases\LinkReflectionToVerses.ts

```typescript
import type { Ayah } from "../../domain/entities/Ayah";
import type { ReflectionCategory } from "../../domain/entities/ReflectionCategory";
import type { EditorPort, EditorPosition } from "../../domain/ports/EditorPort";
import type { AyahNoteRepository } from "../../domain/ports/AyahNoteRepository";
import type { QuranRepository } from "../../domain/ports/QuranRepository";
import type { CompiledVerseReference } from "../../domain/value-objects/VerseReference";
import type { ArabicNormalizer } from "../../domain/services/ArabicNormalizer";
import type { ReflectionCategoryCatalog } from "../../domain/services/ReflectionCategoryCatalog";
import type { FormattingOptions, VerseOutputFormatter } from "../../domain/services/VerseOutputFormatter";
import type { Locale, ReflectionInsertionMode } from "../../config/types";
import { t } from "../../config/strings";

export interface ReflectionLinkOptions {
	locale: Locale;
	/** true (default): the logged selection is replaced in its source
	 *  note with a backlink to the ayah note. false: the selection is
	 *  left completely untouched (a copy). Never silently erased to "". */
	replaceSelectionWithBacklink: boolean;
	entryPrefixTemplate: string;
	entrySeparator: string;
	insertionMode: ReflectionInsertionMode;
	includeAyahTextInNote: boolean;
	fileNameTemplate: string;
	backlinkAliasTemplate: string;
	backlinkWrapTemplate: string;
	/** Reused both for the >1-ayah "quoted passage" in a range notice and
	 *  for the single-ayah body quote written into a fresh unified note. */
	quoteFormattingOptions: FormattingOptions;
}

export interface DetectedCitation {
	surahId: number;
	surahName: string;
	startAyah: number;
	endAyah: number;
}

function formatDateISO(date: Date): string {
	const y = date.getFullYear();
	const m = (date.getMonth() + 1 < 10 ? "0" : "") + (date.getMonth() + 1);
	const d = (date.getDate() < 10 ? "0" : "") + date.getDate();
	return `${y}-${m}-${d}`;
}

export class LinkReflectionToVerses {
	constructor(
		private readonly repository: QuranRepository,
		private readonly normalizer: ArabicNormalizer,
		private readonly reference: CompiledVerseReference,
		private readonly formatter: VerseOutputFormatter,
		private readonly catalog: ReflectionCategoryCatalog,
		private readonly ayahNotes: AyahNoteRepository
	) {}

	detectExistingCitation(text: string): DetectedCitation | null {
		const match = this.reference.find(text);
		if (!match) return null;
		const surah = this.repository.findSurahByName(this.normalizer.normalizeForSearch(match.surahName));
		if (!surah) return null;
		return { surahId: surah.id, surahName: surah.name, startAyah: match.startAyah, endAyah: match.endAyah };
	}

	async execute(
		editor: EditorPort,
		selectionStart: EditorPosition,
		selectionEnd: EditorPosition,
		reflectionText: string,
		category: ReflectionCategory,
		surahId: number,
		surahName: string,
		startAyah: number,
		endAyah: number,
		options: ReflectionLinkOptions
	): Promise<void> {
		const isRange = endAyah > startAyah;
		const quotedPassage = isRange ? this.buildQuotedPassage(surahId, startAyah, endAyah, options.quoteFormattingOptions) : null;
		const entryMarkdown = this.buildEntryMarkdown(
			reflectionText,
			category.name,
			isRange,
			startAyah,
			endAyah,
			quotedPassage,
			options.entryPrefixTemplate,
			options.locale
		);

		const ancestorChain = this.catalog.ancestorChain(category.id);
		const chain = ancestorChain.length > 0 ? ancestorChain : [category];

		let firstNoteTitle: string | null = null;
		for (let ayahId = startAyah; ayahId <= endAyah; ayahId++) {
			const ayah = this.repository.findAyah(surahId, ayahId);
			const ref = await this.ayahNotes.appendEntry(
				this.buildIdentity(surahId, surahName, ayahId, ayah, options.quoteFormattingOptions),
				chain,
				entryMarkdown,
				{
					insertionMode: options.insertionMode,
					entrySeparator: options.entrySeparator,
					includeAyahText: options.includeAyahTextInNote,
					fileNameTemplate: options.fileNameTemplate,
				}
			);
			if (firstNoteTitle === null) firstNoteTitle = ref.title;
		}

		if (options.replaceSelectionWithBacklink && firstNoteTitle !== null) {
			const backlink = this.renderBacklink(firstNoteTitle, surahName, startAyah, reflectionText, options);
			editor.replaceRange(backlink, selectionStart, selectionEnd);
		}
		// else: replaceSelectionWithBacklink is false -> leave the selection untouched (a true copy).
	}

	private buildIdentity(surahId: number, surahName: string, ayahId: number, ayah: Ayah | null, quoteFormatting: FormattingOptions) {
		const rawText = ayah?.text ?? "";
		return {
			surahId,
			surahName,
			ayahId,
			ayahTextRaw: rawText,
			ayahTextBodyFormatted: ayah ? this.formatter.format([ayah], quoteFormatting) : "",
		};
	}

	private renderBacklink(noteTitle: string, surahName: string, ayahId: number, ayahText: string, options: ReflectionLinkOptions): string {
		const alias = options.backlinkAliasTemplate
			? options.backlinkAliasTemplate
					.split("{surah}")
					.join(surahName)
					.split("{verse}")
					.join(String(ayahId))
					.split("{ayahText}")
					.join(ayahText)
			: "";
		const link = alias ? `[[${noteTitle}|${alias}]]` : `[[${noteTitle}]]`;
		return options.backlinkWrapTemplate.split("{link}").join(link);
	}

	private buildQuotedPassage(surahId: number, startAyah: number, endAyah: number, formatting: FormattingOptions): string | null {
		const ayahs: Ayah[] = [];
		for (let ayahId = startAyah; ayahId <= endAyah; ayahId++) {
			const found = this.repository.findAyah(surahId, ayahId);
			if (found) ayahs.push(found);
		}
		return ayahs.length > 0 ? this.formatter.format(ayahs, formatting) : null;
	}

	private buildEntryMarkdown(
		reflectionText: string,
		categoryName: string,
		isRange: boolean,
		startAyah: number,
		endAyah: number,
		quotedPassage: string | null,
		entryPrefixTemplate: string,
		locale: Locale
	): string {
		const lines: string[] = [];
		const prefix = entryPrefixTemplate.split("{date}").join(formatDateISO(new Date())).trim();
		if (prefix) lines.push(prefix, "");

		if (isRange) {
			lines.push(
				`> [!note] ${t(locale, "reflection.rangeNoticeTitle")}`,
				`> ${t(locale, "reflection.rangeNoticeBody", { category: categoryName, start: startAyah, end: endAyah })}`,
				""
			);
			if (quotedPassage) lines.push(quotedPassage, "");
		}

		lines.push(reflectionText.trim());
		return lines.join("\n");
	}
}

```

## application\use-cases\RemoveQuranReference.ts

```typescript
import type { EditorPort } from "../../domain/ports/EditorPort";
import type { CompiledVerseReference } from "../../domain/value-objects/VerseReference";

/** FR-27: strip any reference matching the configured format from the
 *  current line. Delegates the actual regex work to the compiled
 *  reference (NFR-3) rather than a hardcoded `[Surah:N-M]` pattern. */
export class RemoveQuranReference {
	constructor(private readonly reference: CompiledVerseReference) {}

	execute(editor: EditorPort): void {
		const lineNum = editor.getCursor().line;
		const lineText = editor.getLine(lineNum);
		editor.setLine(lineNum, this.reference.strip(lineText));
	}
}

```

## application\use-cases\SearchQuranVerses.ts

```typescript
import type { Ayah } from "../../domain/entities/Ayah";
import type { QuranRepository } from "../../domain/ports/QuranRepository";
import type { SearchStrategy } from "../../config/types";
import { FuzzyMatcher } from "../../domain/services/FuzzyMatcher";
import { PhraseMatcher } from "../../domain/services/PhraseMatcher";

/**
 * Backs the global/live search modal (FR-16/17). `pool`, when given, lets
 * the modal search within a previously-narrowed set instead of the full
 * corpus (e.g. refining a context-parsed ambiguity).
 *
 * Which matcher runs is a setting (settings.searchStrategy), not a
 * hardcoded choice — v2 fix for the "search returns anything containing
 * the words in any order" complaint. "literal" delegates to PhraseMatcher
 * (contiguous, order-preserving — the same engine ExtractAndInsertVerse's
 * direct-query path uses), but — unlike that direct-query path — with
 * `allowPrefixOnLastWord` on: this is a live, as-you-type search box, so
 * the word currently being typed shouldn't have to be finished before
 * anything shows up. "fuzzy" delegates to FuzzyMatcher (any
 * order/position), preserved as the looser opt-in mode.
 */
export class SearchQuranVerses {
	constructor(
		private readonly repository: QuranRepository,
		private readonly phraseMatcher: PhraseMatcher,
		private readonly fuzzyMatcher: FuzzyMatcher,
		private readonly maxResults: number,
		private readonly strategy: SearchStrategy
	) {}

	execute(query: string, pool?: readonly Ayah[]): Ayah[] {
		const corpus = pool ?? this.repository.getAllAyahs();
		if (this.strategy === "literal") {
			return this.phraseMatcher.findMatches(query, corpus, true).slice(0, this.maxResults);
		}
		return this.fuzzyMatcher.findMatches(query, corpus, this.maxResults);
	}
}


```

## application\use-cases\StripTashkeel.ts

```typescript
import type { EditorPort } from "../../domain/ports/EditorPort";
import type { ArabicNormalizer } from "../../domain/services/ArabicNormalizer";

/** FR-29: strip tashkeel from the current selection, or the whole line if
 *  nothing is selected. Thin wrapper around ArabicNormalizer.stripTashkeel
 *  — kept as its own use case (rather than inlined into a command) so it
 *  stays consistent with the toggle behind settings.stripTashkeel and is
 *  independently testable. */
export class StripTashkeel {
	constructor(private readonly normalizer: ArabicNormalizer) {}

	execute(editor: EditorPort): void {
		const selectedText = editor.getSelection();
		if (selectedText.length > 0) {
			const cursorFrom = editor.getCursor("from");
			const cursorTo = editor.getCursor("to");
			editor.replaceRange(this.normalizer.stripTashkeel(selectedText), cursorFrom, cursorTo);
			return;
		}
		const lineNum = editor.getCursor().line;
		const lineText = editor.getLine(lineNum);
		editor.setLine(lineNum, this.normalizer.stripTashkeel(lineText));
	}
}

```

## application\use-cases\ToggleSnippetView.ts

```typescript
import type { Ayah } from "../../domain/entities/Ayah";
import type { InsertionMemento } from "../../domain/ports/InsertionMemento";
import type { SnippetExtractor } from "../../domain/services/SnippetExtractor";
import type { FormattingOptions, VerseOutputFormatter } from "../../domain/services/VerseOutputFormatter";

export interface ToggleResult {
	output: string;
	nextMemento: InsertionMemento;
}

/**
 * FR-9: on a repeat invoke at the same spot, toggle between the full ayah
 * and the snippet the user originally typed as their search query — a
 * "double-undo" affordance so re-running the extract command narrows,
 * then widens, then narrows the quote again.
 *
 * v1 had this embedded inline as the first branch of a much larger
 * function. Split out here so this specific (slightly fiddly) behavior is
 * independently unit-testable without exercising the rest of the
 * extraction resolution chain.
 */
export class ToggleSnippetView {
	constructor(
		private readonly snippetExtractor: SnippetExtractor,
		private readonly formatter: VerseOutputFormatter
	) {}

	/** Returns null when toggling doesn't apply — the caller should fall
	 *  through to the rest of the extraction resolution chain. */
	attempt(
		memento: InsertionMemento,
		currentLine: string,
		cursorLine: number,
		wrapperStart: string,
		wrapperEnd: string,
		formattingOptions: FormattingOptions
	): ToggleResult | null {
		if (memento.line !== cursorLine) return null;
		if (currentLine.indexOf(wrapperStart) === -1 || currentLine.indexOf(wrapperEnd) === -1) return null;

		const targetAyah = memento.ayahs[0];
		const queryText = memento.query.trim();

		if (!memento.isSnippet) {
			if (queryText.length === 0) return null;
			const snippetText = this.snippetExtractor.extractSnippet(targetAyah.text, queryText);
			if (snippetText === targetAyah.text) return null; // nothing narrower to show
			const dummy: Ayah = { ...targetAyah, text: snippetText };
			return {
				output: this.formatter.format([dummy], formattingOptions),
				nextMemento: { ...memento, isSnippet: true },
			};
		}

		return {
			output: this.formatter.format(memento.ayahs, formattingOptions),
			nextMemento: { ...memento, isSnippet: false },
		};
	}
}

```

## config\defaults.ts

```typescript
import type { NormalizationRule, PluginConfig } from "./types";
import builtinNormalizationRules from "../../data/normalizationRules.json";

function seedNormalizationRules(): NormalizationRule[] {
	return (builtinNormalizationRules as Array<Record<string, unknown>>).map((r) => ({
		id: String(r.id),
		description: String(r.description),
		pattern: String(r.pattern),
		flags: String(r.flags ?? "g"),
		replacement: String(r.replacement),
		enabled: true,
	}));
}

export const DEFAULT_SETTINGS: PluginConfig = {
	// Text normalization & verse formatting
	stripTashkeel: false,
	useOrnateNumbers: true,
	ornateRingGlyph: "\u06DD", // ۝
	wrapperStart: "\uFD3F", // ﴿
	wrapperEnd: "\uFD3E", // ﴾
	referenceFormat: "[{surah}:{verse}]",
	normalizationRules: seedNormalizationRules(),

	// Qur'anic text styling
	quranFontFamily: "'Amiri', 'KFGQPC Uthman Taha Naskh', serif",
	quranFontSize: 1.1,
	quranLineHeight: 2.1,
	quranColor: "#dfc56b",
	styleOrnateNumbers: true,
	customCss: "",

	// Search & interface
	showAnalytics: true,
	maxSuggestionResults: 30,
	maxSlidingWindowWords: 12,
	interfaceLanguage: "ar",
	searchStrategy: "literal",

	// Tafsir
	defaultTafsirBookId: "saadi",
	favoriteBooksIds: ["saadi", "ibn-katheer", "muyassar"],
	customTafsirBooks: [],
	tafsirBookResolutionOrder: ["explicit", "lineAliases", "favorites", "default"],
	includeAyahTextInTafsir: true,
	useHorizontalDivider: true,
	rangeHeadingLevel: "###",
	bookHeadingLevel: "####",
	tafsirFetchDelayMs: 150,
	tafsirFetchDelayThreshold: 2,

	// Reflections (تدبر / أثر / user-defined categories)
	customReflectionCategories: [],
	ayahNotesFolder: "ملاحظات الآيات",
	deleteSelectionAfterLinkingReflection: true,
	reflectionBacklinkAliasTemplate: "",
	reflectionBacklinkWrapTemplate: "{link}",
	reflectionEntryPrefixTemplate: "### {date}",
	reflectionEntrySeparator: "\n\n---\n\n",
	reflectionInsertionMode: "afterHeading",
	reflectionFileNameTemplate: "{ayahText} ({surah} {verse})",
	reflectionFileNameAyahTextMaxLength: 60,
	includeAyahTextInReflectionNote: true,
};

/** v1 stored the literal string "[Surah:Verse]" as a display-only setting
 *  that nothing ever read (see docs/REQUIREMENTS.md NFR-3). If we see that
 *  exact legacy value on load, upgrade it to the real template so v1 users
 *  don't silently get a non-functional reference format. */
export function migrateLegacySettings(raw: Partial<PluginConfig> | undefined): Partial<PluginConfig> {
	if (!raw) return {};
	let migrated = raw;
	if ((raw as { referenceFormat?: string }).referenceFormat === "[Surah:Verse]") {
		migrated = { ...migrated, referenceFormat: "[{surah}:{verse}]" };
	}
	// NOTE: the "unified vs per-category-folder" note-organization migration
	// (actually moving existing per-category files into/out of the unified
	// note, or vice versa) is a deliberately separate, explicit, user-triggered
	// operation — never silent, never inferred from a settings diff on load.
	// See docs/ARCHITECTURE.md §9 "Migration" for why, and
	// MigrateNoteOrganization (planned) for where it will live.
	return migrated;
}

```

## config\strings.ts

```typescript
import type { Locale } from "./types";

export const STRINGS: Record<Locale, Record<string, string>> = {
	ar: {
		"search.placeholder": "اكتب كلمات البحث بدقة لدراسة المواضيع القرآنيّة...",
		"analytics.total": "إجمالي المواضع",
		"analytics.mostQuoted": "الأكثر تكراراً",
		"analytics.densest": "الأعلى كثافة نصية",
		"analytics.empty": "-",
		"rangeEnd.placeholderPrefix": "اختر آية نهاية النطاق لسورة",
		"rangeEnd.placeholderSuffix": "تبدأ من الآية",
		"tafsir.pickerTitle": "تخصيص كُتُب التفسير المطلوبة",
		"tafsir.pickerPlaceholder": "ابحث في كتب التفسير (اكتب اسم المفسر أو جزءاً منه)...",
		"tafsir.pickerEmpty": "لم يتم العثور على كتب تطابق بحثك الحالي.",
		"tafsir.noBookFound": "لم يتم العثور على تفسير لهذا الموضع.",
		"tafsir.fetchFailed": "فشل الاتصال بالشبكة. تم الاحتفاظ بالأمر الحالي دون تغيير.",
		"tafsir.rangeHeading": "تفسير سورة {surah} ({start} - {end})",
		"tafsir.ayahHeadingLabel": "[تفسير آية {ayah}]:",
		"tafsir.emptyBook": "لم يتم العثور على التفسير لهذا الموضوع.",
		"tafsir.pickerConfirm": "إدراج المحدد",
		"tafsir.pickerHint": "اختر كتاباً أو أكثر ثم اضغط «إدراج المحدد» (أو Shift+Enter).",
		"tafsir.addSourceTitle": "+ إضافة مصدر تفسير مخصص",
		"tafsir.addSourceNamePlaceholder": "الاسم",
		"tafsir.addSourceAliasesPlaceholder": "أسماء بديلة، مفصولة بفواصل",
		"tafsir.addSourceUrlPlaceholder": "رابط يحوي {bookId} و{surahId} و{ayahId}",
		"tafsir.addSourceButton": "إضافة",
		"reflection.noSelection": "حدد نصًا أولاً لتسجيله.",
		"reflection.unknownCategory": "تصنيف غير معروف.",
		"reflection.rangeNoticeTitle": "ملحوظة",
		"reflection.rangeNoticeBody": "هذا {category} عام على الآيات من {start} إلى {end}، وليس خاصًا بهذه الآية وحدها.",
		"linkAyat.title": "ربط آيات متشابهة",
		"linkAyat.placeholder": "ابحث عن آية لإضافتها إلى الربط...",
		"linkAyat.empty": "اكتب كلمات بحث لعرض الآيات.",
		"linkAyat.selectedPrefix": "المُختار:",
		"linkAyat.hint": "اختر آيتين على الأقل ثم اضغط «ربط المحدد» (أو Shift+Enter).",
		"linkAyat.confirm": "ربط المحدد",
	},
	en: {
		"search.placeholder": "Type search words to look up Qur'anic verses...",
		"analytics.total": "Total matches",
		"analytics.mostQuoted": "Most quoted",
		"analytics.densest": "Highest density",
		"analytics.empty": "-",
		"rangeEnd.placeholderPrefix": "Choose the range's ending ayah for",
		"rangeEnd.placeholderSuffix": "starting from ayah",
		"tafsir.pickerTitle": "Choose tafsir books",
		"tafsir.pickerPlaceholder": "Search across all tafsir books (author or part of the name)...",
		"tafsir.pickerEmpty": "No books match your current search.",
		"tafsir.noBookFound": "No tafsir found for this position.",
		"tafsir.fetchFailed": "Network request failed. The line was left unchanged.",
		"tafsir.rangeHeading": "Tafsir of Surah {surah} ({start}-{end})",
		"tafsir.ayahHeadingLabel": "[Tafsir of ayah {ayah}]:",
		"tafsir.emptyBook": "No commentary found for this ayah.",
		"tafsir.pickerConfirm": "Insert selected",
		"tafsir.pickerHint": "Select one or more books, then click \"Insert selected\" (or Shift+Enter).",
		"tafsir.addSourceTitle": "+ Add a custom tafsir source",
		"tafsir.addSourceNamePlaceholder": "Name",
		"tafsir.addSourceAliasesPlaceholder": "aliases, comma-separated",
		"tafsir.addSourceUrlPlaceholder": "URL containing {bookId}, {surahId}, {ayahId}",
		"tafsir.addSourceButton": "Add",
		"reflection.noSelection": "Select some text first to log it.",
		"reflection.unknownCategory": "Unknown reflection category.",
		"reflection.rangeNoticeTitle": "Note",
		"reflection.rangeNoticeBody": "This {category} concerns the range {start}\u2013{end} as a whole, not only this ayah.",
		"linkAyat.title": "Link related ayahs",
		"linkAyat.placeholder": "Search for an ayah to add to the link...",
		"linkAyat.empty": "Type search words to see ayahs.",
		"linkAyat.selectedPrefix": "Selected:",
		"linkAyat.hint": "Select at least two ayahs, then click \"Link selected\" (or Shift+Enter).",
		"linkAyat.confirm": "Link selected",
	},
};

export function t(locale: Locale, key: string, vars?: Record<string, string | number>): string {
	const currentLocale: Locale = locale === "en" ? "en" : "ar";
	const table: Record<string, string> = STRINGS[currentLocale] ?? STRINGS.ar;
	const rawValue: string = table[key] ?? STRINGS.ar[key] ?? key;
	let value: string = rawValue;
	if (vars) {
		for (const k of Object.keys(vars)) {
			const val = String(vars[k]);
			value = value.split(`{${k}}`).join(val);
		}
	}
	return value;
}

```

## config\types.ts

```typescript
/**
 * Central settings schema. Nothing in domain/application/infrastructure
 * reads a literal where a value here could go instead — see
 * docs/ARCHITECTURE.md §6 for the full hardcoded -> configurable map.
 *
 * v2.1 changes (see docs/ARCHITECTURE.md §9 "Unified ayah notes"):
 * - `HeadingLevel` union removed. Obsidian's own convention (H1 often
 *   owned by the note title) means different users want different
 *   levels for different purposes — a fixed "H3-H5" menu (v2.0) was
 *   itself a hardcoded literal masquerading as a setting. Every heading
 *   level is now a free-text field (still validated at compile time by
 *   VerseReference-style helpers where it matters, e.g. non-empty and
 *   matching /^#{1,6}$/).
 * - `ReflectionCategoryDescriptor` gained `organizationMode`,
 *   `headingText`, `headingLevel`, `parentCategoryId` — a category no
 *   longer *must* own a folder; by default (`"unified"`) its entries
 *   live under a heading inside one note per ayah. `folder` is only
 *   consulted when `organizationMode === "ownFolder"`.
 */

export type Locale = "ar" | "en";

export type TafsirResolutionStrategy =
	| "explicit" // an override chosen in a picker for this specific call
	| "lineAliases" // book names/aliases mentioned in the current line's text
	| "favorites" // settings.favoriteBooksIds
	| "default"; // settings.defaultTafsirBookId

export type SearchStrategy =
	| "literal" // PhraseMatcher: query words must appear contiguously, in order
	| "fuzzy"; // FuzzyMatcher: query words may appear anywhere, in any order

/** How a reflection entry finds a home. "unified" (the default): entries
 *  live under this category's heading inside the single note for that
 *  ayah. "ownFolder": entries live in their own per-ayah file under
 *  `folder`, and a single link line is kept in sync (both directions)
 *  with the unified note, which stays "the reference" either way. */
export type CategoryOrganizationMode = "unified" | "ownFolder";

/** Where a new entry lands relative to already-existing entries under
 *  the same heading. "afterHeading": newest directly under the heading
 *  (newest-first). "endOfSection": appended at the section's end
 *  (chronological, oldest-first) — see HeadingSectionInserter. This is
 *  one global setting (a formatting taste, not a per-category axis). */
export type ReflectionInsertionMode = "afterHeading" | "endOfSection";

/** A tafsir source. Builtin books (data/tafsirBooks.json) and
 *  user-added books (settings.customTafsirBooks) share this exact shape —
 *  a custom source is not a second-class citizen. */
export interface TafsirBookDescriptor {
	id: string;
	name: string;
	aliases: string[];
	/** {bookId}, {surahId}, {ayahId} are substituted at fetch time. */
	urlTemplate: string;
	isBuiltin: boolean;
}

/**
 * A category of personal writing linked to an ayah (تدبر، أثر، or any
 * user-defined category — "فوائد عملية", "فوائد لغوية", ...). Only تدبر
 * and أثر are builtin; everything else is a use-case the user configures
 * for themselves, including whether it lives in the unified note or gets
 * its own folder.
 */
export interface ReflectionCategoryDescriptor {
	id: string;
	name: string;
	organizationMode: CategoryOrganizationMode;
	/** Heading text this category's entries live under, e.g. "تدبرات". */
	headingText: string;
	/** e.g. "###". Free text — see the file-level note above. */
	headingLevel: string;
	/** Id of an ancestor category whose heading this one should nest
	 *  under the first time it's created (e.g. "فوائد لغوية" under
	 *  "فوائد") — null for a top-level heading. Consulted only once, at
	 *  heading-creation time; see HeadingSectionInserter and
	 *  ReflectionCategoryCatalog.ancestorChain for the cycle-safe walk. */
	parentCategoryId: string | null;
	/** Vault-relative folder — used only when organizationMode is "ownFolder". */
	folder: string;
	isBuiltin: boolean;
}

/** One Arabic-text normalization rule. Ships with sane defaults in
 *  settings.normalizationRules; fully user-editable from there. */
export interface NormalizationRule {
	id: string;
	description: string;
	/** Regex source (no slashes). Matched literally against normalized text. */
	pattern: string;
	flags: string;
	replacement: string;
	enabled: boolean;
}

export interface PluginConfig {
	// --- Text normalization & verse formatting ---
	stripTashkeel: boolean;
	useOrnateNumbers: boolean;
	/** Ring glyph used to wrap ornate ayah numbers, e.g. "۝". */
	ornateRingGlyph: string;
	/** Verse wrapper glyphs, e.g. "﴿" / "﴾". */
	wrapperStart: string;
	wrapperEnd: string;
	/** Template with {surah} and {verse} placeholders, e.g. "[{surah}:{verse}]".
	 *  Actually compiled into the parser regex AND the output formatter —
	 *  see VerseReference.compile() (fixes the v1 dead-setting bug). */
	referenceFormat: string;
	/** User-editable normalization/substitution rules, seeded from
	 *  data/normalizationRules.json but independent after first load. */
	normalizationRules: NormalizationRule[];

	// --- Qur'anic text styling (Live Preview / Reading view) ---
	quranFontFamily: string;
	quranFontSize: number; // em
	quranLineHeight: number;
	quranColor: string;
	styleOrnateNumbers: boolean;
	customCss: string;

	// --- Search & interface ---
	showAnalytics: boolean;
	maxSuggestionResults: number;
	maxSlidingWindowWords: number;
	interfaceLanguage: Locale;
	searchStrategy: SearchStrategy;

	// --- Tafsir ---
	defaultTafsirBookId: string;
	favoriteBooksIds: string[];
	customTafsirBooks: TafsirBookDescriptor[];
	tafsirBookResolutionOrder: TafsirResolutionStrategy[];
	includeAyahTextInTafsir: boolean;
	useHorizontalDivider: boolean;
	/** Free-text heading marker, e.g. "###". See file-level note above. */
	rangeHeadingLevel: string;
	/** Free-text heading marker, e.g. "####". */
	bookHeadingLevel: string;
	tafsirFetchDelayMs: number;
	tafsirFetchDelayThreshold: number;

	// --- Reflections (تدبر / أثر / user-defined categories) ---
	customReflectionCategories: ReflectionCategoryDescriptor[];
	/** Vault-relative folder for unified per-ayah notes (used by every
	 *  category whose organizationMode is "unified", i.e. by default). */
	ayahNotesFolder: string;
	/** When true (default), the selection that was logged is replaced
	 *  in its original note with a backlink to the ayah note instead of
	 *  being erased — v1/v2.0's `deleteSelectionAfterLinkingReflection`
	 *  used to just delete it, silently losing the content's origin.
	 *  When false, the selection is left completely untouched (a copy). */
	deleteSelectionAfterLinkingReflection: boolean;
	/** {surah}/{verse}/{ayahText} available. Empty = link with no alias,
	 *  i.e. plain "[[Note Title]]". */
	reflectionBacklinkAliasTemplate: string;
	/** Wraps the rendered backlink; the only placeholder is {link}. */
	reflectionBacklinkWrapTemplate: string;
	/** Whatever precedes each dated entry — not restricted to a heading.
	 *  {date} is the only placeholder, e.g. "### {date}", "- {date}",
	 *  "1. {date}", or empty for no prefix at all. */
	reflectionEntryPrefixTemplate: string;
	/** Inserted between consecutive entries under the same heading (or
	 *  in the same own-folder file). Can be left empty. */
	reflectionEntrySeparator: string;
	/** Where a new entry lands relative to existing ones — see
	 *  ReflectionInsertionMode. */
	reflectionInsertionMode: ReflectionInsertionMode;
	/** Must contain {ayahText}; {surah} and {verse} are also available.
	 *  Builds the unified/own-folder note's on-disk title. */
	reflectionFileNameTemplate: string;
	reflectionFileNameAyahTextMaxLength: number;
	/** Whether a freshly-created unified note gets the ayah's own text
	 *  quoted at the top (once, not repeated per entry). */
	includeAyahTextInReflectionNote: boolean;
}

```

## domain\entities\Ayah.ts

```typescript
/** A single Qur'anic verse from the loaded corpus. */
export interface Ayah {
	/** Stable sequential id assigned at load time (position in the corpus). */
	readonly id: number;
	readonly surahId: number;
	readonly ayahId: number;
	readonly surahName: string;
	readonly text: string;
}

```

## domain\entities\ReflectionCategory.ts

```typescript
/**
 * A category of personal writing a user links to an ayah — their own
 * reflection (تدبر) vs. something they're just recording that isn't their
 * own composition (أثر), or any use-case-specific category they define
 * themselves (فوائد عملية، فوائد لغوية، ...). Structurally identical to
 * `ReflectionCategoryDescriptor` in src/config/types.ts by design — the
 * domain layer never imports the config layer (see docs/ARCHITECTURE.md
 * §2) — so this is declared independently, same convention as
 * TafsirBook/TafsirBookDescriptor.
 */
export type CategoryOrganizationMode = "unified" | "ownFolder";

export interface ReflectionCategory {
	readonly id: string;
	readonly name: string;
	readonly organizationMode: CategoryOrganizationMode;
	/** Heading text this category's entries live under in the unified
	 *  note, e.g. "تدبرات". Also used (as a link-line anchor) for
	 *  "ownFolder" categories — see AyahNoteRepository. */
	readonly headingText: string;
	/** e.g. "###". */
	readonly headingLevel: string;
	/** Id of the ancestor category this one nests its heading under the
	 *  first time it's created — null for a top-level heading. */
	readonly parentCategoryId: string | null;
	/** Vault-relative folder — meaningful only when organizationMode is
	 *  "ownFolder". */
	readonly folder: string;
	readonly isBuiltin: boolean;
}

```

## domain\entities\TafsirBook.ts

```typescript
/**
 * A tafsir (commentary) source — builtin or user-added.
 *
 * Structurally identical to `TafsirBookDescriptor` in
 * src/config/types.ts by design: the domain layer never imports the
 * config layer (see docs/ARCHITECTURE.md §2), so this is declared
 * independently rather than reused across the boundary. Small, deliberate
 * duplication at a hexagonal-architecture seam.
 */
export interface TafsirBook {
	readonly id: string;
	readonly name: string;
	readonly aliases: readonly string[];
	/** {bookId}, {surahId}, {ayahId} placeholders, substituted at fetch time. */
	readonly urlTemplate: string;
	readonly isBuiltin: boolean;
}

```

## domain\ports\AyahNoteRepository.ts

```typescript
import type { ReflectionCategory } from "../entities/ReflectionCategory";

export interface AyahIdentity {
	surahId: number;
	surahName: string;
	ayahId: number;
	/** Raw (unwrapped) ayah text — used for the {ayahText} filename placeholder. */
	ayahTextRaw: string;
	/** Fully-formatted ayah text (wrapper glyphs / ornate numbers already
	 *  applied per settings) — used when quoting the ayah inside a
	 *  freshly-created note's body. Only read if includeAyahText is true. */
	ayahTextBodyFormatted: string;
}

export interface ReflectionEntryFormatting {
	insertionMode: "afterHeading" | "endOfSection";
	entrySeparator: string;
	includeAyahText: boolean;
	fileNameTemplate: string;
}

export interface AyahNoteRef {
	/** Display title (basename, no folder/extension) of the resolved note
	 *  — usable directly as a wikilink target: `[[${title}]]`. */
	title: string;
}

/**
 * How the plugin persists content against ayahs: one unified note per
 * ayah by default, with an opt-in per-category "own folder" escape hatch.
 * Replaces v1/v2.0's ReflectionFileRepository (one file per
 * category+ayah, always) — that shape no longer matches the unified note
 * default. See docs/ARCHITECTURE.md §9 "Unified ayah notes".
 */
export interface AyahNoteRepository {
	/** Writes `entryMarkdown` under `ancestorChain`'s leaf category's
	 *  heading (creating any missing ancestor headings top-down first —
	 *  see ReflectionCategoryCatalog.ancestorChain). For an "ownFolder"
	 *  leaf category, the entry instead goes to that category's own
	 *  per-ayah file, and a bidirectional link is kept in sync with the
	 *  unified note. Creates the unified note (and, for "ownFolder", the
	 *  own-folder note) if it doesn't exist yet. */
	appendEntry(
		identity: AyahIdentity,
		ancestorChain: readonly ReflectionCategory[],
		entryMarkdown: string,
		formatting: ReflectionEntryFormatting
	): Promise<AyahNoteRef>;

	/** Union-merges `relatedNoteTitles` into this ayah's `relatedAyat`
	 *  frontmatter on its *unified* note — creates the note if it doesn't
	 *  exist yet, never overwrites links already there. */
	linkRelatedAyat(
		identity: AyahIdentity,
		fileNameTemplate: string,
		includeAyahText: boolean,
		relatedNoteTitles: readonly string[]
	): Promise<AyahNoteRef>;

	/** Resolves the unified note's display title for this ayah. If
	 *  `createIfMissing` is false and no such note exists yet, returns
	 *  null instead of creating one (used for a backlink where "nothing
	 *  logged yet for this ayah" should stay that way). */
	resolveUnifiedNoteTitle(
		identity: AyahIdentity,
		fileNameTemplate: string,
		includeAyahText: boolean,
		createIfMissing: boolean
	): Promise<string | null>;
}

```

## domain\ports\EditorPort.ts

```typescript
export interface EditorPosition {
	line: number;
	ch: number;
}

export type CursorAnchor = "from" | "to" | "head" | "anchor";

/** The slice of Obsidian's `Editor` the application layer actually needs.
 *  Kept intentionally small so a test double is trivial to write and so
 *  use cases never import `obsidian`. */
export interface EditorPort {
	getCursor(anchor?: CursorAnchor): EditorPosition;
	getLine(line: number): string;
	lineCount(): number;
	setLine(line: number, text: string): void;
	replaceRange(text: string, from: EditorPosition, to: EditorPosition): void;
	getSelection(): string;
	getValue(): string;
}

```

## domain\ports\InsertionMemento.ts

```typescript
import type { Ayah } from "../entities/Ayah";

/** State needed to implement the "toggle full ayah <-> last-typed
 *  snippet on repeat invoke" behavior (FR-9), kept out of the editor
 *  adapter so it's independently testable. */
export interface InsertionMemento {
	line: number;
	query: string;
	ayahs: readonly Ayah[];
	isSnippet: boolean;
}

export interface InsertionMementoStore {
	get(): InsertionMemento | null;
	set(memento: InsertionMemento | null): void;
}

```

## domain\ports\NoticePort.ts

```typescript
/** Abstraction over Obsidian's `Notice` so domain/application code can
 *  surface a message to the user without importing `obsidian`. */
export interface NoticePort {
	show(message: string): void;
}

```

## domain\ports\QuranRepository.ts

```typescript
import type { Ayah } from "../entities/Ayah";

/** How the domain/application layers access the Qur'an corpus. Implemented
 *  once against Obsidian's bundled data today (ObsidianQuranRepository);
 *  could equally be backed by a vault file or a remote source later
 *  without any use case changing. */
export interface QuranRepository {
	loadAll(): Promise<void>;
	getAllAyahs(): readonly Ayah[];
	/** Normalized, space-joined text of the whole corpus (in the same
	 *  order as getAllAyahs()) for sliding-window substring search. */
	getSearchCorpusText(): string;
	findSurahByName(normalizedSurahName: string): { id: number; name: string } | null;
	findAyah(surahId: number, ayahId: number): Ayah | null;
}

```

## domain\ports\ReflectionFileRepository.ts

```typescript
import type { ReflectionCategory } from "../entities/ReflectionCategory";

export interface ReflectionFileEntry {
	surahId: number;
	surahName: string;
	ayahId: number;
	/** Precomputed file title (no ".md", no folder) — see
	 *  ReflectionFileNameBuilder. Purely cosmetic: the repository never
	 *  uses this to *find* a file, only to *name* a new one — see its
	 *  own doc comment. */
	fileTitle: string;
	/** Fully-formatted Markdown for one dated entry (heading, optional
	 *  range notice, optional quoted passage, the reflection text) —
	 *  built entirely by the application layer; this port only decides
	 *  *where* it's persisted and whether to create vs. append. */
	entryMarkdown: string;
}

/** Persists one تدبر/أثر entry into its per-ayah note file (one file per
 *  ayah under category.folder, e.g. "تدبرات/... .md") — creating the file
 *  (with frontmatter identifying which ayah it belongs to) the first time
 *  an ayah is linked, appending a new dated entry to it on every later
 *  occasion. */
export interface ReflectionFileRepository {
	appendEntry(category: ReflectionCategory, entry: ReflectionFileEntry): Promise<void>;
}

```

## domain\ports\TafsirRepository.ts

```typescript
import type { TafsirBook } from "../entities/TafsirBook";

/** Fetches commentary text for one (book, surah, ayah). The HTTP
 *  implementation is one adapter among possibly several — see
 *  docs/ARCHITECTURE.md §8 "Add a tafsir source". */
export interface TafsirRepository {
	fetchTafsir(book: TafsirBook, surahId: number, ayahId: number): Promise<string>;
}

```

## domain\services\AnalyticsCalculator.ts

```typescript
import type { Ayah } from "../entities/Ayah";

export interface AnalyticsResult {
	totalMatches: number;
	mostQuoted: { surahName: string; count: number; densityPercent: number } | null;
	densest: { surahName: string; densityPercent: number } | null;
}

/** Pure computation behind the search-modal analytics dashboard (FR-20):
 *  total match count, the surah quoted most (by raw count) with its
 *  density, and the surah with the highest density (matches / total
 *  words in that surah) — which need not be the same surah. */
export class AnalyticsCalculator {
	static compute(matches: readonly Ayah[], corpus: readonly Ayah[]): AnalyticsResult {
		if (matches.length === 0) {
			return { totalMatches: 0, mostQuoted: null, densest: null };
		}

		const surahCounts = new Map<number, number>();
		for (const a of matches) surahCounts.set(a.surahId, (surahCounts.get(a.surahId) ?? 0) + 1);

		const wordCountCache = new Map<number, number>();
		const wordsInSurah = (surahId: number): number => {
			let cached = wordCountCache.get(surahId);
			if (cached === undefined) {
				cached = corpus
					.filter((a) => a.surahId === surahId)
					.reduce((sum, a) => sum + a.text.split(/\s+/).length, 0);
				wordCountCache.set(surahId, cached);
			}
			return cached;
		};

		let maxSurahId: number | null = null;
		let maxCount = 0;
		let highestDensitySurahId: number | null = null;
		let highestDensity = 0;

		for (const [surahId, count] of surahCounts) {
			if (count > maxCount) {
				maxCount = count;
				maxSurahId = surahId;
			}
			const density = count / (wordsInSurah(surahId) || 1);
			if (density > highestDensity) {
				highestDensity = density;
				highestDensitySurahId = surahId;
			}
		}

		const nameOf = (surahId: number | null): string => corpus.find((a) => a.surahId === surahId)?.surahName ?? "";

		return {
			totalMatches: matches.length,
			mostQuoted:
				maxSurahId !== null
					? {
							surahName: nameOf(maxSurahId),
							count: maxCount,
							densityPercent: (maxCount / (wordsInSurah(maxSurahId) || 1)) * 100,
					  }
					: null,
			densest:
				highestDensitySurahId !== null
					? { surahName: nameOf(highestDensitySurahId), densityPercent: highestDensity * 100 }
					: null,
		};
	}
}

```

## domain\services\ArabicNormalizer.ts

```typescript
/**
 * Arabic text normalization for matching/search. v1 had this as a single
 * fixed function (`QuranText.normalizeForSearch`) with a hardcoded
 * substitution table baked in. Here the substitution table is injected
 * (NFR-2) — see data/normalizationRules.json for the shipped defaults and
 * settings.normalizationRules for the user-editable copy.
 *
 * Note on rule ordering: v1 applied its "يا أيها" rules before stripping
 * tashkeel and its short-alef rules after. None of the shipped rules'
 * patterns contain tashkeel marks, so applying the whole configured rule
 * list in one pass before stripping tashkeel is behaviorally identical for
 * the default ruleset while being far simpler to reason about for
 * user-added rules.
 */

export interface TextSubstitutionRule {
	pattern: string;
	flags: string;
	replacement: string;
	enabled: boolean;
}

const TASHKEEL_CLASS = "\\u0670\\u0610-\\u061A\\u064B-\\u065F\\u06D6-\\u06DC\\u06DF-\\u06E8\\u06EA-\\u06ED";
const TASHKEEL_REGEX = new RegExp(`[${TASHKEEL_CLASS}]`, "g");

export class ArabicNormalizer {
	private readonly compiledRules: Array<{ regex: RegExp; replacement: string }>;

	constructor(rules: readonly TextSubstitutionRule[]) {
		this.compiledRules = rules
			.filter((r) => r.enabled)
			.map((r) => ({ regex: new RegExp(r.pattern, r.flags || "g"), replacement: r.replacement }));
	}

	stripTashkeel(text: string): string {
		if (!text) return "";
		return text.replace(TASHKEEL_REGEX, "");
	}

	/** Normalize text for tolerant matching: applies configured
	 *  substitution rules, strips tashkeel, unifies letter-shape variants
	 *  (hamza forms, ya forms, waw-hamza, ta marbuta), then strips anything
	 *  outside the Arabic block/digits/whitespace. */
	normalizeForSearch(text: string): string {
		if (!text) return "";
		let out = text.trim();

		for (const rule of this.compiledRules) {
			out = out.replace(rule.regex, rule.replacement);
		}

		out = this.stripTashkeel(out);

		out = out
			.replace(/[\u0623\u0625\u0622\u0671\u0621\u0649]/g, "\u0627") // أ إ آ ٱ ء ى -> ا
			.replace(/[\u064A\u0626]/g, "\u064A") // ئ -> ي
			.replace(/\u0624/g, "\u0648") // ؤ -> و
			.replace(/\u0629/g, "\u0647") // ة -> ه
			.replace(/\u0640/g, ""); // strip tatweel (ـ)

		out = out.replace(/\u064A\u0627\u0627/g, "\u064A\u0627"); // ياا -> يا artifact cleanup

		out = out
			.replace(/[^\u0621-\u064A\s0-9\u0660-\u0669]/g, "")
			.replace(/\u0627+/g, "\u0627") // collapse repeated alefs
			.replace(/\s+/g, " ")
			.trim();

		return out;
	}

	/** Arabic-Indic (٠-٩) and Extended Arabic-Indic/Persian (۰-۹) digits -> Western digits. */
	static normalizeNumbers(text: string): string {
		if (!text) return "";
		return text
			.replace(/[\u0660-\u0669]/g, (d) => "\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669".indexOf(d).toString())
			.replace(/[\u06F0-\u06F9]/g, (d) => "\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9".indexOf(d).toString());
	}
}

```

## domain\services\FuzzyMatcher.ts

```typescript
import type { Ayah } from "../entities/Ayah";
import { ArabicNormalizer } from "./ArabicNormalizer";
import { PatternBuilder } from "./PatternBuilder";

/** Looser than PhraseMatcher: every query word must appear *somewhere* in
 *  an ayah's normalized text, in any order/position — surfaces partial or
 *  reordered recollections of a verse. Powers the live search-modal
 *  suggestions (FR-16/17). */
export class FuzzyMatcher {
	constructor(private readonly normalizer: ArabicNormalizer) {}

	findMatches(query: string, corpus: readonly Ayah[], limit: number): Ayah[] {
		const words = this.normalizer
			.normalizeForSearch(query)
			.split(/\s+/)
			.filter((w) => w.length > 0);
		if (words.length === 0) return [];
		const regexes = words.map((w) => new RegExp(PatternBuilder.makeMedialAlefsOptional(w)));
		const out: Ayah[] = [];
		for (const a of corpus) {
			const normText = this.normalizer.normalizeForSearch(a.text);
			if (regexes.every((rx) => rx.test(normText))) {
				out.push(a);
				if (out.length >= limit) break;
			}
		}
		return out;
	}
}

```

## domain\services\HeadingSectionInserter.ts

```typescript
export type InsertionMode = "afterHeading" | "endOfSection";

export interface HeadingSectionOptions {
	/** e.g. "###". */
	headingLevel: string;
	headingText: string;
	/** Consulted only if the heading doesn't exist yet — nests the new
	 *  heading at the end of the parent's section instead of at the end
	 *  of the file. Both must be given together or not at all. */
	parentHeadingLevel: string | null;
	parentHeadingText: string | null;
	insertionMode: InsertionMode;
	/** Inserted between this entry and whatever else is already in the
	 *  section — never inserted into an empty section. May be "". */
	separator: string;
}

const HEADING_LINE_REGEX = /^(#{1,6})\s+(.*)$/;

function depthOf(marker: string): number {
	return marker.length;
}

function headingLineIndex(lines: readonly string[], level: string, text: string): number {
	const target = `${level} ${text}`.trim();
	return lines.findIndex((l) => l.trim() === target);
}

/** First line index after `startIndex` whose heading depth is <= `ownDepth`
 *  (a sibling-or-higher-level heading) — i.e. where this section ends.
 *  `lines.length` if the section runs to the end of the file. */
function sectionEndIndex(lines: readonly string[], startIndex: number, ownDepth: number): number {
	for (let i = startIndex + 1; i < lines.length; i++) {
		const m = lines[i].match(HEADING_LINE_REGEX);
		if (m && depthOf(m[1]) <= ownDepth) return i;
	}
	return lines.length;
}

function toLines(content: string): string[] {
	return content.length > 0 ? content.split("\n") : [];
}

function fromLines(lines: readonly string[]): string {
	// Collapse any accidental triple-blank-lines from the splice math below,
	// then guarantee exactly one trailing newline (Obsidian's own convention).
	return lines
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trimEnd()
		.concat("\n");
}

/**
 * Finds/creates a heading section inside a single note's Markdown and
 * inserts content into it. Deliberately narrow in scope (see the
 * architecture discussion this was designed in): it does not understand
 * or manage a full outline, does not reorder existing headings, and only
 * ever nests a *new* heading under one already-resolved parent — it never
 * walks a parent chain itself (that's ReflectionCategoryCatalog's job,
 * top-down, one ensureHeadingExists() call per ancestor).
 */
export class HeadingSectionInserter {
	/** Inserts `entryBlock` under the section for `headingLevel headingText`,
	 *  creating that heading (nested under the parent heading if given and
	 *  found, else appended at the end of the file) if it doesn't exist yet. */
	static insertEntry(content: string, options: HeadingSectionOptions, entryBlock: string): string {
		let lines = toLines(content);
		let headingIdx = headingLineIndex(lines, options.headingLevel, options.headingText);
		const ownDepth = depthOf(options.headingLevel);

		if (headingIdx === -1) {
			lines = this.createHeadingLines(lines, options);
			headingIdx = headingLineIndex(lines, options.headingLevel, options.headingText);
		}

		const sectionEnd = sectionEndIndex(lines, headingIdx, ownDepth);
		const sectionIsEmpty = lines.slice(headingIdx + 1, sectionEnd).every((l) => l.trim() === "");

		let insertAt: number;
		let block: string;
		if (options.insertionMode === "afterHeading") {
			insertAt = headingIdx + 1;
			block = sectionIsEmpty ? entryBlock : `${entryBlock}${options.separator}`;
		} else {
			insertAt = sectionEnd;
			block = sectionIsEmpty ? entryBlock : `${options.separator}${entryBlock}`;
		}

		const merged = [...lines.slice(0, insertAt), ...block.split("\n"), ...lines.slice(insertAt)];
		return fromLines(merged);
	}

	/** Ensures the heading itself exists (creating it, nested under the
	 *  parent if given, if missing) without inserting any content — used
	 *  to walk an ancestor chain top-down before the leaf category's
	 *  actual entry is inserted. */
	static ensureHeadingExists(
		content: string,
		headingLevel: string,
		headingText: string,
		parentHeadingLevel: string | null,
		parentHeadingText: string | null
	): string {
		const lines = toLines(content);
		if (headingLineIndex(lines, headingLevel, headingText) !== -1) {
			return content.endsWith("\n") ? content : `${content}\n`;
		}
		return fromLines(
			this.createHeadingLines(lines, {
				headingLevel,
				headingText,
				parentHeadingLevel,
				parentHeadingText,
				insertionMode: "afterHeading",
				separator: "",
			})
		);
	}

	/** Idempotently ensures a single link line exists somewhere directly
	 *  under the heading — a no-op if that exact line is already present.
	 *  Used for the unified<->own-folder bidirectional link line. */
	static ensureLinkLine(content: string, options: HeadingSectionOptions, linkLine: string): string {
		const lines = toLines(content);
		const headingIdx = headingLineIndex(lines, options.headingLevel, options.headingText);
		if (headingIdx !== -1) {
			const ownDepth = depthOf(options.headingLevel);
			const sectionEnd = sectionEndIndex(lines, headingIdx, ownDepth);
			const alreadyPresent = lines.slice(headingIdx + 1, sectionEnd).some((l) => l.trim() === linkLine.trim());
			if (alreadyPresent) return content.endsWith("\n") ? content : `${content}\n`;
		}
		return this.insertEntry(content, { ...options, insertionMode: "afterHeading" }, linkLine);
	}

	private static createHeadingLines(lines: readonly string[], options: HeadingSectionOptions): string[] {
		const newHeading = [`${options.headingLevel} ${options.headingText}`, ""];
		if (options.parentHeadingLevel && options.parentHeadingText) {
			const parentIdx = headingLineIndex(lines, options.parentHeadingLevel, options.parentHeadingText);
			if (parentIdx !== -1) {
				const insertAt = sectionEndIndex(lines, parentIdx, depthOf(options.parentHeadingLevel));
				return [...lines.slice(0, insertAt), "", ...newHeading, ...lines.slice(insertAt)];
			}
		}
		if (lines.length === 0) return newHeading;
		return [...lines, "", ...newHeading];
	}
}

```

## domain\services\OrnateNumberConverter.ts

```typescript
const ARABIC_INDIC_DIGITS = "\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669";

/** Converts "(N)" ayah-number markers into ring-glyph-wrapped Arabic-Indic
 *  digits, e.g. "(12)" -> " ۝١٢ ". Both the ring glyph and whether this
 *  runs at all are settings (settings.ornateRingGlyph / useOrnateNumbers) —
 *  v1 hardcoded "۝" directly in the formatter. */
export class OrnateNumberConverter {
	constructor(private readonly ringGlyph: string) {}

	applyOrnateNumbers(text: string): string {
		return text.replace(/\((\d+)\)/g, (_match, digits: string) => {
			const arabicDigits = digits
				.split("")
				.map((d) => ARABIC_INDIC_DIGITS[parseInt(d, 10)])
				.join("");
			return ` ${this.ringGlyph}${arabicDigits} `;
		});
	}
}

```

## domain\services\PatternBuilder.ts

```typescript
export class PatternBuilder {
	/** Turn a normalized word into a regex source where every *interior*
	 *  alef is optional, so both "رحمن" and "رحمان" spellings match the
	 *  same word without a separate normalization rule per variant. */
	static makeMedialAlefsOptional(word: string): string {
		if (!word || word.length <= 2) return word;
		let out = word[0];
		for (let i = 1; i < word.length - 1; i++) {
			out += word[i] === "\u0627" ? "\u0627?" : word[i];
		}
		return out + word[word.length - 1];
	}
}

```

## domain\services\PhraseMatcher.ts

```typescript
import type { Ayah } from "../entities/Ayah";
import { ArabicNormalizer } from "./ArabicNormalizer";
import { PatternBuilder } from "./PatternBuilder";

/** Exact, order-preserving phrase matching: query words must appear
 *  contiguously in an ayah's normalized text (word-boundary anchored).
 *  Backs direct query resolution (a selection or {query}), the
 *  sliding-window search (SlidingWindowSearch), and — since
 *  settings.searchStrategy defaults to "literal" — the live search modal
 *  too. Contrast with FuzzyMatcher, which is looser and is the other
 *  option for the live search modal.
 *
 *  `allowPrefixOnLastWord` exists specifically for that live-typing case:
 *  every word the user has already *finished* typing must still match
 *  exactly, but the word they're still in the middle of typing needs to
 *  match as a prefix ("الل" should already surface "الله") — otherwise
 *  live search shows nothing until each word is complete, which is what
 *  direct query resolution and SlidingWindowSearch (matching an already
 *  fully-written quote) actually want, but a suggestion list while
 *  typing does not. Only the trailing boundary is affected: earlier
 *  words are already exact because they're pinned between `\s+`
 *  separators regardless of this flag. */
export class PhraseMatcher {
	constructor(private readonly normalizer: ArabicNormalizer) {}

	buildPattern(query: string, allowPrefixOnLastWord = false): RegExp | null {
		const normWords = this.normalizer
			.normalizeForSearch(query)
			.split(/\s+/)
			.filter((w) => w.length > 0);
		if (normWords.length === 0) return null;
		const body = normWords.map((w) => PatternBuilder.makeMedialAlefsOptional(w)).join("\\s+");
		const trailingBoundary = allowPrefixOnLastWord ? "" : "(?:\\s|$)";
		return new RegExp(`(?:^|\\s)${body}${trailingBoundary}`);
	}

	findMatches(query: string, corpus: readonly Ayah[], allowPrefixOnLastWord = false): Ayah[] {
		const pattern = this.buildPattern(query, allowPrefixOnLastWord);
		if (!pattern) return [];
		return corpus.filter((a) => pattern.test(this.normalizer.normalizeForSearch(a.text)));
	}
}


```

## domain\services\ReflectionCategoryCatalog.ts

```typescript
import type { ReflectionCategory } from "../entities/ReflectionCategory";

/**
 * Same builtin+custom merge convention as TafsirCatalog (NFR-1): the
 * shipped تدبر/أثر categories live in data/reflectionCategories.json,
 * merged with settings.customReflectionCategories at runtime so adding a
 * third category (e.g. فائدة) needs no code change — just a Settings
 * entry (its own link command still needs a line in registerCommands.ts,
 * see createLinkReflectionCommand's doc comment).
 */
export class ReflectionCategoryCatalog {
	private readonly categories: readonly ReflectionCategory[];

	constructor(builtin: readonly ReflectionCategory[], custom: readonly ReflectionCategory[]) {
		const byId = new Map<string, ReflectionCategory>();
		for (const c of builtin) byId.set(c.id, c);
		for (const c of custom) byId.set(c.id, c);
		this.categories = Array.from(byId.values());
	}

	all(): readonly ReflectionCategory[] {
		return this.categories;
	}

	byId(id: string): ReflectionCategory | null {
		return this.categories.find((c) => c.id === id) ?? null;
	}

	/** Root-to-leaf ancestor chain for `categoryId` (the category itself
	 *  is the last element), walked via `parentCategoryId`. Cycle-safe:
	 *  if a chain of parents loops back on itself, the walk stops at the
	 *  point of the cycle rather than hanging or throwing — heading
	 *  creation must never fail because of a settings mistake, it should
	 *  just degrade to treating the category as top-level from there. */
	ancestorChain(categoryId: string): ReflectionCategory[] {
		const chain: ReflectionCategory[] = [];
		const visited = new Set<string>();
		let current = this.byId(categoryId);
		while (current && !visited.has(current.id)) {
			visited.add(current.id);
			chain.unshift(current);
			current = current.parentCategoryId ? this.byId(current.parentCategoryId) : null;
		}
		return chain;
	}
}

```

## domain\services\ReflectionFileNameBuilder.ts

```typescript
const AYAH_TEXT_PLACEHOLDER = "{ayahText}";
const SURAH_PLACEHOLDER = "{surah}";
const VERSE_PLACEHOLDER = "{verse}";

/**
 * Builds the on-disk title for a single ayah's تدبر/أثر file from a
 * user-configurable template (settings.reflectionFileNameTemplate) — same
 * placeholder-substitution convention as VerseReference, just for a
 * filename instead of an inline citation.
 *
 * Defaults to quoting the ayah's own text (plus its reference) rather
 * than the reference alone, per explicit request: the file's title
 * should read as the ayah, not just its address. `{ayahText}` isn't
 * required — a user who prefers the old reference-only titles can set
 * the template to just "{surah} {verse}".
 *
 * File *identity* (which ayah a file belongs to) is never derived from
 * this title — see ObsidianReflectionFileRepository, which keys lookups
 * off frontmatter instead — so changing this template later never
 * orphans/duplicates existing files, only affects new ones.
 */
export class ReflectionFileNameBuilder {
	constructor(private readonly template: string, private readonly maxAyahTextLength: number) {}

	build(surahName: string, ayahId: number, ayahText: string): string {
		const truncated = this.truncate(ayahText.trim());
		return this.template
			.split(AYAH_TEXT_PLACEHOLDER)
			.join(truncated)
			.split(SURAH_PLACEHOLDER)
			.join(surahName)
			.split(VERSE_PLACEHOLDER)
			.join(String(ayahId))
			.replace(/\s{2,}/g, " ")
			.trim();
	}

	private truncate(text: string): string {
		if (this.maxAyahTextLength <= 0 || text.length <= this.maxAyahTextLength) return text;
		return `${text.slice(0, this.maxAyahTextLength).trim()}\u2026`;
	}
}

```

## domain\services\SlidingWindowSearch.ts

```typescript
import type { Ayah } from "../entities/Ayah";
import { ArabicNormalizer } from "./ArabicNormalizer";
import { PhraseMatcher } from "./PhraseMatcher";

export interface SlidingWindowMatch {
	/** The raw (un-normalized) text segment as it appears on the line. */
	segment: string;
	startWordIndex: number;
	wordCount: number;
	ayahs: Ayah[];
}

/**
 * Auto-detects an unmarked Qur'anic quote already typed on a line: masks
 * out anything already inside wrapper glyphs, then tries shrinking word
 * windows (maxWindowWords down to 2), longest match wins. v1 duplicated
 * this algorithm almost verbatim in two places (context analysis and the
 * extraction fallback) — consolidated to one implementation here, used by
 * both AnalyzeLineContext and ExtractAndInsertVerse.
 *
 * Performance: tests each candidate window against the pre-concatenated,
 * normalized corpus string first (cheap) before filtering the full ayah
 * array (expensive) — same optimization v1 used via its "giant string".
 */
export class SlidingWindowSearch {
	constructor(
		private readonly normalizer: ArabicNormalizer,
		private readonly phraseMatcher: PhraseMatcher,
		private readonly wrapperStart: string,
		private readonly wrapperEnd: string,
		private readonly maxWindowWords: number
	) {}

	private maskWrapped(line: string): string {
		const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const rx = new RegExp(`${escape(this.wrapperStart)}.*?${escape(this.wrapperEnd)}`, "g");
		return line.replace(rx, " ");
	}

	find(lineText: string, corpus: readonly Ayah[], searchCorpusText: string): SlidingWindowMatch | null {
		const maskedLine = this.maskWrapped(lineText);
		const rawWords = maskedLine.split(/\s+/).filter((w) => w.trim().length > 0);

		for (let len = Math.min(rawWords.length, this.maxWindowWords); len >= 2; len--) {
			for (let start = 0; start <= rawWords.length - len; start++) {
				const segment = rawWords.slice(start, start + len).join(" ");
				const pattern = this.phraseMatcher.buildPattern(segment);
				if (!pattern) continue;
				if (!pattern.test(searchCorpusText)) continue; // fast reject
				const matches = corpus.filter((a) => pattern.test(this.normalizer.normalizeForSearch(a.text)));
				if (matches.length > 0) {
					return { segment, startWordIndex: start, wordCount: len, ayahs: matches };
				}
			}
		}
		return null;
	}
}

```

## domain\services\SnippetExtractor.ts

```typescript
import { ArabicNormalizer } from "./ArabicNormalizer";
import { PatternBuilder } from "./PatternBuilder";

/**
 * Word-index based extraction: finding a snippet (a run of words) inside a
 * full ayah, or a word..word range inside a full ayah. Depends only on
 * ArabicNormalizer (injected) and the configured wrapper glyphs — no
 * Obsidian types, fully unit-testable.
 */
export class SnippetExtractor {
	constructor(
		private readonly normalizer: ArabicNormalizer,
		private readonly wrapperStart: string,
		private readonly wrapperEnd: string
	) {}

	/** Find `userSnippet`'s words as a contiguous run inside `fullVerse` and
	 *  return just that run (original spelling/tashkeel preserved). Falls
	 *  back to `fullVerse` unchanged if no match is found. */
	extractSnippet(fullVerse: string, userSnippet: string): string {
		if (!userSnippet) return fullVerse;
		const verseWords = fullVerse.trim().split(/\s+/);
		const normVerseWords = verseWords.map((w) => this.normalizer.normalizeForSearch(w));
		const searchWords = userSnippet
			.trim()
			.split(/\s+/)
			.map((w) => this.normalizer.normalizeForSearch(w));
		if (searchWords.length === 0) return fullVerse;
		const patterns = searchWords.map((w) => PatternBuilder.makeMedialAlefsOptional(w));

		for (let i = 0; i <= normVerseWords.length - searchWords.length; i++) {
			let matched = true;
			for (let j = 0; j < searchWords.length; j++) {
				const rx = new RegExp(`^${patterns[j]}$`);
				if (!rx.test(normVerseWords[i + j])) {
					matched = false;
					break;
				}
			}
			if (matched) return verseWords.slice(i, i + searchWords.length).join(" ");
		}
		return fullVerse;
	}

	/** Crop `fullVerse` to the inclusive word range between `startWord` and
	 *  `endWord` (e.g. from a "(word1-word2)" shorthand). Strips any
	 *  existing wrapper glyphs / "(N)" markers before searching. */
	extractRange(fullVerse: string, startWord: string, endWord: string): string {
		if (!startWord || !endWord) return fullVerse;
		const cleanVerse = fullVerse
			.split(this.wrapperStart)
			.join("")
			.split(this.wrapperEnd)
			.join("")
			.replace(/\(\d+\)/g, "")
			.trim();
		const verseWords = cleanVerse.split(/\s+/);
		const normVerseWords = verseWords.map((w) => this.normalizer.normalizeForSearch(w));

		const startPattern = new RegExp(
			`^${PatternBuilder.makeMedialAlefsOptional(this.normalizer.normalizeForSearch(startWord))}$`
		);
		const endPattern = new RegExp(
			`^${PatternBuilder.makeMedialAlefsOptional(this.normalizer.normalizeForSearch(endWord))}$`
		);

		let startIndex = -1;
		let endIndex = -1;
		for (let i = 0; i < normVerseWords.length; i++) {
			if (startIndex === -1 && startPattern.test(normVerseWords[i])) startIndex = i;
			if (startIndex !== -1 && endPattern.test(normVerseWords[i])) {
				endIndex = i;
				break;
			}
		}
		if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
			return verseWords.slice(startIndex, endIndex + 1).join(" ");
		}
		return cleanVerse;
	}
}

```

## domain\services\TafsirCatalog.ts

```typescript
import type { TafsirBook } from "../entities/TafsirBook";

/**
 * v1's `TAFSIR_BOOKS_LIST` was a hardcoded 42-entry array baked into the
 * bundle — a user could not add a source without editing source and
 * rebuilding. Here the builtin list is bundled *data*
 * (data/tafsirBooks.json) and this class merges it with
 * `settings.customTafsirBooks` (NFR-1); a custom entry with an id that
 * matches a builtin one overrides it (e.g. to re-point its URL), anything
 * else is additive.
 */
export class TafsirCatalog {
	private readonly books: readonly TafsirBook[];

	constructor(builtin: readonly TafsirBook[], custom: readonly TafsirBook[]) {
		const byId = new Map<string, TafsirBook>();
		for (const b of builtin) byId.set(b.id, b);
		for (const b of custom) byId.set(b.id, b);
		this.books = Array.from(byId.values());
	}

	all(): readonly TafsirBook[] {
		return this.books;
	}

	byId(id: string): TafsirBook | null {
		return this.books.find((b) => b.id === id) ?? null;
	}

	byIds(ids: readonly string[]): TafsirBook[] {
		return this.books.filter((b) => ids.includes(b.id));
	}

	/** Books whose name or an alias literally appears in `lineText`
	 *  (used to auto-detect intent, e.g. a line mentioning "ابن كثير"). */
	findMentionedIn(lineText: string): TafsirBook[] {
		if (!lineText) return [];
		return this.books.filter((b) => b.aliases.some((alias) => lineText.indexOf(alias) !== -1));
	}

	/** Case-insensitive substring search across name + aliases, for the
	 *  book-picker modal. */
	search(query: string): TafsirBook[] {
		const q = query.toLowerCase().trim();
		if (!q) return [...this.books];
		return this.books.filter(
			(b) => b.name.toLowerCase().includes(q) || b.aliases.some((a) => a.toLowerCase().includes(q))
		);
	}
}

```

## domain\services\VerseOutputFormatter.ts

```typescript
import type { Ayah } from "../entities/Ayah";
import type { CompiledVerseReference } from "../value-objects/VerseReference";
import type { OrnateNumberConverter } from "./OrnateNumberConverter";

export interface FormattingOptions {
	wrapperStart: string;
	wrapperEnd: string;
	useOrnateNumbers: boolean;
	stripTashkeelOnOutput: boolean;
}

/** Builds the final `﴿ ayah text (n) ﴾ [Surah:n-m]` string. Every glyph is
 *  a parameter (from settings), and the reference suffix is delegated to
 *  the compiled VerseReference so the template is respected end-to-end. */
export class VerseOutputFormatter {
	constructor(
		private readonly ornateConverter: OrnateNumberConverter,
		private readonly reference: CompiledVerseReference,
		private readonly stripTashkeelFn: (text: string) => string
	) {}

	format(ayahs: readonly Ayah[], options: FormattingOptions): string {
		if (ayahs.length === 0) return "";
		const formatted = ayahs.map((a) => {
			const text = options.stripTashkeelOnOutput ? this.stripTashkeelFn(a.text) : a.text;
			return `${text} (${a.ayahId})`;
		});
		const core = `${options.wrapperStart} ${formatted.join(" ")} ${options.wrapperEnd}`;
		const finalCore = options.useOrnateNumbers ? this.ornateConverter.applyOrnateNumbers(core) : core;

		const first = ayahs[0];
		const last = ayahs[ayahs.length - 1];
		const reference = ` ${this.reference.format(first.surahName, first.ayahId, last.ayahId)}`;
		return finalCore + reference;
	}
}

```

## domain\value-objects\VerseReference.ts

```typescript
/**
 * v1 declared a `referenceFormat` setting ("[Surah:Verse]") but every
 * regex and every formatted output string hardcoded literal `[`, `:`,
 * `]` — the setting was pure decoration. This value object is the fix:
 * `compile()` turns a template containing the `{surah}` and `{verse}`
 * placeholders into BOTH a parser and a formatter, so changing the
 * template in Settings changes what the plugin recognizes on a line and
 * what it writes, everywhere, from one source of truth.
 */

const SURAH_PLACEHOLDER = "{surah}";
const VERSE_PLACEHOLDER = "{verse}";

export interface VerseReferenceMatch {
	surahName: string;
	startAyah: number;
	endAyah: number;
	/** The full matched substring, e.g. "[البقرة:255]". */
	matchText: string;
	/** Character offset of the match within the searched text. */
	index: number;
}

export interface CompiledVerseReference {
	/** First match anywhere in `text`, or null. */
	find(text: string): VerseReferenceMatch | null;
	/** Every non-overlapping match in `text`. */
	findAll(text: string): VerseReferenceMatch[];
	/** True if `text` contains at least one reference. */
	test(text: string): boolean;
	/** Build the reference string for a surah name + ayah (or ayah range). */
	format(surahName: string, startAyah: number, endAyah: number): string;
	/** Remove every reference in `text` (and one preceding whitespace
	 *  character per match, matching v1's "remove reference" behavior). */
	strip(text: string): string;
}

function escapeRegex(literal: string): string {
	return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class VerseReference {
	static compile(template: string): CompiledVerseReference {
		const surahIdx = template.indexOf(SURAH_PLACEHOLDER);
		const verseIdx = template.indexOf(VERSE_PLACEHOLDER);
		if (surahIdx === -1 || verseIdx === -1) {
			throw new Error(
				`referenceFormat "${template}" must contain both ${SURAH_PLACEHOLDER} and ${VERSE_PLACEHOLDER}`
			);
		}
		const surahFirst = surahIdx < verseIdx;

		const before = template.slice(0, Math.min(surahIdx, verseIdx));
		const between = surahFirst
			? template.slice(surahIdx + SURAH_PLACEHOLDER.length, verseIdx)
			: template.slice(verseIdx + VERSE_PLACEHOLDER.length, surahIdx);
		const after = template.slice(
			Math.max(surahIdx, verseIdx) + (surahFirst ? VERSE_PLACEHOLDER.length : SURAH_PLACEHOLDER.length)
		);

		// Arabic-letter run for the surah name, digit(s) + optional "-digit(s)" for the ayah/range.
		const surahGroup = "([\\u0600-\\u06FF\\s]+)";
		const verseGroup = "(\\d+)(?:-(\\d+))?";

		const source = surahFirst
			? `${escapeRegex(before)}${surahGroup}${escapeRegex(between)}${verseGroup}${escapeRegex(after)}`
			: `${escapeRegex(before)}${verseGroup}${escapeRegex(between)}${surahGroup}${escapeRegex(after)}`;

		function toMatch(m: RegExpExecArray): VerseReferenceMatch {
			const surahName = (surahFirst ? m[1] : m[3]).trim();
			const startAyah = parseInt(surahFirst ? m[2] : m[1], 10);
			const endAyahRaw = surahFirst ? m[3] : m[2];
			return {
				surahName,
				startAyah,
				endAyah: endAyahRaw ? parseInt(endAyahRaw, 10) : startAyah,
				matchText: m[0],
				index: m.index,
			};
		}

		return {
			find(text: string): VerseReferenceMatch | null {
				const m = new RegExp(source).exec(text);
				return m ? toMatch(m) : null;
			},
			findAll(text: string): VerseReferenceMatch[] {
				const rx = new RegExp(source, "g");
				const out: VerseReferenceMatch[] = [];
				let m: RegExpExecArray | null;
				while ((m = rx.exec(text)) !== null) {
					out.push(toMatch(m));
					if (m[0].length === 0) rx.lastIndex++; // guard against zero-width loops
				}
				return out;
			},
			test(text: string): boolean {
				return new RegExp(source).test(text);
			},
			format(surahName: string, startAyah: number, endAyah: number): string {
				const verseStr = startAyah === endAyah ? `${startAyah}` : `${startAyah}-${endAyah}`;
				return template.replace(SURAH_PLACEHOLDER, surahName).replace(VERSE_PLACEHOLDER, verseStr);
			},
			strip(text: string): string {
				const rx = new RegExp(`\\s*(?:${source})`, "g");
				return text.replace(rx, "");
			},
		};
	}
}

```

## infrastructure\http\HttpTafsirRepository.ts

```typescript
import { requestUrl } from "obsidian";
import type { TafsirBook } from "../../domain/entities/TafsirBook";
import type { TafsirRepository } from "../../domain/ports/TafsirRepository";

interface TafsirApiResponse {
	data?: string;
}

export class HttpTafsirRepository implements TafsirRepository {
	private readonly cache = new Map<string, string>();

	async fetchTafsir(book: TafsirBook, surahId: number, ayahId: number): Promise<string> {
		const key = `${book.id}_${surahId}_${ayahId}`;
		const cached = this.cache.get(key);
		if (cached !== undefined) return cached;

		const url = book.urlTemplate
			.replace("{bookId}", encodeURIComponent(book.id))
			.replace("{surahId}", String(surahId))
			.replace("{ayahId}", String(ayahId));

		const response = await requestUrl({ url });
		if (response.status === 200 && response.json) {
			const json = response.json as TafsirApiResponse;
			if (json.data) {
				const text = String(json.data);
				this.cache.set(key, text);
				return text;
			}
		}
		return "";
	}
}
```

## infrastructure\memory\InMemoryInsertionMemento.ts

```typescript
import type { InsertionMemento, InsertionMementoStore } from "../../domain/ports/InsertionMemento";

export class InMemoryInsertionMemento implements InsertionMementoStore {
	private current: InsertionMemento | null = null;

	get(): InsertionMemento | null {
		return this.current;
	}

	set(memento: InsertionMemento | null): void {
		this.current = memento;
	}
}

```

## infrastructure\obsidian\ObsidianAyahNoteRepository.ts

```typescript
import { TFile, TFolder, normalizePath } from "obsidian";
import type { App } from "obsidian";
import type { ReflectionCategory } from "../../domain/entities/ReflectionCategory";
import type {
	AyahIdentity,
	AyahNoteRef,
	AyahNoteRepository,
	ReflectionEntryFormatting,
} from "../../domain/ports/AyahNoteRepository";
import { HeadingSectionInserter } from "../../domain/services/HeadingSectionInserter";
import { ReflectionFileNameBuilder } from "../../domain/services/ReflectionFileNameBuilder";

function sanitizeFileNameSegment(segment: string): string {
	return segment.replace(/[\\/:*?"<>|]/g, "").trim();
}

/** Everything this adapter needs from settings, read live (not captured
 *  at construction) so a Settings-tab change takes effect on the very
 *  next write without a full services rebuild. */
export interface AyahNoteSettingsSource {
	ayahNotesFolder: string;
	reflectionFileNameAyahTextMaxLength: number;
}

export class ObsidianAyahNoteRepository implements AyahNoteRepository {
	constructor(private readonly app: App, private readonly getSettings: () => AyahNoteSettingsSource) {}

	async appendEntry(
		identity: AyahIdentity,
		ancestorChain: readonly ReflectionCategory[],
		entryMarkdown: string,
		formatting: ReflectionEntryFormatting
	): Promise<AyahNoteRef> {
		const leaf = ancestorChain[ancestorChain.length - 1];
		if (leaf.organizationMode === "ownFolder") {
			return this.appendToOwnFolderNote(identity, ancestorChain, entryMarkdown, formatting);
		}
		return this.appendToUnifiedNote(identity, ancestorChain, entryMarkdown, formatting);
	}

	async linkRelatedAyat(
		identity: AyahIdentity,
		fileNameTemplate: string,
		includeAyahText: boolean,
		relatedNoteTitles: readonly string[]
	): Promise<AyahNoteRef> {
		const file = await this.findOrCreateUnifiedNote(identity, fileNameTemplate, includeAyahText);
		await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			const existing = Array.isArray(fm.relatedAyat) ? (fm.relatedAyat as string[]) : [];
			const merged = new Set(existing);
			for (const title of relatedNoteTitles) merged.add(`[[${title}]]`);
			fm.relatedAyat = Array.from(merged);
		});
		return { title: file.basename };
	}

	async resolveUnifiedNoteTitle(
		identity: AyahIdentity,
		fileNameTemplate: string,
		includeAyahText: boolean,
		createIfMissing: boolean
	): Promise<string | null> {
		if (!createIfMissing) {
			return this.findExistingUnifiedFile(identity.surahId, identity.ayahId)?.basename ?? null;
		}
		const file = await this.findOrCreateUnifiedNote(identity, fileNameTemplate, includeAyahText);
		return file.basename;
	}

	// --- unified note ---

	private async appendToUnifiedNote(
		identity: AyahIdentity,
		ancestorChain: readonly ReflectionCategory[],
		entryMarkdown: string,
		formatting: ReflectionEntryFormatting
	): Promise<AyahNoteRef> {
		const file = await this.findOrCreateUnifiedNote(identity, formatting.fileNameTemplate, formatting.includeAyahText);
		await this.ensureAncestorHeadings(file, ancestorChain);
		const leaf = ancestorChain[ancestorChain.length - 1];
		const parent = ancestorChain.length > 1 ? ancestorChain[ancestorChain.length - 2] : null;
		await this.app.vault.process(file, (current) =>
			HeadingSectionInserter.insertEntry(
				current,
				{
					headingLevel: leaf.headingLevel,
					headingText: leaf.headingText,
					parentHeadingLevel: parent?.headingLevel ?? null,
					parentHeadingText: parent?.headingText ?? null,
					insertionMode: formatting.insertionMode,
					separator: formatting.entrySeparator,
				},
				entryMarkdown
			)
		);
		return { title: file.basename };
	}

	private async ensureAncestorHeadings(file: TFile, chain: readonly ReflectionCategory[]): Promise<void> {
		for (let i = 0; i < chain.length; i++) {
			const node = chain[i];
			const parent = i > 0 ? chain[i - 1] : null;
			await this.app.vault.process(file, (current) =>
				HeadingSectionInserter.ensureHeadingExists(
					current,
					node.headingLevel,
					node.headingText,
					parent?.headingLevel ?? null,
					parent?.headingText ?? null
				)
			);
		}
	}

	private findExistingUnifiedFile(surahId: number, ayahId: number): TFile | null {
		const folder = this.app.vault.getAbstractFileByPath(normalizePath(this.getSettings().ayahNotesFolder));
		if (!(folder instanceof TFolder)) return null;
		for (const child of folder.children) {
			if (!(child instanceof TFile) || child.extension !== "md") continue;
			const fm = this.app.metadataCache.getFileCache(child)?.frontmatter;
			if (fm?.surahId === surahId && fm?.ayah === ayahId) return child;
		}
		return null;
	}

	private async findOrCreateUnifiedNote(identity: AyahIdentity, fileNameTemplate: string, includeAyahText: boolean): Promise<TFile> {
		const existing = this.findExistingUnifiedFile(identity.surahId, identity.ayahId);
		if (existing) return existing;

		const settings = this.getSettings();
		await this.ensureFolder(settings.ayahNotesFolder);
		const title = new ReflectionFileNameBuilder(fileNameTemplate, settings.reflectionFileNameAyahTextMaxLength).build(
			identity.surahName,
			identity.ayahId,
			identity.ayahTextRaw
		);
		const path = this.uniquePath(settings.ayahNotesFolder, title);
		const frontmatter = [
			"---",
			`surah: "${identity.surahName}"`,
			`surahId: ${identity.surahId}`,
			`ayah: ${identity.ayahId}`,
			"relatedAyat: []",
			"---",
			"",
			"",
		].join("\n");
		const body = includeAyahText ? `${identity.ayahTextBodyFormatted}\n\n` : "";
		return this.app.vault.create(path, `${frontmatter}${body}`);
	}

	// --- own-folder note (opt-in per category) ---

	private async appendToOwnFolderNote(
		identity: AyahIdentity,
		ancestorChain: readonly ReflectionCategory[],
		entryMarkdown: string,
		formatting: ReflectionEntryFormatting
	): Promise<AyahNoteRef> {
		const category = ancestorChain[ancestorChain.length - 1];
		const unified = await this.findOrCreateUnifiedNote(identity, formatting.fileNameTemplate, formatting.includeAyahText);
		const ownFile = await this.findOrCreateOwnFolderNote(category, identity, formatting.fileNameTemplate, unified.basename);

		await this.app.vault.process(ownFile, (current) => {
			const trimmed = current.replace(/\s+$/, "");
			return trimmed.length > 0 ? `${trimmed}${formatting.entrySeparator}${entryMarkdown}\n` : `${entryMarkdown}\n`;
		});

		// Keep the unified note as "the reference": ensure a single link
		// line to the own-folder note sits under this category's heading
		// there too (idempotent — safe to call on every entry).
		await this.ensureAncestorHeadings(unified, ancestorChain);
		const parent = ancestorChain.length > 1 ? ancestorChain[ancestorChain.length - 2] : null;
		await this.app.vault.process(unified, (current) =>
			HeadingSectionInserter.ensureLinkLine(
				current,
				{
					headingLevel: category.headingLevel,
					headingText: category.headingText,
					parentHeadingLevel: parent?.headingLevel ?? null,
					parentHeadingText: parent?.headingText ?? null,
					insertionMode: "afterHeading",
					separator: formatting.entrySeparator,
				},
				`[[${ownFile.basename}]]`
			)
		);

		return { title: ownFile.basename };
	}

	private findExistingOwnFolderFile(category: ReflectionCategory, surahId: number, ayahId: number): TFile | null {
		const folder = this.app.vault.getAbstractFileByPath(normalizePath(category.folder));
		if (!(folder instanceof TFolder)) return null;
		for (const child of folder.children) {
			if (!(child instanceof TFile) || child.extension !== "md") continue;
			const fm = this.app.metadataCache.getFileCache(child)?.frontmatter;
			if (fm?.surahId === surahId && fm?.ayah === ayahId && fm?.category === category.id) return child;
		}
		return null;
	}

	private async findOrCreateOwnFolderNote(
		category: ReflectionCategory,
		identity: AyahIdentity,
		fileNameTemplate: string,
		unifiedTitle: string
	): Promise<TFile> {
		const existing = this.findExistingOwnFolderFile(category, identity.surahId, identity.ayahId);
		if (existing) return existing;

		const settings = this.getSettings();
		await this.ensureFolder(category.folder);
		const title = new ReflectionFileNameBuilder(fileNameTemplate, settings.reflectionFileNameAyahTextMaxLength).build(
			identity.surahName,
			identity.ayahId,
			identity.ayahTextRaw
		);
		const path = this.uniquePath(category.folder, title);
		const frontmatter = [
			"---",
			`surah: "${identity.surahName}"`,
			`surahId: ${identity.surahId}`,
			`ayah: ${identity.ayahId}`,
			`category: ${category.id}`,
			`ayahNote: "[[${unifiedTitle}]]"`,
			"---",
			"",
			"",
		].join("\n");
		return this.app.vault.create(path, frontmatter);
	}

	// --- shared file helpers (same as v1's ObsidianReflectionFileRepository) ---

	private uniquePath(folderPath: string, title: string): string {
		const base = sanitizeFileNameSegment(title) || "آية";
		let candidate = normalizePath(`${folderPath}/${base}.md`);
		let suffix = 2;
		while (this.app.vault.getAbstractFileByPath(candidate)) {
			candidate = normalizePath(`${folderPath}/${base} (${suffix}).md`);
			suffix++;
		}
		return candidate;
	}

	private async ensureFolder(folderPath: string): Promise<void> {
		const normalized = normalizePath(folderPath);
		if (this.app.vault.getAbstractFileByPath(normalized)) return;

		const segments = normalized.split("/").filter(Boolean);
		let current = "";
		for (const segment of segments) {
			current = current ? `${current}/${segment}` : segment;
			if (!this.app.vault.getAbstractFileByPath(current)) {
				try {
					await this.app.vault.createFolder(current);
				} catch {
					// Benign race
				}
			}
		}
	}
}

```

## infrastructure\obsidian\ObsidianEditorAdapter.ts

```typescript
import type { Editor } from "obsidian";
import type { CursorAnchor, EditorPort, EditorPosition } from "../../domain/ports/EditorPort";

/** Obsidian's public `Editor` type doesn't declare `cm`, but the
 *  underlying CodeMirror instance is reachable at runtime (v1 relied on
 *  this too) to get one grouped undo step instead of two. Scoped to this
 *  single adapter method so nothing above infrastructure ever touches
 *  CodeMirror directly. */
interface EditorWithCm extends Editor {
	cm?: {
		dispatch: (tx: { changes: { from: number; to: number; insert: string }; userEvent: string }) => void;
	};
}

export class ObsidianEditorAdapter implements EditorPort {
	constructor(private readonly editor: Editor) {}

	getCursor(anchor: CursorAnchor = "head"): EditorPosition {
		const pos = this.editor.getCursor(anchor);
		return { line: pos.line, ch: pos.ch };
	}

	getLine(line: number): string {
		return this.editor.getLine(line);
	}

	lineCount(): number {
		return this.editor.lineCount();
	}

	setLine(line: number, text: string): void {
		this.editor.setLine(line, text);
	}

	replaceRange(text: string, from: EditorPosition, to: EditorPosition): void {
		const editor = this.editor as EditorWithCm;
		if (editor.cm && typeof editor.cm.dispatch === "function" && typeof editor.posToOffset === "function") {
			const fromOffset = editor.posToOffset(from);
			const toOffset = editor.posToOffset(to);
			editor.cm.dispatch({ changes: { from: fromOffset, to: toOffset, insert: text }, userEvent: "input" });
			return;
		}
		this.editor.replaceRange(text, from, to);
	}

	getSelection(): string {
		return this.editor.getSelection();
	}

	getValue(): string {
		return this.editor.getValue();
	}
}
```

## infrastructure\obsidian\ObsidianNoticeAdapter.ts

```typescript
import { Notice } from "obsidian";
import type { NoticePort } from "../../domain/ports/NoticePort";

export class ObsidianNoticeAdapter implements NoticePort {
	show(message: string): void {
		new Notice(message);
	}
}

```

## infrastructure\obsidian\ObsidianQuranRepository.ts

```typescript
import type { Vault } from "obsidian";
import type { Ayah } from "../../domain/entities/Ayah";
import type { QuranRepository } from "../../domain/ports/QuranRepository";
import type { ArabicNormalizer } from "../../domain/services/ArabicNormalizer";
import sampleCorpus from "../../../data/ayahs.json";

interface RawAyah {
	surah_id: number;
	ayah_id: number;
	surah_name: string;
	text: string;
	page?: number;
}

export class ObsidianQuranRepository implements QuranRepository {
	private ayahs: Ayah[] = [];
	private searchCorpusText = "";

	constructor(private readonly vault: Vault, private readonly normalizer: ArabicNormalizer) {
		void this.vault;
	}

	async loadAll(): Promise<void> {
		if (this.ayahs.length > 0) return;

		const raw: RawAyah[] = Array.isArray(sampleCorpus)
			? sampleCorpus
			: (sampleCorpus as { ayahs: RawAyah[] }).ayahs;

		this.ayahs = raw.map((a, index) => ({
			id: index + 1,
			surahId: a.surah_id,
			ayahId: a.ayah_id,
			surahName: a.surah_name,
			text: a.text,
		}));

		this.searchCorpusText = this.ayahs
			.map((a) => this.normalizer.normalizeForSearch(a.text))
			.join(" @@@ ");
	}

	getAllAyahs(): readonly Ayah[] {
		return this.ayahs;
	}

	getSearchCorpusText(): string {
		return this.searchCorpusText;
	}

	findSurahByName(normalizedSurahName: string): { id: number; name: string } | null {
		const sample = this.ayahs.find((a) => this.normalizer.normalizeForSearch(a.surahName) === normalizedSurahName);
		return sample ? { id: sample.surahId, name: sample.surahName } : null;
	}

	findAyah(surahId: number, ayahId: number): Ayah | null {
		return this.ayahs.find((a) => a.surahId === surahId && a.ayahId === ayahId) ?? null;
	}
}
```

## infrastructure\obsidian\ObsidianReflectionFileRepository.ts

```typescript
import { TFile, TFolder, normalizePath } from "obsidian";
import type { App } from "obsidian";
import type { ReflectionCategory } from "../../domain/entities/ReflectionCategory";
import type { ReflectionFileEntry, ReflectionFileRepository } from "../../domain/ports/ReflectionFileRepository";

function sanitizeFileNameSegment(segment: string): string {
	return segment.replace(/[\\/:*?"<>|]/g, "").trim();
}

export class ObsidianReflectionFileRepository implements ReflectionFileRepository {
	constructor(private readonly app: App) {}

	async appendEntry(category: ReflectionCategory, entry: ReflectionFileEntry): Promise<void> {
		await this.ensureFolder(category.folder);

		const existing = this.findExistingFile(category.folder, entry.surahId, entry.ayahId);
		if (existing) {
			await this.app.vault.process(existing, (current) => {
				return `${current.trim()}\n\n---\n\n${entry.entryMarkdown}\n`;
			});
			return;
		}

		const path = this.uniquePath(category.folder, entry.fileTitle);
		const frontmatter = [
			"---",
			`surah: "${entry.surahName}"`,
			`surahId: ${entry.surahId}`,
			`ayah: ${entry.ayahId}`,
			`category: ${category.id}`,
			"---",
			"",
			"",
		].join("\n");
		await this.app.vault.create(path, `${frontmatter}${entry.entryMarkdown}\n`);
	}

	private findExistingFile(folderPath: string, surahId: number, ayahId: number): TFile | null {
		const folder = this.app.vault.getAbstractFileByPath(normalizePath(folderPath));
		if (!(folder instanceof TFolder)) return null;
		for (const child of folder.children) {
			if (!(child instanceof TFile) || child.extension !== "md") continue;
			const frontmatter = this.app.metadataCache.getFileCache(child)?.frontmatter;
			if (frontmatter?.surahId === surahId && frontmatter?.ayah === ayahId) return child;
		}
		return null;
	}

	private uniquePath(folderPath: string, title: string): string {
		const base = sanitizeFileNameSegment(title) || "تدبر";
		let candidate = normalizePath(`${folderPath}/${base}.md`);
		let suffix = 2;
		while (this.app.vault.getAbstractFileByPath(candidate)) {
			candidate = normalizePath(`${folderPath}/${base} (${suffix}).md`);
			suffix++;
		}
		return candidate;
	}

	private async ensureFolder(folderPath: string): Promise<void> {
		const normalized = normalizePath(folderPath);
		if (this.app.vault.getAbstractFileByPath(normalized)) return;

		const segments = normalized.split("/").filter(Boolean);
		let current = "";
		for (const segment of segments) {
			current = current ? `${current}/${segment}` : segment;
			if (!this.app.vault.getAbstractFileByPath(current)) {
				try {
					await this.app.vault.createFolder(current);
				} catch {
					// Benign race
				}
			}
		}
	}
}
```

## infrastructure\obsidian\QuranHighlightExtension.ts

```typescript
import { Decoration, MatchDecorator, ViewPlugin } from "@codemirror/view";
import type { DecorationSet, EditorView, ViewUpdate } from "@codemirror/view";
import type { PluginConfig } from "../../config/types";

const HIGHLIGHT_CLASS = "cm-quran-key-text";
const ORNATE_NUMBER_CLASS = "quran-key-ornate-number";
const ARABIC_INDIC_DIGITS = "\u0660-\u0669";

function escapeRegex(literal: string): string {
	return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function createQuranHighlightExtension(wrapperStart: string, wrapperEnd: string) {
	const pattern = new RegExp(`${escapeRegex(wrapperStart)}.*?${escapeRegex(wrapperEnd)}`, "g");
	const decorator = new MatchDecorator({
		regexp: pattern,
		decoration: Decoration.mark({ class: HIGHLIGHT_CLASS }),
	});

	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;
			constructor(view: EditorView) {
				this.decorations = decorator.createDeco(view);
			}
			update(update: ViewUpdate) {
				this.decorations = decorator.updateDeco(update, this.decorations);
			}
		},
		{ decorations: (v) => v.decorations }
	);
}

export function createOrnateNumberHighlightExtension(ringGlyph: string) {
	const pattern = new RegExp(`${escapeRegex(ringGlyph)}[${ARABIC_INDIC_DIGITS}]+`, "g");
	const decorator = new MatchDecorator({
		regexp: pattern,
		decoration: Decoration.mark({ class: ORNATE_NUMBER_CLASS }),
	});

	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;
			constructor(view: EditorView) {
				this.decorations = decorator.createDeco(view);
			}
			update(update: ViewUpdate) {
				this.decorations = decorator.updateDeco(update, this.decorations);
			}
		},
		{ decorations: (v) => v.decorations }
	);
}

export function createOrnateNumberPostProcessor(ringGlyph: string): (el: HTMLElement) => void {
	const pattern = new RegExp(`(${escapeRegex(ringGlyph)}[${ARABIC_INDIC_DIGITS}]+)`, "g");

	function walk(node: Node): void {
		if (node.nodeType === Node.TEXT_NODE) {
			const text = node.nodeValue || "";
			if (text.includes(ringGlyph)) {
				const frag = createFragment();
				let lastIndex = 0;
				let m: RegExpExecArray | null;
				while ((m = pattern.exec(text)) !== null) {
					if (m.index > lastIndex) {
						frag.appendText(text.slice(lastIndex, m.index));
					}
					frag.createSpan({ cls: ORNATE_NUMBER_CLASS, text: m[0] });
					lastIndex = m.index + m[0].length;
				}
				if (lastIndex < text.length) {
					frag.appendText(text.slice(lastIndex));
				}
				node.parentNode?.replaceChild(frag, node);
			}
		} else {
			const children = Array.from(node.childNodes);
			for (const child of children) walk(child);
		}
	}

	return walk;
}

export function createMarkdownPostProcessor(wrapperStart: string, wrapperEnd: string): (el: HTMLElement) => void {
	const pattern = new RegExp(`${escapeRegex(wrapperStart)}(.*?)${escapeRegex(wrapperEnd)}`, "g");

	function walk(node: Node): void {
		if (node.nodeType === Node.TEXT_NODE) {
			const text = node.nodeValue || "";
			if (text.includes(wrapperStart) && text.includes(wrapperEnd)) {
				const frag = createFragment();
				let lastIndex = 0;
				let m: RegExpExecArray | null;
				while ((m = pattern.exec(text)) !== null) {
					if (m.index > lastIndex) {
						frag.appendText(text.slice(lastIndex, m.index));
					}
					frag.createSpan({ cls: HIGHLIGHT_CLASS, text: `${wrapperStart}${m[1]}${wrapperEnd}` });
					lastIndex = m.index + m[0].length;
				}
				if (lastIndex < text.length) {
					frag.appendText(text.slice(lastIndex));
				}
				node.parentNode?.replaceChild(frag, node);
			}
		} else {
			const children = Array.from(node.childNodes);
			for (const child of children) walk(child);
		}
	}

	return walk;
}

export function applyStyleVariables(settings: PluginConfig): void {
	document.body.style.setProperty("--quran-key-font-family", settings.quranFontFamily);
	document.body.style.setProperty("--quran-key-font-size", `${settings.quranFontSize}em`);
	document.body.style.setProperty("--quran-key-line-height", String(settings.quranLineHeight));
	document.body.style.setProperty("--quran-key-line-height-loose", String(settings.quranLineHeight + 0.4));
	document.body.style.setProperty("--quran-key-color", settings.quranColor);
}

export function cleanupStyleVariables(): void {
	document.body.style.removeProperty("--quran-key-font-family");
	document.body.style.removeProperty("--quran-key-font-size");
	document.body.style.removeProperty("--quran-key-line-height");
	document.body.style.removeProperty("--quran-key-line-height-loose");
	document.body.style.removeProperty("--quran-key-color");
}
```

## main.ts

```typescript
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
	cleanupStyleVariables,
	createMarkdownPostProcessor,
	createOrnateNumberHighlightExtension,
	createOrnateNumberPostProcessor,
	createQuranHighlightExtension,
} from "./infrastructure/obsidian/QuranHighlightExtension";
import { HttpTafsirRepository } from "./infrastructure/http/HttpTafsirRepository";
import { InMemoryInsertionMemento } from "./infrastructure/memory/InMemoryInsertionMemento";

import type { AppServices } from "./presentation/AppServices";
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

	services!: AppServices;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.repository = new ObsidianQuranRepository(this.app.vault, new ArabicNormalizer(this.settings.normalizationRules));
		await this.repository.loadAll();

		this.refreshStyles();
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
			this.editorExtension.push(createOrnateNumberHighlightExtension(this.settings.ornateRingGlyph));
		}
		this.app.workspace.updateOptions();
	}

	private rebuildCoreServices(): void {
		const normalizer = new ArabicNormalizer(this.settings.normalizationRules);
		this.repository = new ObsidianQuranRepository(this.app.vault, normalizer);
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
		const ornateConverter = new OrnateNumberConverter(this.settings.ornateRingGlyph);
		const formatter = new VerseOutputFormatter(ornateConverter, reference, (text) => normalizer.stripTashkeel(text));
		const toggle = new ToggleSnippetView(snippetExtractor, formatter);

		const builtinBooks = builtinTafsirBooksData as unknown as TafsirBook[];
		const catalog = new TafsirCatalog(builtinBooks, this.settings.customTafsirBooks);

		const builtinReflectionCategories = builtinReflectionCategoriesData as unknown as ReflectionCategory[];
		const reflectionCatalog = new ReflectionCategoryCatalog(
			builtinReflectionCategories,
			this.settings.customReflectionCategories
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

		if (this.services) {
			Object.assign(this.services, rebuilt);
		} else {
			this.services = rebuilt;
		}
	}
}
```

## presentation\AppServices.ts

```typescript
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
}

```

## presentation\commands\CommandRegistry.ts

```typescript
import type { Editor, MarkdownView, Plugin } from "obsidian";

/** One entry per command palette action. NFR-9: adding a feature is
 *  "write a new file exporting one of these, add it to the array in
 *  registerCommands.ts" — never a change to onload() itself. */
export interface CommandDefinition {
	id: string;
	name: string;
	run: (editor: Editor, view: MarkdownView) => void | Promise<void>;
}

export function registerCommands(plugin: Plugin, definitions: readonly CommandDefinition[]): void {
	for (const def of definitions) {
		plugin.addCommand({
			id: def.id,
			name: def.name,
			editorCallback: (editor, view) => {
				void def.run(editor, view as MarkdownView);
			},
		});
	}
}

```

## presentation\commands\definitions\convertToFootnote.ts

```typescript
import type { CommandDefinition } from "../CommandRegistry";
import type { AppServices } from "../../AppServices";

export function createConvertToFootnoteCommand(services: AppServices): CommandDefinition {
	return {
		id: "convert-reference-to-footnote",
		name: "Convert Quran reference to footnote",
		run: (editor) => {
			services.useCases.convertToFootnote.execute(services.wrapEditor(editor));
		},
	};
}
```

## presentation\commands\definitions\extractContext.ts

```typescript
import type { CommandDefinition } from "../CommandRegistry";
import type { AppServices } from "../../AppServices";
import { QuranSearchModal } from "../../modals/QuranSearchModal";

/** FR-9..15: the plugin's primary "do the thing" command. */
export function createExtractContextCommand(services: AppServices): CommandDefinition {
	return {
		id: "extract-quran-context",
		name: "Extract Quran verse from context",
		run: (editor) => {
			const editorPort = services.wrapEditor(editor);
			const success = services.useCases.extract.execute(editorPort, (query, matches, start, end) => {
				new QuranSearchModal(services, editor, query, matches, start, end).open();
			});
			if (!success) {
				new QuranSearchModal(services, editor).open();
			}
		},
	};
}
```

## presentation\commands\definitions\fetchContextualTafsir.ts

```typescript
import type { CommandDefinition } from "../CommandRegistry";
import type { AppServices } from "../../AppServices";
import { TafsirBookPickerModal } from "../../modals/TafsirBookPickerModal";
import { QuranSearchModal } from "../../modals/QuranSearchModal";

/** FR-26 "current line" entry point: run context analysis first; only
 *  fall back to a manual picker if the line doesn't resolve to an ayah. */
export function createFetchContextualTafsirCommand(services: AppServices): CommandDefinition {
	return {
		id: "fetch-contextual-tafsir",
		name: "Fetch contextual tafsir for current line",
		run: async (editor) => {
			const editorPort = services.wrapEditor(editor);
			const cursor = editorPort.getCursor();
			const lineText = editorPort.getLine(cursor.line);
			const context = services.useCases.analyzeContext.execute(editorPort);

			if (context) {
				await services.useCases.fetchTafsir.execute(
					editorPort,
					lineText,
					cursor.line,
					context.surahId,
					context.surahName,
					context.startAyah,
					context.endAyah,
					services.buildTafsirOptions()
				);
				return;
			}

			new TafsirBookPickerModal(services.app, services, (chosenBooks) => {
				if (chosenBooks.length === 0) return;
				new QuranSearchModal(services, editor, "", null, null, null, async (ayahs) => {
					if (ayahs.length === 0) return;
					const first = ayahs[0];
					const last = ayahs[ayahs.length - 1];
					await services.useCases.fetchTafsir.execute(
						editorPort,
						lineText,
						cursor.line,
						first.surahId,
						first.surahName,
						first.ayahId,
						last.ayahId,
						services.buildTafsirOptions(),
						chosenBooks
					);
				}).open();
			}).open();
		},
	};
}
```

## presentation\commands\definitions\linkAyat.ts

```typescript
import type { CommandDefinition } from "../CommandRegistry";
import type { AppServices } from "../../AppServices";
import { LinkAyatModal } from "../../modals/LinkAyatModal";

export function createLinkAyatCommand(services: AppServices): CommandDefinition {
	return {
		id: "link-ayat-together",
		name: "Link related ayahs",
		run: () => {
			new LinkAyatModal(services.app, services).open();
		},
	};
}

```

## presentation\commands\definitions\linkReflection.ts

```typescript
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
		name: category ? `Log selection as ${category.name}` : `Log selection (${categoryId})`,
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
```

## presentation\commands\definitions\openGlobalSearch.ts

```typescript
import type { CommandDefinition } from "../CommandRegistry";
import type { AppServices } from "../../AppServices";
import { QuranSearchModal } from "../../modals/QuranSearchModal";

export function createOpenGlobalSearchCommand(services: AppServices): CommandDefinition {
	return {
		id: "open-quran-global-search",
		name: "Open global Quran search modal",
		run: (editor) => {
			new QuranSearchModal(services, editor).open();
		},
	};
}
```

## presentation\commands\definitions\openGlobalTafsir.ts

```typescript
import type { CommandDefinition } from "../CommandRegistry";
import type { AppServices } from "../../AppServices";
import { TafsirBookPickerModal } from "../../modals/TafsirBookPickerModal";
import { QuranSearchModal } from "../../modals/QuranSearchModal";

/** FR-26 "global" entry point: pick books first, then pick verse(s) — via
 *  the current line's context if it resolves to one, otherwise via the
 *  search modal's override mode. */
export function createOpenGlobalTafsirCommand(services: AppServices): CommandDefinition {
	return {
		id: "open-tafsir-global-modal",
		name: "Open global tafsir selection modal",
		run: (editor) => {
			new TafsirBookPickerModal(services.app, services, (chosenBooks) => {
				if (chosenBooks.length === 0) return;
				const editorPort = services.wrapEditor(editor);
				const cursor = editorPort.getCursor();
				const lineText = editorPort.getLine(cursor.line);
				const context = services.useCases.analyzeContext.execute(editorPort);

				if (context) {
					void services.useCases.fetchTafsir.execute(
						editorPort,
						lineText,
						cursor.line,
						context.surahId,
						context.surahName,
						context.startAyah,
						context.endAyah,
						services.buildTafsirOptions(),
						chosenBooks
					);
					return;
				}

				new QuranSearchModal(services, editor, "", null, null, null, async (ayahs) => {
					if (ayahs.length === 0) return;
					const first = ayahs[0];
					const last = ayahs[ayahs.length - 1];
					await services.useCases.fetchTafsir.execute(
						editorPort,
						lineText,
						cursor.line,
						first.surahId,
						first.surahName,
						first.ayahId,
						last.ayahId,
						services.buildTafsirOptions(),
						chosenBooks
					);
				}).open();
			}).open();
		},
	};
}
```

## presentation\commands\definitions\removeReference.ts

```typescript
import type { CommandDefinition } from "../CommandRegistry";
import type { AppServices } from "../../AppServices";

export function createRemoveReferenceCommand(services: AppServices): CommandDefinition {
	return {
		id: "remove-quran-reference",
		name: "Remove Quran reference from line",
		run: (editor) => {
			services.useCases.removeReference.execute(services.wrapEditor(editor));
		},
	};
}
```

## presentation\commands\definitions\stripTashkeel.ts

```typescript
import type { CommandDefinition } from "../CommandRegistry";
import type { AppServices } from "../../AppServices";

export function createStripTashkeelCommand(services: AppServices): CommandDefinition {
	return {
		id: "strip-tashkeel-globally",
		name: "Strip tashkeel from selection or line",
		run: (editor) => {
			services.useCases.stripTashkeel.execute(services.wrapEditor(editor));
		},
	};
}
```

## presentation\commands\registerCommands.ts

```typescript
import type { Plugin } from "obsidian";
import type { AppServices } from "../AppServices";
import { registerCommands as register } from "./CommandRegistry";
import { createOpenGlobalSearchCommand } from "./definitions/openGlobalSearch";
import { createOpenGlobalTafsirCommand } from "./definitions/openGlobalTafsir";
import { createExtractContextCommand } from "./definitions/extractContext";
import { createFetchContextualTafsirCommand } from "./definitions/fetchContextualTafsir";
import { createRemoveReferenceCommand } from "./definitions/removeReference";
import { createConvertToFootnoteCommand } from "./definitions/convertToFootnote";
import { createStripTashkeelCommand } from "./definitions/stripTashkeel";
import { createLinkReflectionCommand } from "./definitions/linkReflection";
import { createLinkAyatCommand } from "./definitions/linkAyat";

/** The plugin's full command inventory. To add a new command: write a
 *  `create*Command(services)` factory next to these (see
 *  docs/ARCHITECTURE.md §8) and add it to this array — nothing else
 *  changes. */
export function registerAllCommands(plugin: Plugin, services: AppServices): void {
	register(plugin, [
		createOpenGlobalSearchCommand(services),
		createOpenGlobalTafsirCommand(services),
		createExtractContextCommand(services),
		createFetchContextualTafsirCommand(services),
		createRemoveReferenceCommand(services),
		createConvertToFootnoteCommand(services),
		createStripTashkeelCommand(services),
		createLinkReflectionCommand(services, "tadabbur"),
		createLinkReflectionCommand(services, "athar"),
		createLinkAyatCommand(services),
	]);
}

```

## presentation\components\AnalyticsDashboard.ts

```typescript
import type { Ayah } from "../../domain/entities/Ayah";
import { AnalyticsCalculator } from "../../domain/services/AnalyticsCalculator";
import type { Locale } from "../../config/types";
import { t } from "../../config/strings";

export class AnalyticsDashboard {
	private readonly container: HTMLElement;
	private readonly totalEl: HTMLElement;
	private readonly mostQuotedEl: HTMLElement;
	private readonly densestEl: HTMLElement;
	private readonly locale: Locale;

	constructor(anchorEl: HTMLElement, locale: Locale) {
		this.locale = locale;
		this.container = createDiv({ cls: "quran-key-analytics-dashboard" });
		if (locale === "ar") this.container.setAttribute("dir", "rtl");

		const total = this.makeStat("analytics.total");
		const mostQuoted = this.makeStat("analytics.mostQuoted");
		const densest = this.makeStat("analytics.densest");
		this.container.append(total.wrap, mostQuoted.wrap, densest.wrap);
		this.totalEl = total.value;
		this.mostQuotedEl = mostQuoted.value;
		this.densestEl = densest.value;

		anchorEl.insertAdjacentElement("afterend", this.container);
	}

	private makeStat(labelKey: string): { wrap: HTMLElement; value: HTMLElement } {
		const wrap = createDiv({ cls: "quran-key-analytics-stat" });
		wrap.createSpan({ cls: "quran-key-analytics-label", text: t(this.locale, labelKey) });
		const value = wrap.createSpan({ cls: "quran-key-analytics-value", text: t(this.locale, "analytics.empty") });
		return { wrap, value };
	}

	update(matches: readonly Ayah[], corpus: readonly Ayah[]): void {
		const result = AnalyticsCalculator.compute(matches, corpus);
		const empty = t(this.locale, "analytics.empty");
		this.totalEl.setText(String(result.totalMatches));
		this.mostQuotedEl.setText(
			result.mostQuoted
				? `${result.mostQuoted.surahName} (${result.mostQuoted.count}, ${result.mostQuoted.densityPercent.toFixed(3)}%)`
				: empty
		);
		this.densestEl.setText(
			result.densest
				? `${result.densest.surahName} (${result.densest.densityPercent.toFixed(3)}%)`
				: empty
		);
	}

	destroy(): void {
		this.container.remove();
	}
}
```

## presentation\modals\highlightMatch.ts

```typescript
const TASHKEEL_FILLER = "[\\u064B-\\u065F\\u0670\\u06E6\\u06E5\\u06D6-\\u06DC\\u06DF-\\u06E8\\u06EA-\\u06ED\\s]*";

function escapeRegex(literal: string): string {
	return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Builds a per-character regex fragment tolerant of common Arabic
 *  spelling variants (hamza forms, ya/hamza-ya, waw/hamza-waw, ta
 *  marbuta/ha), with optional tashkeel between characters. */
function buildTolerantCharPattern(word: string): string {
	let pattern = "";
	for (const char of word) {
		if (char === "\u0627") pattern += "[\u0627\u0623\u0625\u0622\u0671\u0621\u0649]";
		else if (char === "\u064A") pattern += "[\u064A\u0626]";
		else if (char === "\u0648") pattern += "[\u0648\u0624]";
		else if (char === "\u0647") pattern += "[\u0647\u0629]";
		else pattern += escapeRegex(char);
		pattern += TASHKEEL_FILLER;
	}
	return pattern;
}

/** Safely renders `text` into `containerEl` with matches highlighted using DOM elements (no innerHTML). */
export function renderHighlightedText(
	containerEl: HTMLElement,
	text: string,
	query: string,
	normalizeForSearch: (s: string) => string
): void {
	containerEl.empty();
	if (!query || query.trim().length === 0) {
		containerEl.setText(text);
		return;
	}

	const cleanWords = normalizeForSearch(query).split(/\s+/).filter((w) => w.length > 0);
	if (cleanWords.length === 0) {
		containerEl.setText(text);
		return;
	}

	const combined = cleanWords.map(buildTolerantCharPattern).join(`${TASHKEEL_FILLER}\\s+${TASHKEEL_FILLER}`);
	let rx: RegExp;
	try {
		rx = new RegExp(combined, "g");
	} catch {
		containerEl.setText(text);
		return;
	}

	let lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = rx.exec(text)) !== null) {
		if (match.index > lastIndex) {
			containerEl.appendText(text.slice(lastIndex, match.index));
		}
		containerEl.createSpan({ cls: "quran-key-highlight", text: match[0] });
		lastIndex = match.index + match[0].length;
		if (match[0].length === 0) rx.lastIndex++;
	}

	if (lastIndex < text.length) {
		containerEl.appendText(text.slice(lastIndex));
	}
}
```

## presentation\modals\LinkAyatModal.ts

```typescript
import { Modal } from "obsidian";
import type { App } from "obsidian";
import type { Ayah } from "../../domain/entities/Ayah";
import type { AppServices } from "../AppServices";
import { t } from "../../config/strings";

/**
 * "Link ayat" command: pick 2+ ayahs (any surah, any count) that share
 * something — a repeated phrase, a theme, whatever the user has in mind —
 * and link them all together via LinkAyahsTogether. Deliberately modeled
 * on TafsirBookPickerModal (search box + checkbox list + keyboard nav +
 * explicit confirm) rather than QuranSearchModal, which is a SuggestModal
 * built to close on a *single* choice.
 */
export class LinkAyatModal extends Modal {
	private readonly selected = new Map<number, Ayah>(); // keyed by Ayah.id
	private activeIndex = 0;
	private filtered: Ayah[] = [];
	private listEl!: HTMLElement;
	private searchEl!: HTMLInputElement;
	private confirmBtn!: HTMLButtonElement;

	constructor(app: App, private readonly services: AppServices) {
		super(app);
	}

	private get locale() {
		return this.services.settings.interfaceLanguage;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass("quran-key-picker-modal");

		contentEl.createEl("h2", { text: t(this.locale, "linkAyat.title") });

		this.searchEl = contentEl.createEl("input", { type: "text", placeholder: t(this.locale, "linkAyat.placeholder") });
		this.searchEl.focus();

		this.listEl = contentEl.createDiv({ cls: "quran-key-picker-list" });
		this.filtered = [];
		this.renderList();

		this.searchEl.addEventListener("input", () => {
			const query = this.searchEl.value.trim();
			this.filtered = query.length === 0 ? [] : this.services.useCases.search.execute(query).slice(0, this.services.settings.maxSuggestionResults);
			this.activeIndex = 0;
			this.renderList();
		});

		this.renderFooter(contentEl);

		this.modalEl.addEventListener(
			"keydown",
			(evt) => {
				if (evt.key === "ArrowDown") {
					evt.preventDefault();
					if (this.filtered.length > 0) {
						this.activeIndex = (this.activeIndex + 1) % this.filtered.length;
						this.renderList();
					}
				} else if (evt.key === "ArrowUp") {
					evt.preventDefault();
					if (this.filtered.length > 0) {
						this.activeIndex = (this.activeIndex - 1 + this.filtered.length) % this.filtered.length;
						this.renderList();
					}
				} else if (evt.key === "Enter" && !evt.shiftKey) {
					evt.preventDefault();
					const ayah = this.filtered[this.activeIndex];
					if (ayah) this.toggle(ayah);
				} else if (evt.key === "Enter" && evt.shiftKey) {
					evt.preventDefault();
					this.submitAndClose();
				}
			},
			true
		);
	}

	private renderList(): void {
		this.listEl.empty();
		if (this.filtered.length === 0) {
			this.listEl.createDiv({ text: t(this.locale, "linkAyat.empty") });
			return;
		}
		this.filtered.forEach((ayah, idx) => {
			const isActive = idx === this.activeIndex;
			const isChecked = this.selected.has(ayah.id);
			const item = this.listEl.createDiv({ cls: `quran-key-picker-item${isActive ? " is-active" : ""}` });
			const right = item.createDiv({ cls: "quran-key-picker-item-right" });
			const checkbox = right.createEl("input", { type: "checkbox" });
			checkbox.checked = isChecked;
			right.createSpan({ text: ayah.text, cls: `quran-key-picker-item-name${isChecked ? " is-checked" : ""}` });
			item.createSpan({ text: `${ayah.surahName} ${ayah.ayahId}`, cls: "quran-key-modal-alias" });
			item.addEventListener("click", () => {
				this.activeIndex = idx;
				this.toggle(ayah);
				this.searchEl.focus(); // keep keyboard nav working after a mouse click — see TafsirBookPickerModal
			});
		});
	}

	private toggle(ayah: Ayah): void {
		if (this.selected.has(ayah.id)) this.selected.delete(ayah.id);
		else this.selected.set(ayah.id, ayah);
		this.renderList();
		this.updateConfirmState();
		this.renderSelectedSummary();
	}

	private selectedSummaryEl?: HTMLElement;

	private renderSelectedSummary(): void {
		if (!this.selectedSummaryEl) return;
		this.selectedSummaryEl.empty();
		if (this.selected.size === 0) return;
		this.selectedSummaryEl.createSpan({ text: t(this.locale, "linkAyat.selectedPrefix") });
		for (const ayah of this.selected.values()) {
			this.selectedSummaryEl.createSpan({ text: ` ${ayah.surahName} ${ayah.ayahId} ·`, cls: "quran-key-modal-alias" });
		}
	}

	private renderFooter(containerEl: HTMLElement): void {
		this.selectedSummaryEl = containerEl.createDiv({ cls: "quran-key-picker-hint" });
		const footer = containerEl.createDiv({ cls: "quran-key-picker-footer" });
		footer.createSpan({ text: t(this.locale, "linkAyat.hint"), cls: "quran-key-picker-hint" });
		this.confirmBtn = footer.createEl("button", { text: t(this.locale, "linkAyat.confirm"), cls: "mod-cta" });
		this.confirmBtn.addEventListener("click", () => this.submitAndClose());
		this.updateConfirmState();
	}

	private updateConfirmState(): void {
		if (!this.confirmBtn) return;
		// Needs 2+, not 1+ — linking a single ayah to nothing is a no-op (LinkAyahsTogether.execute short-circuits on this too).
		this.confirmBtn.disabled = this.selected.size < 2;
	}

	private async submitAndClose(): Promise<void> {
		if (this.selected.size < 2) return;
		const ayahs = Array.from(this.selected.values());
		this.close();
		await this.services.useCases.linkAyahsTogether.execute(
			ayahs,
			this.services.settings.reflectionFileNameTemplate,
			this.services.settings.includeAyahTextInReflectionNote,
			{
				wrapperStart: this.services.settings.wrapperStart,
				wrapperEnd: this.services.settings.wrapperEnd,
				useOrnateNumbers: this.services.settings.useOrnateNumbers,
				stripTashkeelOnOutput: this.services.settings.stripTashkeel,
			}
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

```

## presentation\modals\QuranSearchModal.ts

```typescript
import { SuggestModal } from "obsidian";
import type { Editor, EditorPosition as ObsidianEditorPosition } from "obsidian";
import type { Ayah } from "../../domain/entities/Ayah";
import type { EditorPosition } from "../../domain/ports/EditorPort";
import type { AppServices } from "../AppServices";
import { AnalyticsDashboard } from "../components/AnalyticsDashboard";
import { renderHighlightedText } from "./highlightMatch";
import { TafsirBookPickerModal } from "./TafsirBookPickerModal";
import { RangeEndSuggestModal } from "./RangeEndSuggestModal";
import type { VerseSelectHandler } from "./types";
import { t } from "../../config/strings";

function toPosition(pos: ObsidianEditorPosition): EditorPosition {
	return { line: pos.line, ch: pos.ch };
}

export class QuranSearchModal extends SuggestModal<Ayah> {
	private currentQuery = "";
	private dashboard: AnalyticsDashboard | null = null;

	constructor(
		private readonly services: AppServices,
		private readonly editor: Editor,
		private readonly initialQuery: string = "",
		private readonly preFilteredMatches: Ayah[] | null = null,
		private readonly startPos: EditorPosition | null = null,
		private readonly endPos: EditorPosition | null = null,
		private readonly onVerseSelectOverride?: VerseSelectHandler
	) {
		super(services.app);
		this.setPlaceholder(t(services.settings.interfaceLanguage, "search.placeholder"));
	}

	onOpen(): void {
		void super.onOpen();
		const { settings } = this.services;

		if (settings.showAnalytics) {
			const inputContainer = this.inputEl.parentElement;
			if (inputContainer) this.dashboard = new AnalyticsDashboard(inputContainer, settings.interfaceLanguage);
		}

		this.inputEl.addEventListener(
			"keydown",
			(evt) => {
				if (evt.key !== "Enter") return;
				const isCtrlOrMeta = evt.ctrlKey || evt.metaKey;
				const isShift = evt.shiftKey;
				if (!isCtrlOrMeta && !isShift) return;
				evt.preventDefault();
				evt.stopPropagation();
				this.handleModifiedEnter(isCtrlOrMeta);
			},
			true
		);

		if (this.initialQuery) {
			this.inputEl.value = this.initialQuery;
			this.currentQuery = this.initialQuery;
			window.setTimeout(() => this.inputEl.dispatchEvent(new Event("input")), 50);
		}
	}

	onClose(): void {
		this.dashboard?.destroy();
	}

	private handleModifiedEnter(isRangeRequest: boolean): void {
		const suggestions = this.getSuggestions(this.inputEl.value);
		if (suggestions.length === 0) return;

		const activeEl = this.containerEl.querySelector(".suggestion-item.is-selected");
		let target = suggestions[0];
		if (activeEl) {
			const allItems = Array.from(this.containerEl.querySelectorAll(".suggestion-item"));
			const idx = allItems.indexOf(activeEl);
			if (idx !== -1 && suggestions[idx]) target = suggestions[idx];
		}

		const start = this.startPos ?? toPosition(this.editor.getCursor("from"));
		const end = this.endPos ?? toPosition(this.editor.getCursor("to"));
		this.close();

		if (isRangeRequest) {
			new RangeEndSuggestModal(this.services, this.editor, target, start, end, this.onVerseSelectOverride).open();
			return;
		}

		if (this.onVerseSelectOverride) {
			void this.onVerseSelectOverride([target]);
		} else {
			this.openTafsirFlow(target, target);
		}
	}

	private openTafsirFlow(startAyah: Ayah, endAyah: Ayah): void {
		new TafsirBookPickerModal(this.services.app, this.services, (chosenBooks) => {
			if (chosenBooks.length === 0) return;
			const editorPort = this.services.wrapEditor(this.editor);
			const cursor = editorPort.getCursor();
			void this.services.useCases.fetchTafsir.execute(
				editorPort,
				editorPort.getLine(cursor.line),
				cursor.line,
				startAyah.surahId,
				startAyah.surahName,
				startAyah.ayahId,
				endAyah.ayahId,
				this.services.buildTafsirOptions(),
				chosenBooks
			);
		}).open();
	}

	getSuggestions(query: string): Ayah[] {
		this.currentQuery = query;
		const { normalizer } = this.services;
		const cleanQuery = normalizer.normalizeForSearch(query);
		const cleanInitial = this.initialQuery ? normalizer.normalizeForSearch(this.initialQuery) : "";
		const usePreFiltered =
			Boolean(this.preFilteredMatches) &&
			cleanQuery.length > 0 &&
			(cleanQuery.includes(cleanInitial) || cleanInitial.includes(cleanQuery));
		const pool = usePreFiltered && this.preFilteredMatches ? this.preFilteredMatches : undefined;

		const matches = this.services.useCases.search.execute(query, pool);
		if (this.dashboard) this.dashboard.update(matches, this.services.repository.getAllAyahs());
		return matches;
	}

	renderSuggestion(item: Ayah, el: HTMLElement): void {
		const textEl = el.createDiv({ cls: "quran-key-suggestion-text" });
		renderHighlightedText(textEl, item.text, this.currentQuery, (s) => this.services.normalizer.normalizeForSearch(s));
		el.createEl("small", {
			text: `${item.surahName} - \u0627\u0644\u0622\u064A\u0629 ${item.ayahId}`,
			cls: "quran-key-suggestion-meta",
		});
	}

	onChooseSuggestion(item: Ayah): void {
		const start = this.startPos ?? toPosition(this.editor.getCursor("from"));
		const end = this.endPos ?? toPosition(this.editor.getCursor("to"));
		if (this.onVerseSelectOverride) {
			void this.onVerseSelectOverride([item]);
			return;
		}
		this.services.useCases.extract.insertAyahs(this.services.wrapEditor(this.editor), start, end, [item], this.currentQuery);
	}
}
```

## presentation\modals\RangeEndSuggestModal.ts

```typescript
import { SuggestModal } from "obsidian";
import type { Editor } from "obsidian";
import type { Ayah } from "../../domain/entities/Ayah";
import type { EditorPosition } from "../../domain/ports/EditorPort";
import type { AppServices } from "../AppServices";
import { TafsirBookPickerModal } from "./TafsirBookPickerModal";
import type { VerseSelectHandler } from "./types";
import { ArabicNormalizer } from "../../domain/services/ArabicNormalizer";
import { t } from "../../config/strings";

export class RangeEndSuggestModal extends SuggestModal<Ayah> {
	constructor(
		private readonly services: AppServices,
		private readonly editor: Editor,
		private readonly startAyah: Ayah,
		private readonly startPos: EditorPosition,
		private readonly endPos: EditorPosition,
		private readonly onVerseSelectOverride?: VerseSelectHandler
	) {
		super(services.app);
		const locale = services.settings.interfaceLanguage;
		this.setPlaceholder(
			`${t(locale, "rangeEnd.placeholderPrefix")} ${startAyah.surahName} (${t(locale, "rangeEnd.placeholderSuffix")} ${startAyah.ayahId})`
		);
	}

	onOpen(): void {
		void super.onOpen();
		this.inputEl.addEventListener(
			"keydown",
			(evt) => {
				if (evt.key !== "Enter" || !evt.shiftKey) return;
				evt.preventDefault();
				evt.stopPropagation();

				const suggestions = this.getSuggestions(this.inputEl.value);
				if (suggestions.length === 0) return;
				const activeEl = this.containerEl.querySelector(".suggestion-item.is-selected");
				let endAyah = suggestions[0];
				if (activeEl) {
					const allItems = Array.from(this.containerEl.querySelectorAll(".suggestion-item"));
					const idx = allItems.indexOf(activeEl);
					if (idx !== -1 && suggestions[idx]) endAyah = suggestions[idx];
				}
				const rangeAyahs = this.buildRange(endAyah);
				this.close();

				if (this.onVerseSelectOverride) {
					void this.onVerseSelectOverride(rangeAyahs);
					return;
				}
				this.openTafsirFlow(rangeAyahs);
			},
			true
		);
	}

	private buildRange(endAyah: Ayah): Ayah[] {
		return this.services.repository
			.getAllAyahs()
			.filter(
				(a) => a.surahId === this.startAyah.surahId && a.ayahId >= this.startAyah.ayahId && a.ayahId <= endAyah.ayahId
			);
	}

	private openTafsirFlow(rangeAyahs: Ayah[]): void {
		if (rangeAyahs.length === 0) return;
		new TafsirBookPickerModal(this.services.app, this.services, (chosenBooks) => {
			if (chosenBooks.length === 0) return;
			const editorPort = this.services.wrapEditor(this.editor);
			const cursor = editorPort.getCursor();
			const first = rangeAyahs[0];
			const last = rangeAyahs[rangeAyahs.length - 1];
			void this.services.useCases.fetchTafsir.execute(
				editorPort,
				editorPort.getLine(cursor.line),
				cursor.line,
				first.surahId,
				first.surahName,
				first.ayahId,
				last.ayahId,
				this.services.buildTafsirOptions(),
				chosenBooks
			);
		}).open();
	}

	getSuggestions(query: string): Ayah[] {
		const pool = this.services.repository
			.getAllAyahs()
			.filter((a) => a.surahId === this.startAyah.surahId && a.ayahId >= this.startAyah.ayahId);
		if (!query || query.trim() === "") return pool.slice(0, this.services.settings.maxSuggestionResults);

		const cleanQuery = this.services.normalizer.normalizeForSearch(query);
		const numericQuery = ArabicNormalizer.normalizeNumbers(query);
		return pool
			.filter(
				(a) =>
					a.ayahId.toString().includes(numericQuery) ||
					this.services.normalizer.normalizeForSearch(a.text).includes(cleanQuery)
			)
			.slice(0, this.services.settings.maxSuggestionResults);
	}

	renderSuggestion(item: Ayah, el: HTMLElement): void {
		const textEl = el.createDiv({ cls: "quran-key-suggestion-text" });
		textEl.setText(item.text);
		el.createEl("small", { text: `\u0627\u0644\u0622\u064A\u0629 ${item.ayahId}`, cls: "quran-key-suggestion-meta" });
	}

	onChooseSuggestion(endAyah: Ayah): void {
		const rangeAyahs = this.buildRange(endAyah);
		if (this.onVerseSelectOverride) {
			void this.onVerseSelectOverride(rangeAyahs);
			return;
		}
		this.services.useCases.extract.insertAyahs(this.services.wrapEditor(this.editor), this.startPos, this.endPos, rangeAyahs, "");
	}
}
```

## presentation\modals\TafsirBookPickerModal.ts

```typescript
import { Modal, Setting } from "obsidian";
import type { App, TextComponent } from "obsidian";
import type { TafsirBook } from "../../domain/entities/TafsirBook";
import type { AppServices } from "../AppServices";
import { t } from "../../config/strings";

export class TafsirBookPickerModal extends Modal {
	private readonly selected = new Set<string>();
	private activeIndex = 0;
	private filtered: TafsirBook[];
	private listEl!: HTMLElement;
	private searchEl!: HTMLInputElement;
	private confirmBtn!: HTMLButtonElement;

	constructor(
		app: App,
		private readonly services: AppServices,
		private readonly onSubmit: (books: TafsirBook[]) => void
	) {
		super(app);
		this.filtered = [...this.services.catalog.all()];
	}

	private get locale() {
		return this.services.settings.interfaceLanguage;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass("quran-key-picker-modal");

		contentEl.createEl("h2", { text: t(this.locale, "tafsir.pickerTitle") });

		this.searchEl = contentEl.createEl("input", {
			type: "text",
			placeholder: t(this.locale, "tafsir.pickerPlaceholder"),
		});
		this.searchEl.focus();

		this.listEl = contentEl.createDiv({ cls: "quran-key-picker-list" });
		this.renderList();

		this.searchEl.addEventListener("input", () => {
			this.filtered = this.services.catalog.search(this.searchEl.value);
			this.activeIndex = 0;
			this.renderList();
		});

		this.renderAddSourceForm(contentEl);
		this.renderFooter(contentEl);

		this.modalEl.addEventListener(
			"keydown",
			(evt) => {
				if (evt.key === "ArrowDown") {
					evt.preventDefault();
					if (this.filtered.length > 0) {
						this.activeIndex = (this.activeIndex + 1) % this.filtered.length;
						this.renderList();
					}
				} else if (evt.key === "ArrowUp") {
					evt.preventDefault();
					if (this.filtered.length > 0) {
						this.activeIndex = (this.activeIndex - 1 + this.filtered.length) % this.filtered.length;
						this.renderList();
					}
				} else if (evt.key === "Enter" && !evt.shiftKey) {
					evt.preventDefault();
					const book = this.filtered[this.activeIndex];
					if (book) this.toggle(book.id);
				} else if (evt.key === "Enter" && evt.shiftKey) {
					evt.preventDefault();
					this.submitAndClose();
				}
			},
			true
		);
	}

	private renderList(): void {
		this.listEl.empty();
		if (this.filtered.length === 0) {
			this.listEl.createDiv({ text: t(this.locale, "tafsir.pickerEmpty") });
			return;
		}
		this.filtered.forEach((book, idx) => {
			const isActive = idx === this.activeIndex;
			const isChecked = this.selected.has(book.id);
			const item = this.listEl.createDiv({ cls: `quran-key-picker-item${isActive ? " is-active" : ""}` });
			const right = item.createDiv({ cls: "quran-key-picker-item-right" });
			const checkbox = right.createEl("input", { type: "checkbox" });
			checkbox.checked = isChecked;
			right.createSpan({
				text: book.name,
				cls: `quran-key-picker-item-name${isChecked ? " is-checked" : ""}`,
			});
			if (book.aliases.length > 0) {
				item.createSpan({ text: book.aliases.join("\u060C "), cls: "quran-key-modal-alias" });
			}
			item.addEventListener("click", () => {
				this.activeIndex = idx;
				this.toggle(book.id);
				// `renderList()` (called from `toggle()`) empties and rebuilds every
				// list item, including whichever one the browser had just focused
				// via this click — the old node is gone, so focus silently falls
				// back to <body>. Since the keydown listener below is registered on
				// `modalEl` with `capture: true`, it only fires for descendants of
				// the *focused* element; once focus is on <body> (an ancestor of
				// modalEl, not a descendant), the listener is out of the event path
				// entirely and arrow keys fall through to the browser's default
				// (scrolling) instead of moving `activeIndex`. Re-focusing a stable
				// element inside the modal after every click keeps it fixed.
				this.searchEl.focus();
			});
		});
	}

	private toggle(bookId: string): void {
		if (this.selected.has(bookId)) this.selected.delete(bookId);
		else this.selected.add(bookId);
		this.renderList();
		this.updateConfirmState();
	}

	private renderAddSourceForm(containerEl: HTMLElement): void {
		const details = containerEl.createEl("details", { cls: "quran-key-picker-add-source" });
		details.createEl("summary", { text: t(this.locale, "tafsir.addSourceTitle") });
		const body = details.createDiv();

		let nameInput!: TextComponent;
		let aliasesInput!: TextComponent;
		let urlInput!: TextComponent;

		new Setting(body)
			.setName(t(this.locale, "tafsir.addSourceNamePlaceholder"))
			.addText((tx) => {
				nameInput = tx;
			});

		new Setting(body)
			.setName(t(this.locale, "tafsir.addSourceAliasesPlaceholder"))
			.addText((tx) => {
				aliasesInput = tx;
			});

		new Setting(body)
			.setName(t(this.locale, "tafsir.addSourceUrlPlaceholder"))
			.addText((tx) => {
				urlInput = tx;
			});

		new Setting(body).addButton((btn) =>
			btn
				.setButtonText(t(this.locale, "tafsir.addSourceButton"))
				.setCta()
				.onClick(async () => {
					const addedId = await this.addCustomSource(nameInput.getValue(), aliasesInput.getValue(), urlInput.getValue());
					if (addedId) {
						nameInput.setValue("");
						aliasesInput.setValue("");
						urlInput.setValue("");
					}
				})
		);
	}

	private async addCustomSource(name: string, aliasesRaw: string, urlTemplate: string): Promise<string | null> {
		if (!name.trim() || !urlTemplate.trim()) return null;
		const id = `custom-${name
			.trim()
			.toLowerCase()
			.replace(/\s+/g, "-")
			.replace(/[^a-z0-9\u0600-\u06ff-]/g, "")}-${Date.now().toString(36)}`;

		this.services.settings.customTafsirBooks = [
			...this.services.settings.customTafsirBooks,
			{
				id,
				name: name.trim(),
				aliases: aliasesRaw
					.split(",")
					.map((a) => a.trim())
					.filter(Boolean),
				urlTemplate: urlTemplate.trim(),
				isBuiltin: false,
			},
		];

		await this.services.saveSettings();

		this.selected.add(id);
		this.filtered = this.services.catalog.search(this.searchEl.value);
		this.renderList();
		this.updateConfirmState();
		return id;
	}

	private renderFooter(containerEl: HTMLElement): void {
		const footer = containerEl.createDiv({ cls: "quran-key-picker-footer" });
		footer.createSpan({ text: t(this.locale, "tafsir.pickerHint"), cls: "quran-key-picker-hint" });
		this.confirmBtn = footer.createEl("button", {
			text: t(this.locale, "tafsir.pickerConfirm"),
			cls: "mod-cta",
		});
		this.confirmBtn.addEventListener("click", () => this.submitAndClose());
		this.updateConfirmState();
	}

	private updateConfirmState(): void {
		if (!this.confirmBtn) return;
		this.confirmBtn.disabled = this.selected.size === 0;
	}

	private submitAndClose(): void {
		if (this.selected.size === 0) return;
		const chosen = this.services.catalog.all().filter((b) => this.selected.has(b.id));
		this.close();
		this.onSubmit(chosen);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

```

## presentation\modals\types.ts

```typescript
import type { Ayah } from "../../domain/entities/Ayah";

/** Callback used when a search/range-end modal is opened in "pick a verse
 *  for tafsir" mode instead of its default "insert a verse" mode — see
 *  QuranSearchModal's doc comment. */
export type VerseSelectHandler = (ayahs: Ayah[]) => void | Promise<void>;

```

## presentation\settings\QuranKeySettingsTab.ts

```typescript
import { PluginSettingTab, Setting } from "obsidian";
import type { App, Plugin } from "obsidian";
import type { CategoryOrganizationMode, Locale, TafsirResolutionStrategy } from "../../config/types";
import type { AppServices } from "../AppServices";
import { SETTINGS_SCHEMA, type SettingFieldDefinition } from "./SettingsSchema";

const RESOLUTION_LABELS: Record<TafsirResolutionStrategy, Record<Locale, string>> = {
	explicit: { ar: "اختيار صريح من قائمة", en: "Explicit picker choice" },
	lineAliases: { ar: "أسماء مذكورة في السطر", en: "Names mentioned on the line" },
	favorites: { ar: "الكتب المفضلة", en: "Favorite books" },
	default: { ar: "الكتاب الافتراضي", en: "Default book" },
};

export class QuranKeySettingsTab extends PluginSettingTab {
	constructor(app: App, plugin: Plugin, private readonly services: AppServices) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const locale = this.services.settings.interfaceLanguage;

		for (const section of SETTINGS_SCHEMA) {
			new Setting(containerEl).setName(section.heading[locale]).setHeading();
			for (const field of section.fields) this.renderField(containerEl, field, locale);
		}

		new Setting(containerEl).setName(locale === "ar" ? "تخصيص كتب التفسير" : "Tafsir book options").setHeading();
		this.renderDefaultTafsirBook(containerEl, locale);
		this.renderFavorites(containerEl, locale);
		this.renderCustomBooks(containerEl, locale);
		this.renderResolutionOrder(containerEl, locale);

		new Setting(containerEl).setName(locale === "ar" ? "تصنيفات الملاحظات" : "Note categories").setHeading();
		this.renderReflectionCategories(containerEl, locale);

		new Setting(containerEl).setName(locale === "ar" ? "قواعد التطبيع" : "Normalization").setHeading();
		this.renderNormalizationRules(containerEl, locale);

		new Setting(containerEl).setName(locale === "ar" ? "إعدادات متقدمة" : "Advanced").setHeading();
		this.renderAdvancedTunables(containerEl, locale);
	}

	private async save(): Promise<void> {
		await this.services.saveSettings();
	}

	private renderField(containerEl: HTMLElement, field: SettingFieldDefinition, locale: Locale): void {
		const settings = this.services.settings as unknown as Record<string, unknown>;
		const setting = new Setting(containerEl).setName(field.label[locale]).setDesc(field.description[locale]);

		switch (field.type) {
			case "toggle":
				setting.addToggle((toggle) =>
					toggle.setValue(Boolean(settings[field.key])).onChange(async (value) => {
						settings[field.key] = value;
						await this.save();
					})
				);
				break;
			case "text":
				setting.addText((text) =>
					text.setValue(String(settings[field.key])).onChange(async (value) => {
						settings[field.key] = value;
						await this.save();
					})
				);
				break;
			case "textarea":
				setting.addTextArea((textarea) => {
					textarea.setValue(String(settings[field.key])).onChange(async (value) => {
						settings[field.key] = value;
						await this.save();
					});
					textarea.inputEl.rows = 6;
					textarea.inputEl.addClass("quran-key-settings-textarea");
				});
				break;
			case "dropdown":
				setting.addDropdown((dropdown) => {
					for (const opt of field.dropdownOptions ?? []) dropdown.addOption(opt.value, opt.label);
					dropdown.setValue(String(settings[field.key]));
					dropdown.onChange(async (value) => {
						settings[field.key] = value;
						await this.save();
					});
				});
				break;
			case "slider":
				setting.addSlider((slider) => {
					const { min, max, step } = field.slider ?? { min: 0, max: 1, step: 0.1 };
					slider
						.setLimits(min, max, step)
						.setValue(Number(settings[field.key]))
						.onChange(async (value) => {
							settings[field.key] = value;
							await this.save();
						});
				});
				break;
			case "color":
				setting.addColorPicker((picker) =>
					picker.setValue(String(settings[field.key])).onChange(async (value) => {
						settings[field.key] = value;
						await this.save();
					})
				);
				break;
		}
	}

	private renderDefaultTafsirBook(containerEl: HTMLElement, locale: Locale): void {
		new Setting(containerEl)
			.setName(locale === "ar" ? "الكتاب الافتراضي" : "Default tafsir book")
			.setDesc(
				locale === "ar"
					? "يُستخدم إذا لم تُحلّ أي خطوة أعلاه في ترتيب الأولوية أدناه."
					: "Used when no earlier step in the resolution order below resolves."
			)
			.addDropdown((dropdown) => {
				for (const book of this.services.catalog.all()) dropdown.addOption(book.id, book.name);
				dropdown.setValue(this.services.settings.defaultTafsirBookId);
				dropdown.onChange(async (value) => {
					this.services.settings.defaultTafsirBookId = value;
					await this.save();
				});
			});
	}

	private renderFavorites(containerEl: HTMLElement, locale: Locale): void {
		const section = containerEl.createEl("details");
		section.createEl("summary", { text: locale === "ar" ? "كتب التفسير المفضلة" : "Favorite tafsir books" });
		const list = section.createDiv();
		for (const book of this.services.catalog.all()) {
			new Setting(list).setName(book.name).addToggle((toggle) =>
				toggle.setValue(this.services.settings.favoriteBooksIds.includes(book.id)).onChange(async (value) => {
					const set = new Set(this.services.settings.favoriteBooksIds);
					if (value) set.add(book.id);
					else set.delete(book.id);
					this.services.settings.favoriteBooksIds = Array.from(set);
					await this.save();
				})
			);
		}
	}

	private renderCustomBooks(containerEl: HTMLElement, locale: Locale): void {
		const list = containerEl.createDiv();
		const renderList = () => {
			list.empty();
			for (const book of this.services.settings.customTafsirBooks) {
				new Setting(list)
					.setName(book.name)
					.setDesc(book.urlTemplate)
					.addExtraButton((btn) =>
						btn.setIcon("trash").onClick(async () => {
							this.services.settings.customTafsirBooks = this.services.settings.customTafsirBooks.filter(
								(b) => b.id !== book.id
							);
							await this.save();
							renderList();
						})
					);
			}
		};
		renderList();

		let newId = "";
		let newName = "";
		let newAliases = "";
		let newUrl = "";
		new Setting(containerEl)
			.setName(locale === "ar" ? "إضافة مصدر تفسير جديد" : "Add a new tafsir source")
			.setDesc(
				locale === "ar"
					? "استخدم {bookId} و{surahId} و{ayahId} داخل الرابط — يتم استبدالها تلقائياً عند الجلب."
					: "Use {bookId}, {surahId}, {ayahId} inside the URL — substituted automatically at fetch time."
			)
			.addText((t) => t.setPlaceholder("id").onChange((v) => (newId = v)))
			.addText((t) => t.setPlaceholder(locale === "ar" ? "الاسم" : "Name").onChange((v) => (newName = v)))
			.addText((t) =>
				t.setPlaceholder(locale === "ar" ? "أسماء بديلة، مفصولة بفواصل" : "aliases, comma-separated").onChange((v) => (newAliases = v))
			)
			.addText((t) => t.setPlaceholder("https://example.com/tafsir?src={bookId}&s={surahId}&a={ayahId}").onChange((v) => (newUrl = v)))
			.addButton((btn) =>
				btn.setButtonText(locale === "ar" ? "إضافة" : "Add").onClick(async () => {
					if (!newId.trim() || !newName.trim() || !newUrl.trim()) return;
					this.services.settings.customTafsirBooks = [
						...this.services.settings.customTafsirBooks,
						{
							id: newId.trim(),
							name: newName.trim(),
							aliases: newAliases
								.split(",")
								.map((a) => a.trim())
								.filter(Boolean),
							urlTemplate: newUrl.trim(),
							isBuiltin: false,
						},
					];
					await this.save();
					this.display();
				})
			);
	}

	private renderResolutionOrder(containerEl: HTMLElement, locale: Locale): void {
		const list = containerEl.createDiv();
		const renderList = () => {
			list.empty();
			const order = this.services.settings.tafsirBookResolutionOrder;
			order.forEach((strategy, idx) => {
				const row = new Setting(list).setName(`${idx + 1}. ${RESOLUTION_LABELS[strategy]?.[locale] ?? strategy}`);
				row.addExtraButton((btn) =>
					btn
						.setIcon("arrow-up")
						.setDisabled(idx === 0)
						.onClick(async () => {
							const next = [...order];
							[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
							this.services.settings.tafsirBookResolutionOrder = next;
							await this.save();
							renderList();
						})
				);
				row.addExtraButton((btn) =>
					btn
						.setIcon("arrow-down")
						.setDisabled(idx === order.length - 1)
						.onClick(async () => {
							const next = [...order];
							[next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
							this.services.settings.tafsirBookResolutionOrder = next;
							await this.save();
							renderList();
						})
				);
			});
		};
		renderList();
	}

	/** Each category is (id, name, organizationMode, heading level+text,
	 *  parent category, folder — the last relevant only for "ownFolder").
	 *  تدبر/أثر are builtin (not deletable, but every other field —
	 *  including organizationMode — is still editable: a user who wants
	 *  تدبر to live in its own folder can flip it here). */
	private renderReflectionCategories(containerEl: HTMLElement, locale: Locale): void {
		const list = containerEl.createDiv();
		const allCategories = () => [...this.services.reflectionCatalog.all()];

		const patchCategory = (id: string, patch: Partial<(typeof this.services.settings.customReflectionCategories)[number]>) => {
			const builtin = allCategories().find((c) => c.id === id && c.isBuiltin);
			const custom = this.services.settings.customReflectionCategories;
			const idx = custom.findIndex((c) => c.id === id);
			if (idx !== -1) {
				const next = [...custom];
				next[idx] = { ...next[idx], ...patch };
				this.services.settings.customReflectionCategories = next;
			} else if (builtin) {
				// First edit of a builtin category — record it as a custom
				// override, same override convention as TafsirCatalog (NFR-1).
				this.services.settings.customReflectionCategories = [...custom, { ...builtin, ...patch }];
			}
		};

		const renderList = () => {
			list.empty();
			for (const cat of allCategories()) {
				const details = list.createEl("details", { cls: "quran-key-picker-add-source" });
				details.createEl("summary", { text: `${cat.name}${cat.isBuiltin ? " " + (locale === "ar" ? "(أساسي)" : "(builtin)") : ""}` });
				const body = details.createDiv();

				new Setting(body)
					.setName(locale === "ar" ? "الاسم" : "Name")
					.addText((tx) =>
						tx.setValue(cat.name).onChange(async (v) => {
							patchCategory(cat.id, { name: v });
							await this.save();
						})
					);

				new Setting(body)
					.setName(locale === "ar" ? "مكان التدوين" : "Organization")
					.setDesc(
						locale === "ar"
							? "موحّد: يُكتب تحت عنوان داخل ملاحظة الآية الواحدة. مجلد مستقل: ملف خاص بهذا التصنيف لكل آية."
							: "Unified: written under a heading inside the ayah's single note. Own folder: a dedicated per-ayah file for this category."
					)
					.addDropdown((dd) => {
						dd.addOption("unified", locale === "ar" ? "موحّد" : "unified");
						dd.addOption("ownFolder", locale === "ar" ? "مجلد مستقل" : "ownFolder");
						dd.setValue(cat.organizationMode);
						dd.onChange(async (v) => {
							patchCategory(cat.id, { organizationMode: v as CategoryOrganizationMode });
							await this.save();
						});
					});

				new Setting(body)
					.setName(locale === "ar" ? "نص العنوان" : "Heading text")
					.addText((tx) =>
						tx.setValue(cat.headingText).onChange(async (v) => {
							patchCategory(cat.id, { headingText: v });
							await this.save();
						})
					);

				new Setting(body)
					.setName(locale === "ar" ? "مستوى العنوان" : "Heading level")
					.setDesc(locale === "ar" ? "مثل ### — نص حر." : "e.g. ### — free text.")
					.addText((tx) =>
						tx.setValue(cat.headingLevel).onChange(async (v) => {
							patchCategory(cat.id, { headingLevel: v });
							await this.save();
						})
					);

				new Setting(body)
					.setName(locale === "ar" ? "تصنيف أب (اختياري)" : "Parent category (optional)")
					.setDesc(
						locale === "ar"
							? "يُستخدم مرة واحدة فقط، عند إنشاء العنوان لأول مرة، لتضمينه تحت عنوان الأب."
							: "Consulted only once, when this heading is first created, to nest it under the parent's."
					)
					.addDropdown((dd) => {
						dd.addOption("", locale === "ar" ? "بلا" : "none");
						for (const other of allCategories()) {
							if (other.id === cat.id) continue;
							dd.addOption(other.id, other.name);
						}
						dd.setValue(cat.parentCategoryId ?? "");
						dd.onChange(async (v) => {
							patchCategory(cat.id, { parentCategoryId: v || null });
							await this.save();
						});
					});

				new Setting(body)
					.setName(locale === "ar" ? "المجلد (لوضع «مجلد مستقل» فقط)" : "Folder (only used in \"ownFolder\" mode)")
					.addText((tx) =>
						tx.setValue(cat.folder).onChange(async (v) => {
							patchCategory(cat.id, { folder: v });
							await this.save();
						})
					);

				if (!cat.isBuiltin) {
					new Setting(body).addExtraButton((btn) =>
						btn.setIcon("trash").onClick(async () => {
							this.services.settings.customReflectionCategories = this.services.settings.customReflectionCategories.filter(
								(c) => c.id !== cat.id
							);
							await this.save();
							renderList();
						})
					);
				}
			}
		};
		renderList();

		let newId = "";
		let newName = "";
		new Setting(containerEl)
			.setName(locale === "ar" ? "إضافة تصنيف جديد" : "Add a new category")
			.setDesc(
				locale === "ar"
					? "مثال: «فوائد عملية». بعد الإضافة، اضبط مكان التدوين والعنوان من القائمة أعلاه."
					: 'e.g. "Practical benefits". After adding, configure its organization and heading above.'
			)
			.addText((t) => t.setPlaceholder("id").onChange((v) => (newId = v)))
			.addText((t) => t.setPlaceholder(locale === "ar" ? "الاسم" : "Name").onChange((v) => (newName = v)))
			.addButton((btn) =>
				btn.setButtonText(locale === "ar" ? "إضافة" : "Add").onClick(async () => {
					if (!newId.trim() || !newName.trim()) return;
					this.services.settings.customReflectionCategories = [
						...this.services.settings.customReflectionCategories,
						{
							id: newId.trim(),
							name: newName.trim(),
							organizationMode: "unified",
							headingText: newName.trim(),
							headingLevel: "###",
							parentCategoryId: null,
							folder: "",
							isBuiltin: false,
						},
					];
					await this.save();
					renderList();
				})
			);
	}

	private renderNormalizationRules(containerEl: HTMLElement, locale: Locale): void {
		const details = containerEl.createEl("details");
		details.createEl("summary", { text: locale === "ar" ? "قواعد تطبيع النص العربي" : "Arabic normalization rules" });
		const list = details.createDiv();
		const renderList = () => {
			list.empty();
			this.services.settings.normalizationRules.forEach((rule, idx) => {
				const row = new Setting(list).setName(rule.description || rule.id).setDesc(`${rule.pattern} -> ${rule.replacement}`);
				row.addToggle((toggle) =>
					toggle.setValue(rule.enabled).onChange(async (value) => {
						const rules = [...this.services.settings.normalizationRules];
						rules[idx] = { ...rules[idx], enabled: value };
						this.services.settings.normalizationRules = rules;
						await this.save();
					})
				);
				row.addExtraButton((btn) =>
					btn.setIcon("trash").onClick(async () => {
						this.services.settings.normalizationRules = this.services.settings.normalizationRules.filter((_, i) => i !== idx);
						await this.save();
						renderList();
					})
				);
			});

			let pattern = "";
			let replacement = "";
			let description = "";
			new Setting(list)
				.setName(locale === "ar" ? "إضافة قاعدة" : "Add a rule")
				.addText((t) => t.setPlaceholder(locale === "ar" ? "النمط (بلا علامات /)" : "pattern (no slashes)").onChange((v) => (pattern = v)))
				.addText((t) => t.setPlaceholder(locale === "ar" ? "البديل" : "replacement").onChange((v) => (replacement = v)))
				.addText((t) => t.setPlaceholder(locale === "ar" ? "وصف مختصر" : "short description").onChange((v) => (description = v)))
				.addButton((btn) =>
					btn.setButtonText(locale === "ar" ? "إضافة" : "Add").onClick(async () => {
						if (!pattern.trim()) return;
						this.services.settings.normalizationRules = [
							...this.services.settings.normalizationRules,
							{
								id: `custom-${Date.now()}`,
								description: description.trim(),
								pattern: pattern.trim(),
								flags: "g",
								replacement,
								enabled: true,
							},
						];
						await this.save();
						renderList();
					})
				);
		};
		renderList();
	}

	private renderAdvancedTunables(containerEl: HTMLElement, locale: Locale): void {
		const numberField = (
			key: "maxSlidingWindowWords" | "maxSuggestionResults" | "tafsirFetchDelayMs" | "tafsirFetchDelayThreshold" | "reflectionFileNameAyahTextMaxLength",
			label: Record<Locale, string>,
			desc: Record<Locale, string>
		) => {
			new Setting(containerEl)
				.setName(label[locale])
				.setDesc(desc[locale])
				.addText((text) =>
					text.setValue(String(this.services.settings[key])).onChange(async (value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num >= 0) {
							this.services.settings[key] = num;
							await this.save();
						}
					})
				);
		};

		numberField(
			"maxSlidingWindowWords",
			{ ar: "أقصى عرض لنافذة البحث الانزلاقي", en: "Max sliding-window width" },
			{ ar: "أقصى عدد كلمات يحاول الاكتشاف التلقائي مطابقتها دفعة واحدة.", en: "Largest word-count window the auto-detect fallback tries." }
		);
		numberField(
			"maxSuggestionResults",
			{ ar: "أقصى عدد نتائج مقترحة", en: "Max suggestion results" },
			{ ar: "أقصى عدد آيات تظهر في نوافذ البحث/النطاق/الربط.", en: "Cap on suggestions shown in the search/range/link-ayat modals." }
		);
		numberField(
			"tafsirFetchDelayMs",
			{ ar: "تأخير الجلب (ميلي ثانية)", en: "Fetch delay (ms)" },
			{ ar: "التأخير بين طلبات التفسير المتتالية عند طول النطاق.", en: "Delay inserted between consecutive tafsir requests for long ranges." }
		);
		numberField(
			"tafsirFetchDelayThreshold",
			{ ar: "عتبة تفعيل التأخير (عدد الآيات)", en: "Delay threshold (ayah count)" },
			{ ar: "أقل طول نطاق يبدأ عنده تفعيل التأخير أعلاه.", en: "Range length above which the delay above kicks in." }
		);
		numberField(
			"reflectionFileNameAyahTextMaxLength",
			{ ar: "أقصى طول لنص الآية داخل اسم الملف", en: "Max ayah-text length in filename" },
			{
				ar: "يُقتطع نص الآية داخل عنوان الملف عند هذا الطول (٠ = بلا اقتطاع).",
				en: "Ayah text inside the file title is truncated at this length (0 = no truncation).",
			}
		);
	}
}

```

## presentation\settings\SettingsSchema.ts

```typescript
import type { Locale } from "../../config/types";

export type SettingFieldType = "toggle" | "text" | "textarea" | "dropdown" | "slider" | "color";

export interface SettingFieldDefinition {
	key: string;
	type: SettingFieldType;
	label: Record<Locale, string>;
	description: Record<Locale, string>;
	dropdownOptions?: Array<{ value: string; label: string }>;
	slider?: { min: number; max: number; step: number };
}

export interface SettingsSectionDefinition {
	id: string;
	heading: Record<Locale, string>;
	fields: SettingFieldDefinition[];
}

/**
 * Every simple (single-control) setting lives here. Composite sections —
 * favorite books, custom tafsir sources, resolution order, normalization
 * rules, category management, numeric tunables — are bespoke renderers in
 * QuranKeySettingsTab.ts because they need add/remove/reorder UI a single
 * `Setting` control can't express; everything else is genuinely additive.
 *
 * Heading-level fields (rangeHeadingLevel, bookHeadingLevel) are plain
 * "text" fields, not a dropdown — a fixed H3-H5 menu turned out to be a
 * hardcoded literal wearing a settings costume; see docs/ARCHITECTURE.md
 * §9. Category-specific heading levels live in the category management
 * UI instead, since they're per-category, not global.
 */
export const SETTINGS_SCHEMA: SettingsSectionDefinition[] = [
	{
		id: "text",
		heading: { ar: "التحكم في النصوص والتخريج", en: "Text handling & output" },
		fields: [
			{
				key: "stripTashkeel",
				type: "toggle",
				label: { ar: "إدراج النص مجرداً من التشكيل", en: "Strip tashkeel on insert" },
				description: {
					ar: "عند التفعيل، تُدرَج الآيات بلا علامات ضبط وتشكيل كحالة افتراضية.",
					en: "When enabled, inserted ayahs have tashkeel/diacritics stripped by default.",
				},
			},
			{
				key: "useOrnateNumbers",
				type: "toggle",
				label: { ar: "استخدام الأرقام المزخرفة", en: "Use ornate numbers" },
				description: {
					ar: "تحويل رقم الآية العادي بين قوسين إلى الرمز المصحفي المزخرف بالأرقام العربية.",
					en: "Converts plain \"(n)\" ayah markers into the ring-glyph ornate style.",
				},
			},
			{
				key: "referenceFormat",
				type: "text",
				label: { ar: "صيغة الإحالة المرجعية", en: "Reference format" },
				description: {
					ar: "يجب أن تحوي {surah} و{verse}، مثل [{surah}:{verse}]. تتحكم فعلياً في التعرف على المرجع وكتابته (راجع ARCHITECTURE.md NFR-3).",
					en: "Must contain {surah} and {verse}, e.g. [{surah}:{verse}]. Actually drives parsing AND output (see docs/ARCHITECTURE.md NFR-3).",
				},
			},
			{
				key: "wrapperStart",
				type: "text",
				label: { ar: "بداية إطار الآية", en: "Verse wrapper — start glyph" },
				description: { ar: "الرمز الذي يفتتح به نص الآية المدرجة.", en: "Glyph that opens an inserted ayah." },
			},
			{
				key: "wrapperEnd",
				type: "text",
				label: { ar: "نهاية إطار الآية", en: "Verse wrapper — end glyph" },
				description: { ar: "الرمز الذي يختتم به نص الآية المدرجة.", en: "Glyph that closes an inserted ayah." },
			},
			{
				key: "ornateRingGlyph",
				type: "text",
				label: { ar: "رمز الرقم المزخرف", en: "Ornate number ring glyph" },
				description: { ar: "الرمز المستخدم مع الأرقام المزخرفة (الافتراضي: ۝).", en: "Glyph used to ring ornate ayah numbers (default: ۝)." },
			},
		],
	},
	{
		id: "search",
		heading: { ar: "البحث والواجهة", en: "Search & interface" },
		fields: [
			{
				key: "showAnalytics",
				type: "toggle",
				label: { ar: "إظهار لوحة التحليلات", en: "Show analytics dashboard" },
				description: {
					ar: "عرض إحصاءات فورية (الإجمالي، الأكثر تكراراً، الأعلى كثافة) أسفل شريط البحث.",
					en: "Live match statistics under the search modal's input.",
				},
			},
			{
				key: "interfaceLanguage",
				type: "dropdown",
				label: { ar: "لغة الواجهة", en: "Interface language" },
				description: {
					ar: "لغة النصوص التفاعلية (البحث، لوحة التحليلات، منتقي التفسير).",
					en: "Language for the plugin's interactive UI text.",
				},
				dropdownOptions: [
					{ value: "ar", label: "العربية" },
					{ value: "en", label: "English" },
				],
			},
			{
				key: "searchStrategy",
				type: "dropdown",
				label: { ar: "آلية البحث عن الآيات", en: "Verse search mechanism" },
				description: {
					ar: "حرفي: يجب أن تظهر كلمات البحث متتالية وبنفس ترتيبها داخل الآية. تقريبي: يكفي أن تظهر كل كلمة في أي مكان بالآية.",
					en: "Literal: search words must appear contiguously and in order within the ayah. Fuzzy: each word just needs to appear anywhere in the ayah.",
				},
				dropdownOptions: [
					{ value: "literal", label: "Literal" },
					{ value: "fuzzy", label: "Fuzzy" },
				],
			},
		],
	},
	{
		id: "tafsir",
		heading: { ar: "إعدادات محرك التفسير السياقي", en: "Tafsir engine" },
		fields: [
			{
				key: "rangeHeadingLevel",
				type: "text",
				label: { ar: "حجم عنوان نطاق الآيات", en: "Range heading level" },
				description: {
					ar: "مثل ### أو ## أو أي مستوى تريده — نص حر بلا سقف أو حد أدنى.",
					en: "e.g. ### or ## or any level you like — free text, no fixed ceiling or floor.",
				},
			},
			{
				key: "bookHeadingLevel",
				type: "text",
				label: { ar: "حجم عنوان كتاب التفسير", en: "Book heading level" },
				description: {
					ar: "مستوى الـ Heading لعنوان كل كتاب تفسير على حدة — نص حر.",
					en: "Heading level for each book's own heading — free text.",
				},
			},
			{
				key: "includeAyahTextInTafsir",
				type: "toggle",
				label: { ar: "تضمين نص الآية القرآنية", en: "Include ayah text" },
				description: { ar: "طباعة نص الآية داخل الأقواس قبل متن تفسيرها.", en: "Print the ayah's own text before its commentary." },
			},
			{
				key: "useHorizontalDivider",
				type: "toggle",
				label: { ar: "استخدام فاصل أفقي", en: "Use horizontal divider" },
				description: { ar: "إدراج فاصل (---) بين كتب تفسير متعددة لنفس النطاق.", en: "Insert a '---' divider between multiple books' output." },
			},
		],
	},
	{
		id: "style",
		heading: { ar: "تنسيق مظهر الأقواس القرآنية", en: "Qur'anic text style" },
		fields: [
			{
				key: "quranFontFamily",
				type: "text",
				label: { ar: "نوع الخط المصحفي", en: "Font family" },
				description: { ar: "الخط المستخدم للنص داخل أقواس الآية (مثل 'Amiri').", en: "Font used for text inside the verse wrapper glyphs." },
			},
			{
				key: "quranFontSize",
				type: "slider",
				label: { ar: "حجم الخط", en: "Font size" },
				description: { ar: "حجم خط الآية بوحدة (em) نسبةً لمتن النص.", en: "Ayah font size in em, relative to body text." },
				slider: { min: 0.8, max: 2, step: 0.05 },
			},
			{
				key: "quranLineHeight",
				type: "slider",
				label: { ar: "ارتفاع السطر", en: "Line height" },
				description: { ar: "تباعد الأسطر لمنع تداخل الحركات وعلامات الوقف.", en: "Line spacing to prevent tashkeel/waqf marks overlapping." },
				slider: { min: 1.5, max: 3.5, step: 0.1 },
			},
			{
				key: "quranColor",
				type: "color",
				label: { ar: "لون الآيات", en: "Qur'anic text color" },
				description: { ar: "اللون المميز للشواهد القرآنية داخل الأقواس.", en: "Accent color for Qur'anic quotes inside the wrapper glyphs." },
			},
			{
				key: "styleOrnateNumbers",
				type: "toggle",
				label: { ar: "تنسيق الأرقام المزخرفة", en: "Style ornate numbers" },
				description: {
					ar: "عند التفعيل، يُميَّز الرقم المزخرف بصرياً في المعاينة المباشرة وعرض القراءة عبر الصنف .quran-key-ornate-number، بمعزل عن نص الآية المحيط.",
					en: "When enabled, ornate ayah numbers get their own visual highlight in Live Preview and Reading view via the .quran-key-ornate-number class, independent of the surrounding ayah text.",
				},
			},
			{
				key: "customCss",
				type: "textarea",
				label: { ar: "CSS مخصص", en: "Custom CSS" },
				description: {
					ar: "يُلحق حرفياً بعد المتغيرات المولّدة تلقائياً. صنفان مفيدان: .cm-quran-key-text لنص الآية كاملاً، .quran-key-ornate-number للرقم المزخرف وحده.",
					en: "Appended verbatim after the auto-generated CSS variables. Useful hooks: .cm-quran-key-text for the whole ayah, .quran-key-ornate-number for just the ornate number.",
				},
			},
		],
	},
	{
		id: "reflections",
		heading: { ar: "ملاحظات الآيات (التدبرات والآثار)", en: "Ayah notes (تدبر / أثر)" },
		fields: [
			{
				key: "ayahNotesFolder",
				type: "text",
				label: { ar: "مجلد ملاحظات الآيات الموحّدة", en: "Unified ayah notes folder" },
				description: {
					ar: "المجلد الذي تُحفظ فيه ملاحظة الآية الموحّدة (تشمل كل تصنيف وضعه المستخدم على «موحّد»).",
					en: "Folder holding each ayah's unified note (used by every category set to \"unified\").",
				},
			},
			{
				key: "includeAyahTextInReflectionNote",
				type: "toggle",
				label: { ar: "تضمين نص الآية في أول الملاحظة", en: "Include ayah text at the top of the note" },
				description: {
					ar: "يُكتب مرة واحدة فقط عند إنشاء الملاحظة لأول مرة، وليس مع كل مُدخل جديد.",
					en: "Written once, when the note is first created — not repeated with every new entry.",
				},
			},
			{
				key: "reflectionInsertionMode",
				type: "dropdown",
				label: { ar: "ترتيب المُدخلات الجديدة", en: "New-entry placement" },
				description: {
					ar: "مباشرة أسفل العنوان: الأحدث يظهر أولاً. نهاية القسم: ترتيب زمني (الأقدم أولاً).",
					en: "Directly under the heading: newest first. End of section: chronological (oldest first).",
				},
				dropdownOptions: [
					{ value: "afterHeading", label: "afterHeading" },
					{ value: "endOfSection", label: "endOfSection" },
				],
			},
			{
				key: "reflectionEntrySeparator",
				type: "text",
				label: { ar: "الفاصل بين المُدخلات", en: "Separator between entries" },
				description: {
					ar: "يُدرج بين كل مُدخل والذي يليه. اتركه فارغاً لعدم وجود فاصل. الافتراضي خط أفقي (---).",
					en: "Inserted between consecutive entries. Leave empty for no separator. Default is a horizontal rule (---).",
				},
			},
			{
				key: "deleteSelectionAfterLinkingReflection",
				type: "toggle",
				label: { ar: "استبدال النص المحدد برابط للآية", en: "Replace selection with a backlink" },
				description: {
					ar: "عند التفعيل (الافتراضي)، يُستبدل النص المحدد في مكانه الأصلي برابط لملاحظة الآية بدل حذفه بلا أثر. عند التعطيل يبقى النص كما هو (نسخ).",
					en: "When enabled (default), the selected text is replaced in its original note with a backlink to the ayah note, instead of being erased with no trace. When disabled, the text is left exactly as-is (a copy).",
				},
			},
			{
				key: "reflectionBacklinkAliasTemplate",
				type: "text",
				label: { ar: "صيغة نص الرابط (alias)", en: "Backlink alias template" },
				description: {
					ar: "{surah} و{verse} و{ayahText} متاحة. اتركه فارغاً لرابط بلا alias، أي [[عنوان الملاحظة]] كما هو.",
					en: "{surah}, {verse}, {ayahText} available. Leave empty for a plain [[Note Title]] link with no alias.",
				},
			},
			{
				key: "reflectionBacklinkWrapTemplate",
				type: "text",
				label: { ar: "صيغة إحاطة الرابط", en: "Backlink wrap template" },
				description: {
					ar: "{link} هو المتغيّر الوحيد. مثال: \"↳ نُقل إلى {link}\".",
					en: 'Only {link} is available as a placeholder. Example: "↳ moved to {link}".',
				},
			},
			{
				key: "reflectionFileNameTemplate",
				type: "text",
				label: { ar: "صيغة عنوان ملف الآية", en: "Ayah note title format" },
				description: {
					ar: "يجب أن تحوي {ayahText}؛ يمكن أيضاً استخدام {surah} و{verse}. مثال: \"{ayahText} ({surah} {verse})\".",
					en: 'Must contain {ayahText}; {surah} and {verse} are also available, e.g. "{ayahText} ({surah} {verse})".',
				},
			},
			{
				key: "reflectionEntryPrefixTemplate",
				type: "text",
				label: { ar: "صيغة بداية كل مُدخل", en: "Entry prefix format" },
				description: {
					ar: "{date} هو المتغيّر الوحيد المتاح. أمثلة: \"### {date}\" لعنوان، \"- {date}\" لقائمة نقطية، \"1. {date}\" لقائمة مرقّمة، أو اتركه فارغاً بلا أي بداية.",
					en: 'Only {date} is available as a placeholder. Examples: "### {date}" for a heading, "- {date}" for a bullet, "1. {date}" for a numbered item, or leave it empty for no prefix at all.',
				},
			},
		],
	},
];

```

## domain\ArabicNormalizer.spec.ts

```typescript
import { describe, expect, it } from "vitest";
import { ArabicNormalizer } from "../../src/domain/services/ArabicNormalizer";
import normalizationRules from "../../data/normalizationRules.json";

const defaultRules = (normalizationRules as Array<Record<string, unknown>>).map((r) => ({
	pattern: String(r.pattern),
	flags: String(r.flags ?? "g"),
	replacement: String(r.replacement),
	enabled: true,
}));

const normalizer = new ArabicNormalizer(defaultRules);

describe("ArabicNormalizer", () => {
	it("strips tashkeel", () => {
		expect(normalizer.stripTashkeel("\u0628ِ\u0633ْ\u0645ِ")).toBe("\u0628\u0633\u0645");
	});

	it("unifies hamza forms onto a bare alef", () => {
		expect(normalizer.normalizeForSearch("\u0623\u062D\u062F")).toBe(normalizer.normalizeForSearch("\u0627\u062D\u062F"));
		expect(normalizer.normalizeForSearch("\u0625\u062D\u062F")).toBe(normalizer.normalizeForSearch("\u0627\u062D\u062F"));
	});

	it("applies the configured short-alef substitution rules (data-driven, NFR-2)", () => {
		expect(normalizer.normalizeForSearch("\u0627\u0644\u0635\u0644\u0648\u0629")).toBe(
			normalizer.normalizeForSearch("\u0627\u0644\u0635\u0644\u0627\u0629")
		);
	});

	it("collapses repeated whitespace", () => {
		expect(normalizer.normalizeForSearch("\u0642\u0627\u0644    \u0627\u0644\u0644\u0647")).not.toMatch(/\s{2,}/);
	});

	it("ignores a rule when disabled — the customizability seam (NFR-2)", () => {
		const disabled = new ArabicNormalizer([
			{ pattern: "\u0635\u0644\u0648\u0629", flags: "g", replacement: "\u0635\u0644\u0627\u0629", enabled: false },
		]);
		expect(disabled.normalizeForSearch("\u0635\u0644\u0648\u0629")).not.toBe(disabled.normalizeForSearch("\u0635\u0644\u0627\u0629"));
	});

	it("normalizes Arabic-Indic and Persian digits to Western digits", () => {
		expect(ArabicNormalizer.normalizeNumbers("\u0662\u0665\u0665")).toBe("255");
		expect(ArabicNormalizer.normalizeNumbers("\u06F2\u06F5\u06F5")).toBe("255");
	});
});

```

## domain\HeadingSectionInserter.spec.ts

```typescript
import { describe, expect, it } from "vitest";
import { HeadingSectionInserter } from "../../src/domain/services/HeadingSectionInserter";

const baseOptions = {
	headingLevel: "###",
	headingText: "تدبرات",
	parentHeadingLevel: null,
	parentHeadingText: null,
	separator: "\n\n---\n\n",
} as const;

describe("HeadingSectionInserter", () => {
	it("creates the heading at end of file when it doesn't exist, and inserts under it", () => {
		const out = HeadingSectionInserter.insertEntry("", { ...baseOptions, insertionMode: "afterHeading" }, "أول تدبر");
		expect(out).toContain("### تدبرات");
		expect(out.indexOf("### تدبرات")).toBeLessThan(out.indexOf("أول تدبر"));
	});

	it("afterHeading mode puts the newest entry directly under the heading, above older ones", () => {
		let content = "";
		content = HeadingSectionInserter.insertEntry(content, { ...baseOptions, insertionMode: "afterHeading" }, "تدبر قديم");
		content = HeadingSectionInserter.insertEntry(content, { ...baseOptions, insertionMode: "afterHeading" }, "تدبر جديد");
		expect(content.indexOf("تدبر جديد")).toBeLessThan(content.indexOf("تدبر قديم"));
		expect(content).toContain("---"); // separator inserted between the two
	});

	it("endOfSection mode keeps chronological order (oldest stays on top)", () => {
		let content = "";
		content = HeadingSectionInserter.insertEntry(content, { ...baseOptions, insertionMode: "endOfSection" }, "تدبر أول");
		content = HeadingSectionInserter.insertEntry(content, { ...baseOptions, insertionMode: "endOfSection" }, "تدبر ثاني");
		expect(content.indexOf("تدبر أول")).toBeLessThan(content.indexOf("تدبر ثاني"));
	});

	it("does not insert a stray separator when the section was empty", () => {
		const out = HeadingSectionInserter.insertEntry("", { ...baseOptions, insertionMode: "afterHeading" }, "أول تدبر");
		expect(out).not.toContain("---");
	});

	it("respects section boundaries: inserting under one heading never leaks into another section", () => {
		const existing = ["## آثار", "", "أثر موجود", "", "### تدبرات", "", "تدبر قديم", ""].join("\n");
		const out = HeadingSectionInserter.insertEntry(existing, { ...baseOptions, insertionMode: "afterHeading" }, "تدبر جديد");
		const lines = out.split("\n");
		expect(lines.indexOf("تدبر جديد")).toBeGreaterThan(lines.indexOf("### تدبرات"));
		expect(lines.indexOf("تدبر جديد")).toBeLessThan(lines.indexOf("تدبر قديم"));
	});

	it("nests a new heading under its parent's section instead of at file end", () => {
		const existing = ["## فوائد", "", "### فوائد بلاغية", "", "فايدة بلاغية", "", "## آثار", "", "أثر"].join("\n");
		const out = HeadingSectionInserter.insertEntry(
			existing,
			{
				headingLevel: "###",
				headingText: "فوائد لغوية",
				parentHeadingLevel: "##",
				parentHeadingText: "فوائد",
				insertionMode: "afterHeading",
				separator: "\n\n---\n\n",
			},
			"فايدة لغوية"
		);
		const lines = out.split("\n");
		const parentIdx = lines.indexOf("## فوائد");
		const newHeadingIdx = lines.indexOf("### فوائد لغوية");
		const athaarIdx = lines.indexOf("## آثار");
		expect(newHeadingIdx).toBeGreaterThan(parentIdx);
		expect(newHeadingIdx).toBeLessThan(athaarIdx); // stayed nested under فوائد, didn't spill into آثار
	});

	it("falls back to end-of-file when the named parent heading doesn't exist yet", () => {
		const out = HeadingSectionInserter.insertEntry(
			"## آثار\n\nأثر",
			{
				headingLevel: "###",
				headingText: "فوائد لغوية",
				parentHeadingLevel: "##",
				parentHeadingText: "فوائد", // not present
				insertionMode: "afterHeading",
				separator: "",
			},
			"فايدة"
		);
		expect(out).toContain("### فوائد لغوية");
	});

	it("ensureLinkLine is idempotent — running it twice doesn't duplicate the line", () => {
		let content = "";
		const linkLine = "[[الفوائد العملية لهذه الآية]]";
		content = HeadingSectionInserter.ensureLinkLine(content, { ...baseOptions, insertionMode: "afterHeading" }, linkLine);
		content = HeadingSectionInserter.ensureLinkLine(content, { ...baseOptions, insertionMode: "afterHeading" }, linkLine);
		const occurrences = content.split(linkLine).length - 1;
		expect(occurrences).toBe(1);
	});

	it("ensureHeadingExists is a no-op when the heading is already there", () => {
		const existing = "### تدبرات\n\nموجود بالفعل\n";
		const out = HeadingSectionInserter.ensureHeadingExists(existing, "###", "تدبرات", null, null);
		expect(out).toBe(existing);
	});
});

```

## domain\VerseOutputFormatter.spec.ts

```typescript
import { describe, expect, it } from "vitest";
import { VerseOutputFormatter } from "../../src/domain/services/VerseOutputFormatter";
import { OrnateNumberConverter } from "../../src/domain/services/OrnateNumberConverter";
import { VerseReference } from "../../src/domain/value-objects/VerseReference";
import type { Ayah } from "../../src/domain/entities/Ayah";

const ayah: Ayah = {
	id: 1,
	surahId: 1,
	ayahId: 1,
	surahName: "\u0627\u0644\u0641\u0627\u062A\u062D\u0629",
	text: "\u0628\u0650\u0633\u0652\u0645\u0650 \u0627\u0644\u0644\u0651\u0647\u0650",
};

describe("VerseOutputFormatter", () => {
	it("wraps text, appends the ayah number, and the compiled reference", () => {
		const reference = VerseReference.compile("[{surah}:{verse}]");
		const formatter = new VerseOutputFormatter(new OrnateNumberConverter("\u06DD"), reference, (t) => t);
		const output = formatter.format([ayah], {
			wrapperStart: "\uFD3F",
			wrapperEnd: "\uFD3E",
			useOrnateNumbers: false,
			stripTashkeelOnOutput: false,
		});
		expect(output.startsWith("\uFD3F ")).toBe(true);
		expect(output).toContain("(1)");
		expect(output).toContain("\uFD3E");
		expect(output.endsWith("[\u0627\u0644\u0641\u0627\u062A\u062D\u0629:1]")).toBe(true);
	});

	it("respects fully custom wrapper glyphs and reference template (NFR-3/NFR-4)", () => {
		const reference = VerseReference.compile("(\u0633\u0648\u0631\u0629 {surah}\u060C \u0622\u064A\u0629 {verse})");
		const formatter = new VerseOutputFormatter(new OrnateNumberConverter("\u06DD"), reference, (t) => t);
		const output = formatter.format([ayah], {
			wrapperStart: "\u00AB",
			wrapperEnd: "\u00BB",
			useOrnateNumbers: false,
			stripTashkeelOnOutput: true,
		});
		expect(output.startsWith("\u00AB")).toBe(true);
		expect(output).toContain("(\u0633\u0648\u0631\u0629 \u0627\u0644\u0641\u0627\u062A\u062D\u0629\u060C \u0622\u064A\u0629 1)");
	});

	it("converts ayah numbers to ornate Arabic-Indic digits when enabled", () => {
		const reference = VerseReference.compile("[{surah}:{verse}]");
		const formatter = new VerseOutputFormatter(new OrnateNumberConverter("\u06DD"), reference, (t) => t);
		const output = formatter.format([{ ...ayah, ayahId: 12 }], {
			wrapperStart: "\uFD3F",
			wrapperEnd: "\uFD3E",
			useOrnateNumbers: true,
			stripTashkeelOnOutput: false,
		});
		expect(output).toContain("\u06DD\u0661\u0662"); // ۝١٢
	});
});

```

## domain\VerseReference.spec.ts

```typescript
import { describe, expect, it } from "vitest";
import { VerseReference } from "../../src/domain/value-objects/VerseReference";

describe("VerseReference (NFR-3: referenceFormat drives parsing AND formatting)", () => {
	it("formats using the configured template", () => {
		const ref = VerseReference.compile("[{surah}:{verse}]");
		expect(ref.format("\u0627\u0644\u0628\u0642\u0631\u0629", 255, 255)).toBe("[\u0627\u0644\u0628\u0642\u0631\u0629:255]");
		expect(ref.format("\u0627\u0644\u0628\u0642\u0631\u0629", 1, 5)).toBe("[\u0627\u0644\u0628\u0642\u0631\u0629:1-5]");
	});

	it("parses a reference matching the same template", () => {
		const ref = VerseReference.compile("[{surah}:{verse}]");
		const match = ref.find("\u0627\u0646\u0638\u0631 [\u0627\u0644\u0628\u0642\u0631\u0629:255] \u0641\u064A \u0627\u0644\u0645\u0648\u0636\u0648\u0639");
		expect(match).not.toBeNull();
		expect(match?.surahName).toBe("\u0627\u0644\u0628\u0642\u0631\u0629");
		expect(match?.startAyah).toBe(255);
		expect(match?.endAyah).toBe(255);
	});

	it("supports an entirely different template, including reversed placeholder order", () => {
		const ref = VerseReference.compile("(\u0633\u0648\u0631\u0629 {surah}\u060C \u0622\u064A\u0629 {verse})");
		const text = ref.format("\u0627\u0644\u0625\u062E\u0644\u0627\u0635", 1, 4);
		expect(text).toBe("(\u0633\u0648\u0631\u0629 \u0627\u0644\u0625\u062E\u0644\u0627\u0635\u060C \u0622\u064A\u0629 1-4)");
		const match = ref.find(`\u0631\u0627\u062C\u0639 ${text} \u0645\u0646 \u0641\u0636\u0644\u0643`);
		expect(match?.surahName).toBe("\u0627\u0644\u0625\u062E\u0644\u0627\u0635");
		expect(match?.startAyah).toBe(1);
		expect(match?.endAyah).toBe(4);
	});

	it("strips every reference occurrence from a line", () => {
		const ref = VerseReference.compile("[{surah}:{verse}]");
		const stripped = ref.strip(
			"\u0642\u0627\u0644 \u062A\u0639\u0627\u0644\u0649 [\u0627\u0644\u0628\u0642\u0631\u0629:255] \u0648\u0642\u0627\u0644 \u0623\u064A\u0636\u0627 [\u0622\u0644 \u0639\u0645\u0631\u0627\u0646:8]"
		);
		expect(stripped).toBe("\u0642\u0627\u0644 \u062A\u0639\u0627\u0644\u0649 \u0648\u0642\u0627\u0644 \u0623\u064A\u0636\u0627");
	});

	it("rejects a template missing a required placeholder", () => {
		expect(() => VerseReference.compile("[{surah}]")).toThrow();
	});
});

```

## .gitignore

```gitignore
node_modules/
main.js
*.js.map
.DS_Store

```

## esbuild.config.mjs

```javascript
import esbuild from "esbuild";
import process from "process";
import { builtinModules } from "node:module";

const banner = `/*
THIS IS A GENERATED/BUNDLED FILE BY ESBUILD
Source: src/ - see docs/ARCHITECTURE.md for the layer map.
*/`;

const prod = process.argv[2] === "production";

const context = await esbuild.context({
	banner: { js: banner },
	entryPoints: ["src/main.ts"],
	bundle: true,
	loader: { ".json": "json" },
	external: [
		"obsidian",
		"electron",
		"@codemirror/autocomplete",
		"@codemirror/collab",
		"@codemirror/commands",
		"@codemirror/language",
		"@codemirror/lint",
		"@codemirror/search",
		"@codemirror/state",
		"@codemirror/view",
		"@lezer/common",
		"@lezer/highlight",
		"@lezer/lr",
		...builtinModules,
	],
	format: "cjs",
	target: "es2018",
	logLevel: "info",
	sourcemap: prod ? false : "inline",
	treeShaking: true,
	outfile: "main.js",
	minify: prod,
});

if (prod) {
	await context.rebuild();
	process.exit(0);
} else {
	await context.watch();
}
```

## eslintrc.json

```json
{
  "parser": "@typescript-eslint/parser",
  "plugins": ["@obsidianmd"],
  "extends": ["plugin:@obsidianmd/recommended"],
  "rules": {}
}
```

## LICENSE

```text
MIT License

Copyright (c) 2026 Mohamed Saleh

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

```

## manifest.json

```json
{
	"id": "quran-key",
	"name": "Quran Key",
	"version": "1.0.1",
	"minAppVersion": "1.8.0",
	"description": "Enrich your Islamic knowledge with Quran research, tafsir, and tadabbur.",
	"author": "Mohamed Saleh",
	"authorUrl": "https://github.com/MohamedSaleh0-0",
	"isDesktopOnly": false
}
```

## package.json

```json
{
	"name": "quran-key",
	"version": "1.0.0",
	"description": "Enrich your Islamic knowledge with Quran research, tafsir, and tadabbur.",
	"main": "main.js",
	"scripts": {
		"dev": "node esbuild.config.mjs",
		"build": "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production",
		"test": "vitest run"
	},
	"license": "MIT",
	"dependencies": {
		"@codemirror/view": "^6.38.6"
	},
	"devDependencies": {
		"@types/node": "^20.0.0",
		"@typescript-eslint/parser": "^8.69.0",
		"esbuild": "^0.19.0",
		"eslint": "^8.57.0",
		"eslint-plugin-obsidianmd": "github:obsidianmd/eslint-plugin",
		"obsidian": "latest",
		"tslib": "^2.6.0",
		"typescript": "^5.3.0",
		"vitest": "^1.6.0"
	}
}
```

## package-lock.json

```json
{
	"name": "quran-key",
	"version": "2.0.0",
	"lockfileVersion": 3,
	"requires": true,
	"packages": {
		"": {
			"name": "quran-key",
			"version": "2.0.0",
			"license": "MIT",
			"devDependencies": {
				"@types/node": "^20.0.0",
				"@typescript-eslint/parser": "^8.69.0",
				"builtin-modules": "^3.3.0",
				"esbuild": "^0.19.0",
				"eslint": "^8.57.0",
				"eslint-plugin-obsidianmd": "github:obsidianmd/eslint-plugin",
				"obsidian": "latest",
				"tslib": "^2.6.0",
				"typescript": "^5.3.0",
				"vitest": "^1.6.0"
			}
		},
		"node_modules/@codemirror/state": {
			"version": "6.5.0",
			"resolved": "https://registry.npmjs.org/@codemirror/state/-/state-6.5.0.tgz",
			"integrity": "sha512-MwBHVK60IiIHDcoMet78lxt6iw5gJOGSbNbOIVBHWVXIH4/Nq1+GQgLLGgI1KlnN86WDXsPudVaqYHKBIx7Eyw==",
			"dev": true,
			"license": "MIT",
			"peer": true,
			"dependencies": {
				"@marijn/find-cluster-break": "^1.0.0"
			}
		},
		"node_modules/@codemirror/view": {
			"version": "6.38.6",
			"resolved": "https://registry.npmjs.org/@codemirror/view/-/view-6.38.6.tgz",
			"integrity": "sha512-qiS0z1bKs5WOvHIAC0Cybmv4AJSkAXgX5aD6Mqd2epSLlVJsQl8NG23jCVouIgkh4All/mrbdsf2UOLFnJw0tw==",
			"dev": true,
			"license": "MIT",
			"peer": true,
			"dependencies": {
				"@codemirror/state": "^6.5.0",
				"crelt": "^1.0.6",
				"style-mod": "^4.1.0",
				"w3c-keyname": "^2.2.4"
			}
		},
		"node_modules/@esbuild/aix-ppc64": {
			"version": "0.19.12",
			"resolved": "https://registry.npmjs.org/@esbuild/aix-ppc64/-/aix-ppc64-0.19.12.tgz",
			"integrity": "sha512-bmoCYyWdEL3wDQIVbcyzRyeKLgk2WtWLTWz1ZIAZF/EGbNOwSA6ew3PftJ1PqMiOOGu0OyFMzG53L0zqIpPeNA==",
			"cpu": [
				"ppc64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"aix"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/@esbuild/android-arm": {
			"version": "0.19.12",
			"resolved": "https://registry.npmjs.org/@esbuild/android-arm/-/android-arm-0.19.12.tgz",
			"integrity": "sha512-qg/Lj1mu3CdQlDEEiWrlC4eaPZ1KztwGJ9B6J+/6G+/4ewxJg7gqj8eVYWvao1bXrqGiW2rsBZFSX3q2lcW05w==",
			"cpu": [
				"arm"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"android"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/@esbuild/android-arm64": {
			"version": "0.19.12",
			"resolved": "https://registry.npmjs.org/@esbuild/android-arm64/-/android-arm64-0.19.12.tgz",
			"integrity": "sha512-P0UVNGIienjZv3f5zq0DP3Nt2IE/3plFzuaS96vihvD0Hd6H/q4WXUGpCxD/E8YrSXfNyRPbpTq+T8ZQioSuPA==",
			"cpu": [
				"arm64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"android"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/@esbuild/android-x64": {
			"version": "0.19.12",
			"resolved": "https://registry.npmjs.org/@esbuild/android-x64/-/android-x64-0.19.12.tgz",
			"integrity": "sha512-3k7ZoUW6Q6YqhdhIaq/WZ7HwBpnFBlW905Fa4s4qWJyiNOgT1dOqDiVAQFwBH7gBRZr17gLrlFCRzF6jFh7Kew==",
			"cpu": [
				"x64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"android"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/@esbuild/darwin-arm64": {
			"version": "0.19.12",
			"resolved": "https://registry.npmjs.org/@esbuild/darwin-arm64/-/darwin-arm64-0.19.12.tgz",
			"integrity": "sha512-B6IeSgZgtEzGC42jsI+YYu9Z3HKRxp8ZT3cqhvliEHovq8HSX2YX8lNocDn79gCKJXOSaEot9MVYky7AKjCs8g==",
			"cpu": [
				"arm64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"darwin"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/@esbuild/darwin-x64": {
			"version": "0.19.12",
			"resolved": "https://registry.npmjs.org/@esbuild/darwin-x64/-/darwin-x64-0.19.12.tgz",
			"integrity": "sha512-hKoVkKzFiToTgn+41qGhsUJXFlIjxI/jSYeZf3ugemDYZldIXIxhvwN6erJGlX4t5h417iFuheZ7l+YVn05N3A==",
			"cpu": [
				"x64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"darwin"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/@esbuild/freebsd-arm64": {
			"version": "0.19.12",
			"resolved": "https://registry.npmjs.org/@esbuild/freebsd-arm64/-/freebsd-arm64-0.19.12.tgz",
			"integrity": "sha512-4aRvFIXmwAcDBw9AueDQ2YnGmz5L6obe5kmPT8Vd+/+x/JMVKCgdcRwH6APrbpNXsPz+K653Qg8HB/oXvXVukA==",
			"cpu": [
				"arm64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"freebsd"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/@esbuild/freebsd-x64": {
			"version": "0.19.12",
			"resolved": "https://registry.npmjs.org/@esbuild/freebsd-x64/-/freebsd-x64-0.19.12.tgz",
			"integrity": "sha512-EYoXZ4d8xtBoVN7CEwWY2IN4ho76xjYXqSXMNccFSx2lgqOG/1TBPW0yPx1bJZk94qu3tX0fycJeeQsKovA8gg==",
			"cpu": [
				"x64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"freebsd"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/@esbuild/linux-arm": {
			"version": "0.19.12",
			"resolved": "https://registry.npmjs.org/@esbuild/linux-arm/-/linux-arm-0.19.12.tgz",
			"integrity": "sha512-J5jPms//KhSNv+LO1S1TX1UWp1ucM6N6XuL6ITdKWElCu8wXP72l9MM0zDTzzeikVyqFE6U8YAV9/tFyj0ti+w==",
			"cpu": [
				"arm"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"linux"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/@esbuild/linux-arm64": {
			"version": "0.19.12",
			"resolved": "https://registry.npmjs.org/@esbuild/linux-arm64/-/linux-arm64-0.19.12.tgz",
			"integrity": "sha512-EoTjyYyLuVPfdPLsGVVVC8a0p1BFFvtpQDB/YLEhaXyf/5bczaGeN15QkR+O4S5LeJ92Tqotve7i1jn35qwvdA==",
			"cpu": [
				"arm64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"linux"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/@esbuild/linux-ia32": {
			"version": "0.19.12",
			"resolved": "https://registry.npmjs.org/@esbuild/linux-ia32/-/linux-ia32-0.19.12.tgz",
			"integrity": "sha512-Thsa42rrP1+UIGaWz47uydHSBOgTUnwBwNq59khgIwktK6x60Hivfbux9iNR0eHCHzOLjLMLfUMLCypBkZXMHA==",
			"cpu": [
				"ia32"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"linux"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/@esbuild/linux-loong64": {
			"version": "0.19.12",
			"resolved": "https://registry.npmjs.org/@esbuild/linux-loong64/-/linux-loong64-0.19.12.tgz",
			"integrity": "sha512-LiXdXA0s3IqRRjm6rV6XaWATScKAXjI4R4LoDlvO7+yQqFdlr1Bax62sRwkVvRIrwXxvtYEHHI4dm50jAXkuAA==",
			"cpu": [
				"loong64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"linux"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/@esbuild/linux-mips64el": {
			"version": "0.19.12",
			"resolved": "https://registry.npmjs.org/@esbuild/linux-mips64el/-/linux-mips64el-0.19.12.tgz",
			"integrity": "sha512-fEnAuj5VGTanfJ07ff0gOA6IPsvrVHLVb6Lyd1g2/ed67oU1eFzL0r9WL7ZzscD+/N6i3dWumGE1Un4f7Amf+w==",
			"cpu": [
				"mips64el"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"linux"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/@esbuild/linux-ppc64": {
			"version": "0.19.12",
			"resolved": "https://registry.npmjs.org/@esbuild/linux-ppc64/-/linux-ppc64-0.19.12.tgz",
			"integrity": "sha512-nYJA2/QPimDQOh1rKWedNOe3Gfc8PabU7HT3iXWtNUbRzXS9+vgB0Fjaqr//XNbd82mCxHzik2qotuI89cfixg==",
			"cpu": [
				"ppc64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"linux"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/@esbuild/linux-riscv64": {
			"version": "0.19.12",
			"resolved": "https://registry.npmjs.org/@esbuild/linux-riscv64/-/linux-riscv64-0.19.12.tgz",
			"integrity": "sha512-2MueBrlPQCw5dVJJpQdUYgeqIzDQgw3QtiAHUC4RBz9FXPrskyyU3VI1hw7C0BSKB9OduwSJ79FTCqtGMWqJHg==",
			"cpu": [
				"riscv64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"linux"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/@esbuild/linux-s390x": {
			"version": "0.19.12",
			"resolved": "https://registry.npmjs.org/@esbuild/linux-s390x/-/linux-s390x-0.19.12.tgz",
			"integrity": "sha512-+Pil1Nv3Umes4m3AZKqA2anfhJiVmNCYkPchwFJNEJN5QxmTs1uzyy4TvmDrCRNT2ApwSari7ZIgrPeUx4UZDg==",
			"cpu": [
				"s390x"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"linux"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/@esbuild/linux-x64": {
			"version": "0.19.12",
			"resolved": "https://registry.npmjs.org/@esbuild/linux-x64/-/linux-x64-0.19.12.tgz",
			"integrity": "sha512-B71g1QpxfwBvNrfyJdVDexenDIt1CiDN1TIXLbhOw0KhJzE78KIFGX6OJ9MrtC0oOqMWf+0xop4qEU8JrJTwCg==",
			"cpu": [
				"x64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"linux"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/@esbuild/netbsd-x64": {
			"version": "0.19.12",
			"resolved": "https://registry.npmjs.org/@esbuild/netbsd-x64/-/netbsd-x64-0.19.12.tgz",
			"integrity": "sha512-3ltjQ7n1owJgFbuC61Oj++XhtzmymoCihNFgT84UAmJnxJfm4sYCiSLTXZtE00VWYpPMYc+ZQmB6xbSdVh0JWA==",
			"cpu": [
				"x64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"netbsd"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/@esbuild/openbsd-x64": {
			"version": "0.19.12",
			"resolved": "https://registry.npmjs.org/@esbuild/openbsd-x64/-/openbsd-x64-0.19.12.tgz",
			"integrity": "sha512-RbrfTB9SWsr0kWmb9srfF+L933uMDdu9BIzdA7os2t0TXhCRjrQyCeOt6wVxr79CKD4c+p+YhCj31HBkYcXebw==",
			"cpu": [
				"x64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"openbsd"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/@esbuild/sunos-x64": {
			"version": "0.19.12",
			"resolved": "https://registry.npmjs.org/@esbuild/sunos-x64/-/sunos-x64-0.19.12.tgz",
			"integrity": "sha512-HKjJwRrW8uWtCQnQOz9qcU3mUZhTUQvi56Q8DPTLLB+DawoiQdjsYq+j+D3s9I8VFtDr+F9CjgXKKC4ss89IeA==",
			"cpu": [
				"x64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"sunos"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/@esbuild/win32-arm64": {
			"version": "0.19.12",
			"resolved": "https://registry.npmjs.org/@esbuild/win32-arm64/-/win32-arm64-0.19.12.tgz",
			"integrity": "sha512-URgtR1dJnmGvX864pn1B2YUYNzjmXkuJOIqG2HdU62MVS4EHpU2946OZoTMnRUHklGtJdJZ33QfzdjGACXhn1A==",
			"cpu": [
				"arm64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"win32"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/@esbuild/win32-ia32": {
			"version": "0.19.12",
			"resolved": "https://registry.npmjs.org/@esbuild/win32-ia32/-/win32-ia32-0.19.12.tgz",
			"integrity": "sha512-+ZOE6pUkMOJfmxmBZElNOx72NKpIa/HFOMGzu8fqzQJ5kgf6aTGrcJaFsNiVMH4JKpMipyK+7k0n2UXN7a8YKQ==",
			"cpu": [
				"ia32"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"win32"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/@esbuild/win32-x64": {
			"version": "0.19.12",
			"resolved": "https://registry.npmjs.org/@esbuild/win32-x64/-/win32-x64-0.19.12.tgz",
			"integrity": "sha512-T1QyPSDCyMXaO3pzBkF96E8xMkiRYbUEZADd29SyPGabqxMViNoii+NcK7eWJAEoU6RZyEm5lVSIjTmcdoB9HA==",
			"cpu": [
				"x64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"win32"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/@eslint-community/eslint-plugin-eslint-comments": {
			"version": "4.7.2",
			"resolved": "https://registry.npmjs.org/@eslint-community/eslint-plugin-eslint-comments/-/eslint-plugin-eslint-comments-4.7.2.tgz",
			"integrity": "sha512-LF03qURSwEWm2dz5wtdDCzNk+7Opl0X7q6I3undsaIuNsEiNvRV3BCtqu14Q/6Pzg1tBj44LcxpW2EpSLZStZw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"escape-string-regexp": "^4.0.0",
				"ignore": "^7.0.5"
			},
			"engines": {
				"node": "^12.22.0 || ^14.17.0 || >=16.0.0"
			},
			"funding": {
				"url": "https://opencollective.com/eslint"
			},
			"peerDependencies": {
				"eslint": "^6.0.0 || ^7.0.0 || ^8.0.0 || ^9.0.0 || ^10.0.0"
			}
		},
		"node_modules/@eslint-community/eslint-plugin-eslint-comments/node_modules/ignore": {
			"version": "7.0.8",
			"resolved": "https://registry.npmjs.org/ignore/-/ignore-7.0.8.tgz",
			"integrity": "sha512-YYNsSlXBjMk92SKnkwvB5LOVSa6OznlFUGcsvrFgNJbJCd0M1XKeFVRc8ZByeCqz32FivYNHJVooLmdqrmvp/Q==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">= 4"
			}
		},
		"node_modules/@eslint-community/eslint-utils": {
			"version": "4.10.1",
			"resolved": "https://registry.npmjs.org/@eslint-community/eslint-utils/-/eslint-utils-4.10.1.tgz",
			"integrity": "sha512-cuadcxVFE8sDK6iWJbs8Sn0av2Nrh2QSGQhVlBW9AaAHqHwjWsZHT8LJ4hFGPh7ASBV2deFdM7H/DPjulmh8rg==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"eslint-visitor-keys": "^3.4.3"
			},
			"engines": {
				"node": "^12.22.0 || ^14.17.0 || >=16.0.0"
			},
			"funding": {
				"url": "https://opencollective.com/eslint"
			},
			"peerDependencies": {
				"eslint": "^6.0.0 || ^7.0.0 || >=8.0.0"
			}
		},
		"node_modules/@eslint-community/regexpp": {
			"version": "4.12.2",
			"resolved": "https://registry.npmjs.org/@eslint-community/regexpp/-/regexpp-4.12.2.tgz",
			"integrity": "sha512-EriSTlt5OC9/7SXkRSCAhfSxxoSUgBm33OH+IkwbdpgoqsSsUg7y3uh+IICI/Qg4BBWr3U2i39RpmycbxMq4ew==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": "^12.0.0 || ^14.0.0 || >=16.0.0"
			}
		},
		"node_modules/@eslint/config-array": {
			"version": "0.21.2",
			"resolved": "https://registry.npmjs.org/@eslint/config-array/-/config-array-0.21.2.tgz",
			"integrity": "sha512-nJl2KGTlrf9GjLimgIru+V/mzgSK0ABCDQRvxw5BjURL7WfH5uoWmizbH7QB6MmnMBd8cIC9uceWnezL1VZWWw==",
			"dev": true,
			"license": "Apache-2.0",
			"dependencies": {
				"@eslint/object-schema": "^2.1.7",
				"debug": "^4.3.1",
				"minimatch": "^3.1.5"
			},
			"engines": {
				"node": "^18.18.0 || ^20.9.0 || >=21.1.0"
			}
		},
		"node_modules/@eslint/config-helpers": {
			"version": "0.4.2",
			"resolved": "https://registry.npmjs.org/@eslint/config-helpers/-/config-helpers-0.4.2.tgz",
			"integrity": "sha512-gBrxN88gOIf3R7ja5K9slwNayVcZgK6SOUORm2uBzTeIEfeVaIhOpCtTox3P6R7o2jLFwLFTLnC7kU/RGcYEgw==",
			"dev": true,
			"license": "Apache-2.0",
			"dependencies": {
				"@eslint/core": "^0.17.0"
			},
			"engines": {
				"node": "^18.18.0 || ^20.9.0 || >=21.1.0"
			}
		},
		"node_modules/@eslint/core": {
			"version": "0.17.0",
			"resolved": "https://registry.npmjs.org/@eslint/core/-/core-0.17.0.tgz",
			"integrity": "sha512-yL/sLrpmtDaFEiUj1osRP4TI2MDz1AddJL+jZ7KSqvBuliN4xqYY54IfdN8qD8Toa6g1iloph1fxQNkjOxrrpQ==",
			"dev": true,
			"license": "Apache-2.0",
			"dependencies": {
				"@types/json-schema": "^7.0.15"
			},
			"engines": {
				"node": "^18.18.0 || ^20.9.0 || >=21.1.0"
			}
		},
		"node_modules/@eslint/eslintrc": {
			"version": "2.1.4",
			"resolved": "https://registry.npmjs.org/@eslint/eslintrc/-/eslintrc-2.1.4.tgz",
			"integrity": "sha512-269Z39MS6wVJtsoUl10L60WdkhJVdPG24Q4eZTH3nnF6lpvSShEK3wQjDX9JRWAUPvPh7COouPpU9IrqaZFvtQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"ajv": "^6.12.4",
				"debug": "^4.3.2",
				"espree": "^9.6.0",
				"globals": "^13.19.0",
				"ignore": "^5.2.0",
				"import-fresh": "^3.2.1",
				"js-yaml": "^4.1.0",
				"minimatch": "^3.1.2",
				"strip-json-comments": "^3.1.1"
			},
			"engines": {
				"node": "^12.22.0 || ^14.17.0 || >=16.0.0"
			},
			"funding": {
				"url": "https://opencollective.com/eslint"
			}
		},
		"node_modules/@eslint/js": {
			"version": "8.57.0",
			"resolved": "https://registry.npmjs.org/@eslint/js/-/js-8.57.0.tgz",
			"integrity": "sha512-Ys+3g2TaW7gADOJzPt83SJtCDhMjndcDMFVQ/Tj9iA1BfJzFKD9mAUXT3OenpuPHbI6P/myECxRJrofUsDx/5g==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": "^12.22.0 || ^14.17.0 || >=16.0.0"
			}
		},
		"node_modules/@eslint/json": {
			"version": "0.14.0",
			"resolved": "https://registry.npmjs.org/@eslint/json/-/json-0.14.0.tgz",
			"integrity": "sha512-rvR/EZtvUG3p9uqrSmcDJPYSH7atmWr0RnFWN6m917MAPx82+zQgPUmDu0whPFG6XTyM0vB/hR6c1Q63OaYtCQ==",
			"dev": true,
			"license": "Apache-2.0",
			"dependencies": {
				"@eslint/core": "^0.17.0",
				"@eslint/plugin-kit": "^0.4.1",
				"@humanwhocodes/momoa": "^3.3.10",
				"natural-compare": "^1.4.0"
			},
			"engines": {
				"node": "^18.18.0 || ^20.9.0 || >=21.1.0"
			}
		},
		"node_modules/@eslint/object-schema": {
			"version": "2.1.7",
			"resolved": "https://registry.npmjs.org/@eslint/object-schema/-/object-schema-2.1.7.tgz",
			"integrity": "sha512-VtAOaymWVfZcmZbp6E2mympDIHvyjXs/12LqWYjVw6qjrfF+VK+fyG33kChz3nnK+SU5/NeHOqrTEHS8sXO3OA==",
			"dev": true,
			"license": "Apache-2.0",
			"engines": {
				"node": "^18.18.0 || ^20.9.0 || >=21.1.0"
			}
		},
		"node_modules/@eslint/plugin-kit": {
			"version": "0.4.1",
			"resolved": "https://registry.npmjs.org/@eslint/plugin-kit/-/plugin-kit-0.4.1.tgz",
			"integrity": "sha512-43/qtrDUokr7LJqoF2c3+RInu/t4zfrpYdoSDfYyhg52rwLV6TnOvdG4fXm7IkSB3wErkcmJS9iEhjVtOSEjjA==",
			"dev": true,
			"license": "Apache-2.0",
			"dependencies": {
				"@eslint/core": "^0.17.0",
				"levn": "^0.4.1"
			},
			"engines": {
				"node": "^18.18.0 || ^20.9.0 || >=21.1.0"
			}
		},
		"node_modules/@humanfs/core": {
			"version": "0.19.2",
			"resolved": "https://registry.npmjs.org/@humanfs/core/-/core-0.19.2.tgz",
			"integrity": "sha512-UhXNm+CFMWcbChXywFwkmhqjs3PRCmcSa/hfBgLIb7oQ5HNb1wS0icWsGtSAUNgefHeI+eBrA8I1fxmbHsGdvA==",
			"dev": true,
			"license": "Apache-2.0",
			"dependencies": {
				"@humanfs/types": "^0.15.0"
			},
			"engines": {
				"node": ">=18.18.0"
			}
		},
		"node_modules/@humanfs/node": {
			"version": "0.16.8",
			"resolved": "https://registry.npmjs.org/@humanfs/node/-/node-0.16.8.tgz",
			"integrity": "sha512-gE1eQNZ3R++kTzFUpdGlpmy8kDZD/MLyHqDwqjkVQI0JMdI1D51sy1H958PNXYkM2rAac7e5/CnIKZrHtPh3BQ==",
			"dev": true,
			"license": "Apache-2.0",
			"dependencies": {
				"@humanfs/core": "^0.19.2",
				"@humanfs/types": "^0.15.0",
				"@humanwhocodes/retry": "^0.4.0"
			},
			"engines": {
				"node": ">=18.18.0"
			}
		},
		"node_modules/@humanfs/types": {
			"version": "0.15.0",
			"resolved": "https://registry.npmjs.org/@humanfs/types/-/types-0.15.0.tgz",
			"integrity": "sha512-ZZ1w0aoQkwuUuC7Yf+7sdeaNfqQiiLcSRbfI08oAxqLtpXQr9AIVX7Ay7HLDuiLYAaFPu8oBYNq/QIi9URHJ3Q==",
			"dev": true,
			"license": "Apache-2.0",
			"engines": {
				"node": ">=18.18.0"
			}
		},
		"node_modules/@humanwhocodes/config-array": {
			"version": "0.11.14",
			"resolved": "https://registry.npmjs.org/@humanwhocodes/config-array/-/config-array-0.11.14.tgz",
			"integrity": "sha512-3T8LkOmg45BV5FICb15QQMsyUSWrQ8AygVfC7ZG32zOalnqrilm018ZVCw0eapXux8FtA33q8PSRSstjee3jSg==",
			"deprecated": "Use @eslint/config-array instead",
			"dev": true,
			"license": "Apache-2.0",
			"dependencies": {
				"@humanwhocodes/object-schema": "^2.0.2",
				"debug": "^4.3.1",
				"minimatch": "^3.0.5"
			},
			"engines": {
				"node": ">=10.10.0"
			}
		},
		"node_modules/@humanwhocodes/module-importer": {
			"version": "1.0.1",
			"resolved": "https://registry.npmjs.org/@humanwhocodes/module-importer/-/module-importer-1.0.1.tgz",
			"integrity": "sha512-bxveV4V8v5Yb4ncFTT3rPSgZBOpCkjfK0y4oVVVJwIuDVBRMDXrPyXRL988i5ap9m9bnyEEjWfm5WkBmtffLfA==",
			"dev": true,
			"license": "Apache-2.0",
			"engines": {
				"node": ">=12.22"
			},
			"funding": {
				"type": "github",
				"url": "https://github.com/sponsors/nzakas"
			}
		},
		"node_modules/@humanwhocodes/momoa": {
			"version": "3.3.12",
			"resolved": "https://registry.npmjs.org/@humanwhocodes/momoa/-/momoa-3.3.12.tgz",
			"integrity": "sha512-xS9xl4ieqTqhSZfKV3YXj/htwJCUxbgvkTVaK1fkESgrOzvoVSOTRQeQ8tTLOZUS0Csi2xqtJQXgVTRH5OEbHQ==",
			"dev": true,
			"license": "Apache-2.0",
			"engines": {
				"node": ">=18"
			}
		},
		"node_modules/@humanwhocodes/object-schema": {
			"version": "2.0.3",
			"resolved": "https://registry.npmjs.org/@humanwhocodes/object-schema/-/object-schema-2.0.3.tgz",
			"integrity": "sha512-93zYdMES/c1D69yZiKDBj0V24vqNzB/koF26KPaagAfd3P/4gUlh3Dys5ogAK+Exi9QyzlD8x/08Zt7wIKcDcA==",
			"deprecated": "Use @eslint/object-schema instead",
			"dev": true,
			"license": "BSD-3-Clause"
		},
		"node_modules/@humanwhocodes/retry": {
			"version": "0.4.3",
			"resolved": "https://registry.npmjs.org/@humanwhocodes/retry/-/retry-0.4.3.tgz",
			"integrity": "sha512-bV0Tgo9K4hfPCek+aMAn81RppFKv2ySDQeMoSZuvTASywNTnVJCArCZE2FWqpvIatKu7VMRLWlR1EazvVhDyhQ==",
			"dev": true,
			"license": "Apache-2.0",
			"engines": {
				"node": ">=18.18"
			},
			"funding": {
				"type": "github",
				"url": "https://github.com/sponsors/nzakas"
			}
		},
		"node_modules/@jest/schemas": {
			"version": "29.6.3",
			"resolved": "https://registry.npmjs.org/@jest/schemas/-/schemas-29.6.3.tgz",
			"integrity": "sha512-mo5j5X+jIZmJQveBKeS/clAueipV7KgiX1vMgCxam1RNYiqE1w62n0/tJJnHtjW8ZHcQco5gY85jA3mi0L+nSA==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"@sinclair/typebox": "^0.27.8"
			},
			"engines": {
				"node": "^14.15.0 || ^16.10.0 || >=18.0.0"
			}
		},
		"node_modules/@jridgewell/sourcemap-codec": {
			"version": "1.5.5",
			"resolved": "https://registry.npmjs.org/@jridgewell/sourcemap-codec/-/sourcemap-codec-1.5.5.tgz",
			"integrity": "sha512-cYQ9310grqxueWbl+WuIUIaiUaDcj7WOq5fVhEljNVgRfOUhY9fy2zTvfoqWsnebh8Sl70VScFbICvJnLKB0Og==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/@marijn/find-cluster-break": {
			"version": "1.0.4",
			"resolved": "https://registry.npmjs.org/@marijn/find-cluster-break/-/find-cluster-break-1.0.4.tgz",
			"integrity": "sha512-Wy0V7+SGUjnF9/TkiM1hKVDPj7jKXduPNboMVtHTA8dySMURWqfg/JZ9E2Sq8JgSJmkl7k7Qe9FLeMSrSraWmQ==",
			"dev": true,
			"license": "MIT",
			"peer": true
		},
		"node_modules/@napi-rs/lzma-linux-x64-gnu": {
			"version": "1.5.1",
			"resolved": "https://registry.npmjs.org/@napi-rs/lzma-linux-x64-gnu/-/lzma-linux-x64-gnu-1.5.1.tgz",
			"integrity": "sha512-oTXEIha4SsuXdTA4Iyskj0kpdx2yVXdhd75c2v3xGrHFfVMsbhTPZU/nMPL4sWKo4pBHm3aucLaqGlF696dTyQ==",
			"cpu": [
				"x64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"linux"
			],
			"engines": {
				"node": "^22.20 || ^24.12 || >=25"
			}
		},
		"node_modules/@nodelib/fs.scandir": {
			"version": "2.1.5",
			"resolved": "https://registry.npmjs.org/@nodelib/fs.scandir/-/fs.scandir-2.1.5.tgz",
			"integrity": "sha512-vq24Bq3ym5HEQm2NKCr3yXDwjc7vTsEThRDnkp2DK9p1uqLR+DHurm/NOTo0KG7HYHU7eppKZj3MyqYuMBf62g==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"@nodelib/fs.stat": "2.0.5",
				"run-parallel": "^1.1.9"
			},
			"engines": {
				"node": ">= 8"
			}
		},
		"node_modules/@nodelib/fs.stat": {
			"version": "2.0.5",
			"resolved": "https://registry.npmjs.org/@nodelib/fs.stat/-/fs.stat-2.0.5.tgz",
			"integrity": "sha512-RkhPPp2zrqDAQA/2jNhnztcPAlv64XdhIp7a7454A5ovI7Bukxgt7MX7udwAu3zg1DcpPU0rz3VV1SeaqvY4+A==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">= 8"
			}
		},
		"node_modules/@nodelib/fs.walk": {
			"version": "1.2.8",
			"resolved": "https://registry.npmjs.org/@nodelib/fs.walk/-/fs.walk-1.2.8.tgz",
			"integrity": "sha512-oGB+UxlgWcgQkgwo8GcEGwemoTFt3FIO9ababBmaGwXIoBKZ+GTy0pP185beGg7Llih/NSHSV2XAs1lnznocSg==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"@nodelib/fs.scandir": "2.1.5",
				"fastq": "^1.6.0"
			},
			"engines": {
				"node": ">= 8"
			}
		},
		"node_modules/@pkgr/core": {
			"version": "0.1.2",
			"resolved": "https://registry.npmjs.org/@pkgr/core/-/core-0.1.2.tgz",
			"integrity": "sha512-fdDH1LSGfZdTH2sxdpVMw31BanV28K/Gry0cVFxaNP77neJSkd82mM8ErPNYs9e+0O7SdHBLTDzDgwUuy18RnQ==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": "^12.20.0 || ^14.18.0 || >=16.0.0"
			},
			"funding": {
				"url": "https://opencollective.com/unts"
			}
		},
		"node_modules/@rollup/rollup-android-arm-eabi": {
			"version": "4.62.5",
			"resolved": "https://registry.npmjs.org/@rollup/rollup-android-arm-eabi/-/rollup-android-arm-eabi-4.62.5.tgz",
			"integrity": "sha512-jfkGfTwhQpsiSckPF8r9bU3pn3vyd72NlWaO+TgEO6WPSDnUhXzrNYCHBMOYj0ACaUgjm6eERLF+XV9a6RstoA==",
			"cpu": [
				"arm"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"android"
			]
		},
		"node_modules/@rollup/rollup-android-arm64": {
			"version": "4.62.5",
			"resolved": "https://registry.npmjs.org/@rollup/rollup-android-arm64/-/rollup-android-arm64-4.62.5.tgz",
			"integrity": "sha512-oGVqyQlxnrz9/ty89oHpU857VUHEl5/Xu4R2lS+aivCTrNnSsbiENzTnNaBsjxH0CNWGPhzHArOLFwo+oKXveA==",
			"cpu": [
				"arm64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"android"
			]
		},
		"node_modules/@rollup/rollup-darwin-arm64": {
			"version": "4.62.5",
			"resolved": "https://registry.npmjs.org/@rollup/rollup-darwin-arm64/-/rollup-darwin-arm64-4.62.5.tgz",
			"integrity": "sha512-bW7B8xMEq8n99Q3ieEcPRGuphurdZAaFzQc9Efyyw3FL6DZO6pMy9xhdN+kBoD7Sy05xNXSr4OyPPnpkYriS/A==",
			"cpu": [
				"arm64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"darwin"
			]
		},
		"node_modules/@rollup/rollup-darwin-x64": {
			"version": "4.62.5",
			"resolved": "https://registry.npmjs.org/@rollup/rollup-darwin-x64/-/rollup-darwin-x64-4.62.5.tgz",
			"integrity": "sha512-YSwBS86QeHOGlrxJ1PSOIZSkzRL/JmKeunhc+lV6M1a6En8QuVCD/T/qIA0J4Gd2Y86RIOBYrLcOUtqGh9+/1w==",
			"cpu": [
				"x64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"darwin"
			]
		},
		"node_modules/@rollup/rollup-freebsd-arm64": {
			"version": "4.62.5",
			"resolved": "https://registry.npmjs.org/@rollup/rollup-freebsd-arm64/-/rollup-freebsd-arm64-4.62.5.tgz",
			"integrity": "sha512-2fST8lILgl7cKbme/1KDdPCmbXbG+gqoV3bHp19L0ypX/3akYMBVdOunPleRCwonoLnXOZ/0F+Mt/v8POFmfcQ==",
			"cpu": [
				"arm64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"freebsd"
			]
		},
		"node_modules/@rollup/rollup-freebsd-x64": {
			"version": "4.62.5",
			"resolved": "https://registry.npmjs.org/@rollup/rollup-freebsd-x64/-/rollup-freebsd-x64-4.62.5.tgz",
			"integrity": "sha512-cpIxQCP9J+EVad0a6LO1kY3ZGODlk80VlI+2I96B8xMcdHZ4pLVhfQ49JFpYqjPF91FFkQWftf57YlDcTiw9yQ==",
			"cpu": [
				"x64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"freebsd"
			]
		},
		"node_modules/@rollup/rollup-linux-arm-gnueabihf": {
			"version": "4.62.5",
			"resolved": "https://registry.npmjs.org/@rollup/rollup-linux-arm-gnueabihf/-/rollup-linux-arm-gnueabihf-4.62.5.tgz",
			"integrity": "sha512-r9fGh3eFs3e/udWh5ZjXQtxiYK/xoFxQaYR/cELxac/Udkl5Th+IsFm0CX3Kl9hmUH/we7EoMpjJgeQNnE0+IA==",
			"cpu": [
				"arm"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"linux"
			]
		},
		"node_modules/@rollup/rollup-linux-arm-musleabihf": {
			"version": "4.62.5",
			"resolved": "https://registry.npmjs.org/@rollup/rollup-linux-arm-musleabihf/-/rollup-linux-arm-musleabihf-4.62.5.tgz",
			"integrity": "sha512-xdvFdp7OM6KLJviJT2g/YuRSUjnZgGHk4RNgwIbN7X6cPugOucV60DdHXWzsBVCUdrGb6qSXnJQrrAKMmQuj3Q==",
			"cpu": [
				"arm"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"linux"
			]
		},
		"node_modules/@rollup/rollup-linux-arm64-gnu": {
			"version": "4.62.5",
			"resolved": "https://registry.npmjs.org/@rollup/rollup-linux-arm64-gnu/-/rollup-linux-arm64-gnu-4.62.5.tgz",
			"integrity": "sha512-rRqILAndyzHzP7T9NFQrq+4HFWNhqkqkKur7eiBpfLmz01PO0JKx5Vchu3YllE4YXI/Ftgq/szrDWg5GJ0mI8g==",
			"cpu": [
				"arm64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"linux"
			]
		},
		"node_modules/@rollup/rollup-linux-arm64-musl": {
			"version": "4.62.5",
			"resolved": "https://registry.npmjs.org/@rollup/rollup-linux-arm64-musl/-/rollup-linux-arm64-musl-4.62.5.tgz",
			"integrity": "sha512-Gf4X3qVMucayUvux6aXXPgXovocSFUC0rrffDuPI/S2nHhNMhjcZxsrAFYCOF350PRreW1XwzFj3CT/3bKsWCw==",
			"cpu": [
				"arm64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"linux"
			]
		},
		"node_modules/@rollup/rollup-linux-loong64-gnu": {
			"version": "4.62.5",
			"resolved": "https://registry.npmjs.org/@rollup/rollup-linux-loong64-gnu/-/rollup-linux-loong64-gnu-4.62.5.tgz",
			"integrity": "sha512-+s5qA0TNM0qm8PK/a5gt/1Hpx+NV08uSuCncvhziIlQzT6AEV2fnUQo7eBtFTFO0nA9scauvoR2HusfXmQnO4w==",
			"cpu": [
				"loong64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"linux"
			]
		},
		"node_modules/@rollup/rollup-linux-loong64-musl": {
			"version": "4.62.5",
			"resolved": "https://registry.npmjs.org/@rollup/rollup-linux-loong64-musl/-/rollup-linux-loong64-musl-4.62.5.tgz",
			"integrity": "sha512-ybb6QvWwWJCbBWqERpc8K3pYVGIrXlG8MEQ8IIuJY6Y9KdHQxoFoNyfkAOtKn1VHu3KuLidXvwrvGR1mEjeWCw==",
			"cpu": [
				"loong64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"linux"
			]
		},
		"node_modules/@rollup/rollup-linux-ppc64-gnu": {
			"version": "4.62.5",
			"resolved": "https://registry.npmjs.org/@rollup/rollup-linux-ppc64-gnu/-/rollup-linux-ppc64-gnu-4.62.5.tgz",
			"integrity": "sha512-nZb1DtnOyhCmYvsC8A2CwOkopVg+IS1+fPUa7rMOAXtNw5+lLCLLPqd6XAiNrGtoQKsbvIBOwsHnBH/3wnb4HQ==",
			"cpu": [
				"ppc64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"linux"
			]
		},
		"node_modules/@rollup/rollup-linux-ppc64-musl": {
			"version": "4.62.5",
			"resolved": "https://registry.npmjs.org/@rollup/rollup-linux-ppc64-musl/-/rollup-linux-ppc64-musl-4.62.5.tgz",
			"integrity": "sha512-yMbj63Sp89ryrXLWyz+sy+fYD2HpOnMCLGbe4Oa1smclFSUukdtD/BgdiHaAetJNb74URD8U4hM+qG5KVzMEkg==",
			"cpu": [
				"ppc64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"linux"
			]
		},
		"node_modules/@rollup/rollup-linux-riscv64-gnu": {
			"version": "4.62.5",
			"resolved": "https://registry.npmjs.org/@rollup/rollup-linux-riscv64-gnu/-/rollup-linux-riscv64-gnu-4.62.5.tgz",
			"integrity": "sha512-mhoan3OJw2kYV/e1jtIdmvUZgyBFeA6zGWsOswmR0Tg19TQbowZuR+JMLID6spbbBN7Zee2ejrgmy3+FxGrIdA==",
			"cpu": [
				"riscv64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"linux"
			]
		},
		"node_modules/@rollup/rollup-linux-riscv64-musl": {
			"version": "4.62.5",
			"resolved": "https://registry.npmjs.org/@rollup/rollup-linux-riscv64-musl/-/rollup-linux-riscv64-musl-4.62.5.tgz",
			"integrity": "sha512-5ZTLmjWbb1VZdjuyhe83K/8QO0/h11midQCBP+X5OYn32ra7eOBoM0ZqtaY4nkgNsYgmdVhMYPoyVPTjUpHf3w==",
			"cpu": [
				"riscv64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"linux"
			]
		},
		"node_modules/@rollup/rollup-linux-s390x-gnu": {
			"version": "4.62.5",
			"resolved": "https://registry.npmjs.org/@rollup/rollup-linux-s390x-gnu/-/rollup-linux-s390x-gnu-4.62.5.tgz",
			"integrity": "sha512-m53kG+br6PGxOTmgBEM2DHSDs9RVjsyEbUwjJPJGTFm1grWOG8EKJggDCTb60unD4Tjby8fi7/m9XfkEWasVWg==",
			"cpu": [
				"s390x"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"linux"
			]
		},
		"node_modules/@rollup/rollup-linux-x64-gnu": {
			"version": "4.62.5",
			"resolved": "https://registry.npmjs.org/@rollup/rollup-linux-x64-gnu/-/rollup-linux-x64-gnu-4.62.5.tgz",
			"integrity": "sha512-6RHPJR1g/uvdYU8uXBnfq3nlqyZCP82Fr6NHgfGoaIeSh0YEqnX/x6uA9MmJJbnSH7swqX4F+CkGdUF+6doiQA==",
			"cpu": [
				"x64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"linux"
			]
		},
		"node_modules/@rollup/rollup-linux-x64-musl": {
			"version": "4.62.5",
			"resolved": "https://registry.npmjs.org/@rollup/rollup-linux-x64-musl/-/rollup-linux-x64-musl-4.62.5.tgz",
			"integrity": "sha512-xs+OXQtEXgpXT0DmA5+U3qnRZHdCST/5HRQxS8wSPZTUZN/EMWeHuSIod32LQklTBZBV9DyfncKBQ8n5V3eFdw==",
			"cpu": [
				"x64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"linux"
			]
		},
		"node_modules/@rollup/rollup-openbsd-x64": {
			"version": "4.62.5",
			"resolved": "https://registry.npmjs.org/@rollup/rollup-openbsd-x64/-/rollup-openbsd-x64-4.62.5.tgz",
			"integrity": "sha512-e7hD+sl3s+mcLQDZ8pbudBVsdG6r5yN4w3LqG2TJ8sQHDpblWj5lrJs/3m01Cvlxbt4x13zu5thLjgypgtkYzw==",
			"cpu": [
				"x64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"openbsd"
			]
		},
		"node_modules/@rollup/rollup-openharmony-arm64": {
			"version": "4.62.5",
			"resolved": "https://registry.npmjs.org/@rollup/rollup-openharmony-arm64/-/rollup-openharmony-arm64-4.62.5.tgz",
			"integrity": "sha512-GiyJaCf+WpMub/17aPcKk27QMl5W6f+KhdPTjlFOn5akH5Wa/DCM9Stdx5cDfmasyKB08MqpVQ1uJE2RkkpbXg==",
			"cpu": [
				"arm64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"openharmony"
			]
		},
		"node_modules/@rollup/rollup-win32-arm64-msvc": {
			"version": "4.62.5",
			"resolved": "https://registry.npmjs.org/@rollup/rollup-win32-arm64-msvc/-/rollup-win32-arm64-msvc-4.62.5.tgz",
			"integrity": "sha512-+OQ8U2DdoEfXl8T4Fb18AjmEwbXMerKDKCL8yCPAYhKCEEKoul7rkbeGCBFCbAlaGaa7pmtRTpkAJM2LE/i5FA==",
			"cpu": [
				"arm64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"win32"
			]
		},
		"node_modules/@rollup/rollup-win32-ia32-msvc": {
			"version": "4.62.5",
			"resolved": "https://registry.npmjs.org/@rollup/rollup-win32-ia32-msvc/-/rollup-win32-ia32-msvc-4.62.5.tgz",
			"integrity": "sha512-KanvAZrPKbDBFwrgiU9yEVpQoox9QPV1WZOXX7HudJQY+eSlu82CtWxDU8WtuRRvtN5EGkLczkd6Y6DTcvm9wA==",
			"cpu": [
				"ia32"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"win32"
			]
		},
		"node_modules/@rollup/rollup-win32-x64-gnu": {
			"version": "4.62.5",
			"resolved": "https://registry.npmjs.org/@rollup/rollup-win32-x64-gnu/-/rollup-win32-x64-gnu-4.62.5.tgz",
			"integrity": "sha512-1aC3UEWTtRl3RK3VpDJ/Tqk1XI4SLTmXIthAq6wRWo8XiSXJNd+VprJM4/1P4+i6HIaFEFlVi9sTTziniD2tOQ==",
			"cpu": [
				"x64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"win32"
			]
		},
		"node_modules/@rollup/rollup-win32-x64-msvc": {
			"version": "4.62.5",
			"resolved": "https://registry.npmjs.org/@rollup/rollup-win32-x64-msvc/-/rollup-win32-x64-msvc-4.62.5.tgz",
			"integrity": "sha512-/gDJaRs4gl0NPIwqCz+6PkpmhhjRAD2j6P4rSNHBzUkO3naEx2mIU0pRle1vUNRQ7mE/+8OOeXLTv/J56FKiQg==",
			"cpu": [
				"x64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"win32"
			]
		},
		"node_modules/@rtsao/scc": {
			"version": "1.1.0",
			"resolved": "https://registry.npmjs.org/@rtsao/scc/-/scc-1.1.0.tgz",
			"integrity": "sha512-zt6OdqaDoOnJ1ZYsCYGt9YmWzDXl4vQdKTyJev62gFhRGKdx7mcT54V9KIjg+d2wi9EXsPvAPKe7i7WjfVWB8g==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/@sinclair/typebox": {
			"version": "0.27.12",
			"resolved": "https://registry.npmjs.org/@sinclair/typebox/-/typebox-0.27.12.tgz",
			"integrity": "sha512-hhyNJ+nbR6ZR7pToHvllEFun9TL0sbL+tk/ON75lo+Xas054uez98qRbsuNt7MBCyZKK4+8Yli/OAGZhmfBZ/g==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/@types/codemirror": {
			"version": "5.60.8",
			"resolved": "https://registry.npmjs.org/@types/codemirror/-/codemirror-5.60.8.tgz",
			"integrity": "sha512-VjFgDF/eB+Aklcy15TtOTLQeMjTo07k7KAjql8OK5Dirr7a6sJY4T1uVBDuTVG9VEmn1uUsohOpYnVfgC6/jyw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"@types/tern": "*"
			}
		},
		"node_modules/@types/eslint": {
			"version": "9.6.1",
			"resolved": "https://registry.npmjs.org/@types/eslint/-/eslint-9.6.1.tgz",
			"integrity": "sha512-FXx2pKgId/WyYo2jXw63kk7/+TY7u7AziEJxJAnSFzHlqTAS3Ync6SvgYAN/k4/PQpnnVuzoMuVnByKK2qp0ag==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"@types/estree": "*",
				"@types/json-schema": "*"
			}
		},
		"node_modules/@types/estree": {
			"version": "1.0.9",
			"resolved": "https://registry.npmjs.org/@types/estree/-/estree-1.0.9.tgz",
			"integrity": "sha512-GhdPgy1el4/ImP05X05Uw4cw2/M93BCUmnEvWZNStlCzEKME4Fkk+YpoA5OiHNQmoS7Cafb8Xa3Pya8m1Qrzeg==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/@types/json-schema": {
			"version": "7.0.15",
			"resolved": "https://registry.npmjs.org/@types/json-schema/-/json-schema-7.0.15.tgz",
			"integrity": "sha512-5+fP8P8MFNC+AyZCDxrB2pkZFPGzqQWUzpSeuuVLvm8VMcorNYavBqoFcxK8bQz4Qsbn4oUEEem4wDLfcysGHA==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/@types/json5": {
			"version": "0.0.29",
			"resolved": "https://registry.npmjs.org/@types/json5/-/json5-0.0.29.tgz",
			"integrity": "sha512-dRLjCWHYg4oaA77cxO64oO+7JwCwnIzkZPdrrC71jQmQtlhM556pwKo5bUzqvZndkVbeFLIIi+9TC40JNF5hNQ==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/@types/node": {
			"version": "20.19.43",
			"resolved": "https://registry.npmjs.org/@types/node/-/node-20.19.43.tgz",
			"integrity": "sha512-6oYBAi5ikg4Pl+kGsoYtawUMBT2zZMCvPNF7pVLnHZfd1zf38DRiWn/gT01RYCdUqkv7Fhr+C9ot4/tb+2sVvA==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"undici-types": "~6.21.0"
			}
		},
		"node_modules/@types/tern": {
			"version": "0.23.9",
			"resolved": "https://registry.npmjs.org/@types/tern/-/tern-0.23.9.tgz",
			"integrity": "sha512-ypzHFE/wBzh+BlH6rrBgS5I/Z7RD21pGhZ2rltb/+ZrVM1awdZwjx7hE5XfuYgHWk9uvV5HLZN3SloevCAp3Bw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"@types/estree": "*"
			}
		},
		"node_modules/@typescript-eslint/eslint-plugin": {
			"version": "8.69.0",
			"resolved": "https://registry.npmjs.org/@typescript-eslint/eslint-plugin/-/eslint-plugin-8.69.0.tgz",
			"integrity": "sha512-t5jQTKPIgVW1PE6dR6H6Qz5gm8zjMlX5/2gRaOGd9eO6V7J+tQc6iWKukEe7dY8u9HyYasQ0yfF0/FSSTEO2gA==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"@eslint-community/regexpp": "^4.12.2",
				"@typescript-eslint/scope-manager": "8.69.0",
				"@typescript-eslint/type-utils": "8.69.0",
				"@typescript-eslint/utils": "8.69.0",
				"@typescript-eslint/visitor-keys": "8.69.0",
				"ignore": "^7.0.5",
				"natural-compare": "^1.4.0",
				"ts-api-utils": "^2.5.0"
			},
			"engines": {
				"node": "^18.18.0 || ^20.9.0 || >=21.1.0"
			},
			"funding": {
				"type": "opencollective",
				"url": "https://opencollective.com/typescript-eslint"
			},
			"peerDependencies": {
				"@typescript-eslint/parser": "^8.69.0",
				"eslint": "^8.57.0 || ^9.0.0 || ^10.0.0",
				"typescript": ">=4.8.4 <6.1.0"
			}
		},
		"node_modules/@typescript-eslint/eslint-plugin/node_modules/ignore": {
			"version": "7.0.8",
			"resolved": "https://registry.npmjs.org/ignore/-/ignore-7.0.8.tgz",
			"integrity": "sha512-YYNsSlXBjMk92SKnkwvB5LOVSa6OznlFUGcsvrFgNJbJCd0M1XKeFVRc8ZByeCqz32FivYNHJVooLmdqrmvp/Q==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">= 4"
			}
		},
		"node_modules/@typescript-eslint/parser": {
			"version": "8.69.0",
			"resolved": "https://registry.npmjs.org/@typescript-eslint/parser/-/parser-8.69.0.tgz",
			"integrity": "sha512-l4b0DhWioGg6Gt2ebGlvfkFMOjRsauxtsnDRwUSRX1qHq3HdTfQHV8wW9zEXeciai6HfeaKOedQn2Zoofx3WBw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"@typescript-eslint/scope-manager": "8.69.0",
				"@typescript-eslint/types": "8.69.0",
				"@typescript-eslint/typescript-estree": "8.69.0",
				"@typescript-eslint/visitor-keys": "8.69.0",
				"debug": "^4.4.3"
			},
			"engines": {
				"node": "^18.18.0 || ^20.9.0 || >=21.1.0"
			},
			"funding": {
				"type": "opencollective",
				"url": "https://opencollective.com/typescript-eslint"
			},
			"peerDependencies": {
				"eslint": "^8.57.0 || ^9.0.0 || ^10.0.0",
				"typescript": ">=4.8.4 <6.1.0"
			}
		},
		"node_modules/@typescript-eslint/project-service": {
			"version": "8.69.0",
			"resolved": "https://registry.npmjs.org/@typescript-eslint/project-service/-/project-service-8.69.0.tgz",
			"integrity": "sha512-yi4obFrHMmnsesWehHbkg9zMA7Jt8cXT+mKM08G999pH1yT6nqgsHx7MYm0uY1wAj8CqiBXYRJ7WAT0QdQHQXg==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"@typescript-eslint/tsconfig-utils": "^8.69.0",
				"@typescript-eslint/types": "^8.69.0",
				"debug": "^4.4.3"
			},
			"engines": {
				"node": "^18.18.0 || ^20.9.0 || >=21.1.0"
			},
			"funding": {
				"type": "opencollective",
				"url": "https://opencollective.com/typescript-eslint"
			},
			"peerDependencies": {
				"typescript": ">=4.8.4 <6.1.0"
			}
		},
		"node_modules/@typescript-eslint/scope-manager": {
			"version": "8.69.0",
			"resolved": "https://registry.npmjs.org/@typescript-eslint/scope-manager/-/scope-manager-8.69.0.tgz",
			"integrity": "sha512-ewfspqWvSxKSOaplqAUNbaSFO0eB6w1EtQ+esfYFRm3614Ty4uNtExkcbgd6nWsXphbqKyf9ZYdbZdv2xEoWEQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"@typescript-eslint/types": "8.69.0",
				"@typescript-eslint/visitor-keys": "8.69.0"
			},
			"engines": {
				"node": "^18.18.0 || ^20.9.0 || >=21.1.0"
			},
			"funding": {
				"type": "opencollective",
				"url": "https://opencollective.com/typescript-eslint"
			}
		},
		"node_modules/@typescript-eslint/tsconfig-utils": {
			"version": "8.69.0",
			"resolved": "https://registry.npmjs.org/@typescript-eslint/tsconfig-utils/-/tsconfig-utils-8.69.0.tgz",
			"integrity": "sha512-xNqK7YTDZsLniQMV/4rpFR8Z5JlqeRvVjuG1YgF/mdPVH84HSD19L8CczMA0qg2RfwEV231GHH3VnToJDo4MfQ==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": "^18.18.0 || ^20.9.0 || >=21.1.0"
			},
			"funding": {
				"type": "opencollective",
				"url": "https://opencollective.com/typescript-eslint"
			},
			"peerDependencies": {
				"typescript": ">=4.8.4 <6.1.0"
			}
		},
		"node_modules/@typescript-eslint/type-utils": {
			"version": "8.69.0",
			"resolved": "https://registry.npmjs.org/@typescript-eslint/type-utils/-/type-utils-8.69.0.tgz",
			"integrity": "sha512-ZfoJAVg3JZndQEpEl9petVlxau3lRuElc4HRMuAlLCf8to04/iHz692RUSNmXKDjEuJmIL+KZ2/BsOcBc16dsA==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"@typescript-eslint/types": "8.69.0",
				"@typescript-eslint/typescript-estree": "8.69.0",
				"@typescript-eslint/utils": "8.69.0",
				"debug": "^4.4.3",
				"ts-api-utils": "^2.5.0"
			},
			"engines": {
				"node": "^18.18.0 || ^20.9.0 || >=21.1.0"
			},
			"funding": {
				"type": "opencollective",
				"url": "https://opencollective.com/typescript-eslint"
			},
			"peerDependencies": {
				"eslint": "^8.57.0 || ^9.0.0 || ^10.0.0",
				"typescript": ">=4.8.4 <6.1.0"
			}
		},
		"node_modules/@typescript-eslint/types": {
			"version": "8.69.0",
			"resolved": "https://registry.npmjs.org/@typescript-eslint/types/-/types-8.69.0.tgz",
			"integrity": "sha512-K3VrubUPhlo9VDBS6QdI8YB5j7ClpqLRdefcz6PFrhnwicehBweqQ9Evhl4l+FYz0HdDmMqIiSX0aldGRYtDCA==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": "^18.18.0 || ^20.9.0 || >=21.1.0"
			},
			"funding": {
				"type": "opencollective",
				"url": "https://opencollective.com/typescript-eslint"
			}
		},
		"node_modules/@typescript-eslint/typescript-estree": {
			"version": "8.69.0",
			"resolved": "https://registry.npmjs.org/@typescript-eslint/typescript-estree/-/typescript-estree-8.69.0.tgz",
			"integrity": "sha512-AdFkgqck3Vudb/kWnxlyafU/4aBhHrbQ9locP2N4psXTy5mOBg0SHJumnLvx7r6g1gV4DKvUFwV2nJZBoqOD8w==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"@typescript-eslint/project-service": "8.69.0",
				"@typescript-eslint/tsconfig-utils": "8.69.0",
				"@typescript-eslint/types": "8.69.0",
				"@typescript-eslint/visitor-keys": "8.69.0",
				"debug": "^4.4.3",
				"minimatch": "^10.2.2",
				"semver": "^7.7.3",
				"tinyglobby": "^0.2.15",
				"ts-api-utils": "^2.5.0"
			},
			"engines": {
				"node": "^18.18.0 || ^20.9.0 || >=21.1.0"
			},
			"funding": {
				"type": "opencollective",
				"url": "https://opencollective.com/typescript-eslint"
			},
			"peerDependencies": {
				"typescript": ">=4.8.4 <6.1.0"
			}
		},
		"node_modules/@typescript-eslint/typescript-estree/node_modules/balanced-match": {
			"version": "4.0.4",
			"resolved": "https://registry.npmjs.org/balanced-match/-/balanced-match-4.0.4.tgz",
			"integrity": "sha512-BLrgEcRTwX2o6gGxGOCNyMvGSp35YofuYzw9h1IMTRmKqttAZZVU67bdb9Pr2vUHA8+j3i2tJfjO6C6+4myGTA==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": "18 || 20 || >=22"
			}
		},
		"node_modules/@typescript-eslint/typescript-estree/node_modules/brace-expansion": {
			"version": "5.0.9",
			"resolved": "https://registry.npmjs.org/brace-expansion/-/brace-expansion-5.0.9.tgz",
			"integrity": "sha512-ScQ4IuvIEF1TMlP7Zt+vjJ//9zlPb2SDcxWxM3bk8s6t6GGdJ7KO1dCcTidOPJKePW30LE/2cT7wCyPho9/Wxg==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"balanced-match": "^4.0.2"
			},
			"engines": {
				"node": "20 || >=22"
			}
		},
		"node_modules/@typescript-eslint/typescript-estree/node_modules/minimatch": {
			"version": "10.2.6",
			"resolved": "https://registry.npmjs.org/minimatch/-/minimatch-10.2.6.tgz",
			"integrity": "sha512-vpLQEs+VLCr1nU0BXS07maYoFwlDAH0gngQuuttxIwutDFEMHq2blX+8vpgxDdK3J1PwjCJiep77OitTZ4Ll1A==",
			"dev": true,
			"license": "BlueOak-1.0.0",
			"dependencies": {
				"brace-expansion": "^5.0.8"
			},
			"engines": {
				"node": "18 || 20 || >=22"
			},
			"funding": {
				"url": "https://github.com/sponsors/isaacs"
			}
		},
		"node_modules/@typescript-eslint/utils": {
			"version": "8.69.0",
			"resolved": "https://registry.npmjs.org/@typescript-eslint/utils/-/utils-8.69.0.tgz",
			"integrity": "sha512-tUbx60BBqQa31kXF5MCsOOLL5E/WzUuxIn7YpAvq+eaUlqvk8/NXnXMBNAdLCr0icjkzem7iUA5QqWHe/hJ1aw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"@eslint-community/eslint-utils": "^4.9.1",
				"@typescript-eslint/scope-manager": "8.69.0",
				"@typescript-eslint/types": "8.69.0",
				"@typescript-eslint/typescript-estree": "8.69.0"
			},
			"engines": {
				"node": "^18.18.0 || ^20.9.0 || >=21.1.0"
			},
			"funding": {
				"type": "opencollective",
				"url": "https://opencollective.com/typescript-eslint"
			},
			"peerDependencies": {
				"eslint": "^8.57.0 || ^9.0.0 || ^10.0.0",
				"typescript": ">=4.8.4 <6.1.0"
			}
		},
		"node_modules/@typescript-eslint/visitor-keys": {
			"version": "8.69.0",
			"resolved": "https://registry.npmjs.org/@typescript-eslint/visitor-keys/-/visitor-keys-8.69.0.tgz",
			"integrity": "sha512-+rmdgPA+EXkNgKYvHvFfhrs35utXbwaC5PGpDquSXcoXQDKUA5UjV0LmTucG/4JXkM31BTu4TilHtrN8IVBe8w==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"@typescript-eslint/types": "8.69.0",
				"eslint-visitor-keys": "^5.0.0"
			},
			"engines": {
				"node": "^18.18.0 || ^20.9.0 || >=21.1.0"
			},
			"funding": {
				"type": "opencollective",
				"url": "https://opencollective.com/typescript-eslint"
			}
		},
		"node_modules/@typescript-eslint/visitor-keys/node_modules/eslint-visitor-keys": {
			"version": "5.0.1",
			"resolved": "https://registry.npmjs.org/eslint-visitor-keys/-/eslint-visitor-keys-5.0.1.tgz",
			"integrity": "sha512-tD40eHxA35h0PEIZNeIjkHoDR4YjjJp34biM0mDvplBe//mB+IHCqHDGV7pxF+7MklTvighcCPPZC7ynWyjdTA==",
			"dev": true,
			"license": "Apache-2.0",
			"engines": {
				"node": "^20.19.0 || ^22.13.0 || >=24"
			},
			"funding": {
				"url": "https://opencollective.com/eslint"
			}
		},
		"node_modules/@ungap/structured-clone": {
			"version": "1.4.0",
			"resolved": "https://registry.npmjs.org/@ungap/structured-clone/-/structured-clone-1.4.0.tgz",
			"integrity": "sha512-1mEZtMKPM09vDmQt5y7YvmN2+DFTP7Tg0EWXdic8/C6VRnpb33e4ghisCIE3WZjsE2N8mf+QV1Zqh7ZFYLWInQ==",
			"dev": true,
			"license": "ISC"
		},
		"node_modules/@vitest/expect": {
			"version": "1.6.1",
			"resolved": "https://registry.npmjs.org/@vitest/expect/-/expect-1.6.1.tgz",
			"integrity": "sha512-jXL+9+ZNIJKruofqXuuTClf44eSpcHlgj3CiuNihUF3Ioujtmc0zIa3UJOW5RjDK1YLBJZnWBlPuqhYycLioog==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"@vitest/spy": "1.6.1",
				"@vitest/utils": "1.6.1",
				"chai": "^4.3.10"
			},
			"funding": {
				"url": "https://opencollective.com/vitest"
			}
		},
		"node_modules/@vitest/runner": {
			"version": "1.6.1",
			"resolved": "https://registry.npmjs.org/@vitest/runner/-/runner-1.6.1.tgz",
			"integrity": "sha512-3nSnYXkVkf3mXFfE7vVyPmi3Sazhb/2cfZGGs0JRzFsPFvAMBEcrweV1V1GsrstdXeKCTXlJbvnQwGWgEIHmOA==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"@vitest/utils": "1.6.1",
				"p-limit": "^5.0.0",
				"pathe": "^1.1.1"
			},
			"funding": {
				"url": "https://opencollective.com/vitest"
			}
		},
		"node_modules/@vitest/snapshot": {
			"version": "1.6.1",
			"resolved": "https://registry.npmjs.org/@vitest/snapshot/-/snapshot-1.6.1.tgz",
			"integrity": "sha512-WvidQuWAzU2p95u8GAKlRMqMyN1yOJkGHnx3M1PL9Raf7AQ1kwLKg04ADlCa3+OXUZE7BceOhVZiuWAbzCKcUQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"magic-string": "^0.30.5",
				"pathe": "^1.1.1",
				"pretty-format": "^29.7.0"
			},
			"funding": {
				"url": "https://opencollective.com/vitest"
			}
		},
		"node_modules/@vitest/spy": {
			"version": "1.6.1",
			"resolved": "https://registry.npmjs.org/@vitest/spy/-/spy-1.6.1.tgz",
			"integrity": "sha512-MGcMmpGkZebsMZhbQKkAf9CX5zGvjkBTqf8Zx3ApYWXr3wG+QvEu2eXWfnIIWYSJExIp4V9FCKDEeygzkYrXMw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"tinyspy": "^2.2.0"
			},
			"funding": {
				"url": "https://opencollective.com/vitest"
			}
		},
		"node_modules/@vitest/utils": {
			"version": "1.6.1",
			"resolved": "https://registry.npmjs.org/@vitest/utils/-/utils-1.6.1.tgz",
			"integrity": "sha512-jOrrUvXM4Av9ZWiG1EajNto0u96kWAhJ1LmPmJhXXQx/32MecEKd10pOLYgS2BQx1TgkGhloPU1ArDW2vvaY6g==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"diff-sequences": "^29.6.3",
				"estree-walker": "^3.0.3",
				"loupe": "^2.3.7",
				"pretty-format": "^29.7.0"
			},
			"funding": {
				"url": "https://opencollective.com/vitest"
			}
		},
		"node_modules/acorn": {
			"version": "8.18.0",
			"resolved": "https://registry.npmjs.org/acorn/-/acorn-8.18.0.tgz",
			"integrity": "sha512-lGq+9yr1/GuAWaVYIHRjvvySG5/4VfKIvC8EWxStPdcDh/Ka7FG3twP6v4d5BkravUilhIAsG4Qj83t02LWUPQ==",
			"dev": true,
			"license": "MIT",
			"bin": {
				"acorn": "bin/acorn"
			},
			"engines": {
				"node": ">=0.4.0"
			}
		},
		"node_modules/acorn-jsx": {
			"version": "5.3.2",
			"resolved": "https://registry.npmjs.org/acorn-jsx/-/acorn-jsx-5.3.2.tgz",
			"integrity": "sha512-rq9s+JNhf0IChjtDXxllJ7g41oZk5SlXtp0LHwyA5cejwn7vKmKp4pPri6YEePv2PU65sAsegbXtIinmDFDXgQ==",
			"dev": true,
			"license": "MIT",
			"peerDependencies": {
				"acorn": "^6.0.0 || ^7.0.0 || ^8.0.0"
			}
		},
		"node_modules/acorn-walk": {
			"version": "8.3.5",
			"resolved": "https://registry.npmjs.org/acorn-walk/-/acorn-walk-8.3.5.tgz",
			"integrity": "sha512-HEHNfbars9v4pgpW6SO1KSPkfoS0xVOM/9UzkJltjlsHZmJasxg8aXkuZa7SMf8vKGIBhpUsPluQSqhJFCqebw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"acorn": "^8.11.0"
			},
			"engines": {
				"node": ">=0.4.0"
			}
		},
		"node_modules/ajv": {
			"version": "6.15.0",
			"resolved": "https://registry.npmjs.org/ajv/-/ajv-6.15.0.tgz",
			"integrity": "sha512-fgFx7Hfoq60ytK2c7DhnF8jIvzYgOMxfugjLOSMHjLIPgenqa7S7oaagATUq99mV6IYvN2tRmC0wnTYX6iPbMw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"fast-deep-equal": "^3.1.1",
				"fast-json-stable-stringify": "^2.0.0",
				"json-schema-traverse": "^0.4.1",
				"uri-js": "^4.2.2"
			},
			"funding": {
				"type": "github",
				"url": "https://github.com/sponsors/epoberezkin"
			}
		},
		"node_modules/ansi-regex": {
			"version": "5.0.1",
			"resolved": "https://registry.npmjs.org/ansi-regex/-/ansi-regex-5.0.1.tgz",
			"integrity": "sha512-quJQXlTSUGL2LH9SUXo8VwsY4soanhgo6LNSm84E1LBcE8s3O0wpdiRzyR9z/ZZJMlMWv37qOOb9pdJlMUEKFQ==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">=8"
			}
		},
		"node_modules/ansi-styles": {
			"version": "5.2.0",
			"resolved": "https://registry.npmjs.org/ansi-styles/-/ansi-styles-5.2.0.tgz",
			"integrity": "sha512-Cxwpt2SfTzTtXcfOlzGEee8O+c+MmUgGrNiBcXnuWxuFJHe6a5Hz7qwhwe5OgaSYI0IJvkLqWX1ASG+cJOkEiA==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">=10"
			},
			"funding": {
				"url": "https://github.com/chalk/ansi-styles?sponsor=1"
			}
		},
		"node_modules/argparse": {
			"version": "2.0.1",
			"resolved": "https://registry.npmjs.org/argparse/-/argparse-2.0.1.tgz",
			"integrity": "sha512-8+9WqebbFzpX9OR+Wa6O29asIogeRMzcGtAINdpMHHyAg10f05aSFVBbcEqGf/PXw1EjAZ+q2/bEBg3DvurK3Q==",
			"dev": true,
			"license": "Python-2.0"
		},
		"node_modules/array-buffer-byte-length": {
			"version": "1.0.2",
			"resolved": "https://registry.npmjs.org/array-buffer-byte-length/-/array-buffer-byte-length-1.0.2.tgz",
			"integrity": "sha512-LHE+8BuR7RYGDKvnrmcuSq3tDcKv9OFEXQt/HpbZhY7V6h0zlUXutnAD82GiFx9rdieCMjkvtcsPqBwgUl1Iiw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bound": "^1.0.3",
				"is-array-buffer": "^3.0.5"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/array-includes": {
			"version": "3.1.9",
			"resolved": "https://registry.npmjs.org/array-includes/-/array-includes-3.1.9.tgz",
			"integrity": "sha512-FmeCCAenzH0KH381SPT5FZmiA/TmpndpcaShhfgEN9eCVjnFBqq3l1xrI42y8+PPLI6hypzou4GXw00WHmPBLQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bind": "^1.0.8",
				"call-bound": "^1.0.4",
				"define-properties": "^1.2.1",
				"es-abstract": "^1.24.0",
				"es-object-atoms": "^1.1.1",
				"get-intrinsic": "^1.3.0",
				"is-string": "^1.1.1",
				"math-intrinsics": "^1.1.0"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/array.prototype.findlast": {
			"version": "1.2.5",
			"resolved": "https://registry.npmjs.org/array.prototype.findlast/-/array.prototype.findlast-1.2.5.tgz",
			"integrity": "sha512-CVvd6FHg1Z3POpBLxO6E6zr+rSKEQ9L6rZHAaY7lLfhKsWYUBBOuMs0e9o24oopj6H+geRCX0YJ+TJLBK2eHyQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bind": "^1.0.7",
				"define-properties": "^1.2.1",
				"es-abstract": "^1.23.2",
				"es-errors": "^1.3.0",
				"es-object-atoms": "^1.0.0",
				"es-shim-unscopables": "^1.0.2"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/array.prototype.findlastindex": {
			"version": "1.2.6",
			"resolved": "https://registry.npmjs.org/array.prototype.findlastindex/-/array.prototype.findlastindex-1.2.6.tgz",
			"integrity": "sha512-F/TKATkzseUExPlfvmwQKGITM3DGTK+vkAsCZoDc5daVygbJBnjEUCbgkAvVFsgfXfX4YIqZ/27G3k3tdXrTxQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bind": "^1.0.8",
				"call-bound": "^1.0.4",
				"define-properties": "^1.2.1",
				"es-abstract": "^1.23.9",
				"es-errors": "^1.3.0",
				"es-object-atoms": "^1.1.1",
				"es-shim-unscopables": "^1.1.0"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/array.prototype.flat": {
			"version": "1.3.3",
			"resolved": "https://registry.npmjs.org/array.prototype.flat/-/array.prototype.flat-1.3.3.tgz",
			"integrity": "sha512-rwG/ja1neyLqCuGZ5YYrznA62D4mZXg0i1cIskIUKSiqF3Cje9/wXAls9B9s1Wa2fomMsIv8czB8jZcPmxCXFg==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bind": "^1.0.8",
				"define-properties": "^1.2.1",
				"es-abstract": "^1.23.5",
				"es-shim-unscopables": "^1.0.2"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/array.prototype.flatmap": {
			"version": "1.3.3",
			"resolved": "https://registry.npmjs.org/array.prototype.flatmap/-/array.prototype.flatmap-1.3.3.tgz",
			"integrity": "sha512-Y7Wt51eKJSyi80hFrJCePGGNo5ktJCslFuboqJsbf57CCPcm5zztluPlc4/aD8sWsKvlwatezpV4U1efk8kpjg==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bind": "^1.0.8",
				"define-properties": "^1.2.1",
				"es-abstract": "^1.23.5",
				"es-shim-unscopables": "^1.0.2"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/array.prototype.tosorted": {
			"version": "1.1.4",
			"resolved": "https://registry.npmjs.org/array.prototype.tosorted/-/array.prototype.tosorted-1.1.4.tgz",
			"integrity": "sha512-p6Fx8B7b7ZhL/gmUsAy0D15WhvDccw3mnGNbZpi3pmeJdxtWsj2jEaI4Y6oo3XiHfzuSgPwKc04MYt6KgvC/wA==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bind": "^1.0.7",
				"define-properties": "^1.2.1",
				"es-abstract": "^1.23.3",
				"es-errors": "^1.3.0",
				"es-shim-unscopables": "^1.0.2"
			},
			"engines": {
				"node": ">= 0.4"
			}
		},
		"node_modules/arraybuffer.prototype.slice": {
			"version": "1.0.4",
			"resolved": "https://registry.npmjs.org/arraybuffer.prototype.slice/-/arraybuffer.prototype.slice-1.0.4.tgz",
			"integrity": "sha512-BNoCY6SXXPQ7gF2opIP4GBE+Xw7U+pHMYKuzjgCN3GwiaIR09UUeKfheyIry77QtrCBlC0KK0q5/TER/tYh3PQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"array-buffer-byte-length": "^1.0.1",
				"call-bind": "^1.0.8",
				"define-properties": "^1.2.1",
				"es-abstract": "^1.23.5",
				"es-errors": "^1.3.0",
				"get-intrinsic": "^1.2.6",
				"is-array-buffer": "^3.0.4"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/assertion-error": {
			"version": "1.1.0",
			"resolved": "https://registry.npmjs.org/assertion-error/-/assertion-error-1.1.0.tgz",
			"integrity": "sha512-jgsaNduz+ndvGyFt3uSuWqvy4lCnIJiovtouQN5JZHOKCS2QuhEdbcQHFhVksz2N2U9hXJo8odG7ETyWlEeuDw==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": "*"
			}
		},
		"node_modules/async-function": {
			"version": "1.0.0",
			"resolved": "https://registry.npmjs.org/async-function/-/async-function-1.0.0.tgz",
			"integrity": "sha512-hsU18Ae8CDTR6Kgu9DYf0EbCr/a5iGL0rytQDobUcdpYOKokk8LEjVphnXkDkgpi0wYVsqrXuP0bZxJaTqdgoA==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">= 0.4"
			}
		},
		"node_modules/available-typed-arrays": {
			"version": "1.0.7",
			"resolved": "https://registry.npmjs.org/available-typed-arrays/-/available-typed-arrays-1.0.7.tgz",
			"integrity": "sha512-wvUjBtSGN7+7SjNpq/9M2Tg350UZD3q62IFZLbRAR1bSMlCo1ZaeW+BJ+D090e4hIIZLBcTDWe4Mh4jvUDajzQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"possible-typed-array-names": "^1.0.0"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/balanced-match": {
			"version": "1.0.2",
			"resolved": "https://registry.npmjs.org/balanced-match/-/balanced-match-1.0.2.tgz",
			"integrity": "sha512-3oSeUO0TMV67hN1AmbXsK4yaqU7tjiHlbxRDZOpH0KW9+CeX4bRAaX0Anxt0tx2MrpRpWwQaPwIlISEJhYU5Pw==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/brace-expansion": {
			"version": "1.1.18",
			"resolved": "https://registry.npmjs.org/brace-expansion/-/brace-expansion-1.1.18.tgz",
			"integrity": "sha512-Edep/X9fGqVNmzKBVsDYIOtD+z1tuezV70LBjdCst9Tqu76lsnvRiZ6oTic1n+/BIwX6QDGAO94PN4N2SADvtw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"balanced-match": "^1.0.0",
				"concat-map": "0.0.1"
			}
		},
		"node_modules/builtin-modules": {
			"version": "3.3.0",
			"resolved": "https://registry.npmjs.org/builtin-modules/-/builtin-modules-3.3.0.tgz",
			"integrity": "sha512-zhaCDicdLuWN5UbN5IMnFqNMhNfo919sH85y2/ea+5Yg9TsTkeZxpL+JLbp6cgYFS4sRLp3YV4S6yDuqVWHYOw==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">=6"
			},
			"funding": {
				"url": "https://github.com/sponsors/sindresorhus"
			}
		},
		"node_modules/cac": {
			"version": "6.7.14",
			"resolved": "https://registry.npmjs.org/cac/-/cac-6.7.14.tgz",
			"integrity": "sha512-b6Ilus+c3RrdDk+JhLKUAQfzzgLEPy6wcXqS7f/xe1EETvsDP6GORG7SFuOs6cID5YkqchW/LXZbX5bc8j7ZcQ==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">=8"
			}
		},
		"node_modules/call-bind": {
			"version": "1.0.9",
			"resolved": "https://registry.npmjs.org/call-bind/-/call-bind-1.0.9.tgz",
			"integrity": "sha512-a/hy+pNsFUTR+Iz8TCJvXudKVLAnz/DyeSUo10I5yvFDQJBFU2s9uqQpoSrJlroHUKoKqzg+epxyP9lqFdzfBQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bind-apply-helpers": "^1.0.2",
				"es-define-property": "^1.0.1",
				"get-intrinsic": "^1.3.0",
				"set-function-length": "^1.2.2"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/call-bind-apply-helpers": {
			"version": "1.0.2",
			"resolved": "https://registry.npmjs.org/call-bind-apply-helpers/-/call-bind-apply-helpers-1.0.2.tgz",
			"integrity": "sha512-Sp1ablJ0ivDkSzjcaJdxEunN5/XvksFJ2sMBFfq6x0ryhQV/2b/KwFe21cMpmHtPOSij8K99/wSfoEuTObmuMQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"es-errors": "^1.3.0",
				"function-bind": "^1.1.2"
			},
			"engines": {
				"node": ">= 0.4"
			}
		},
		"node_modules/call-bound": {
			"version": "1.0.4",
			"resolved": "https://registry.npmjs.org/call-bound/-/call-bound-1.0.4.tgz",
			"integrity": "sha512-+ys997U96po4Kx/ABpBCqhA9EuxJaQWDQg7295H4hBphv3IZg0boBKuwYpt4YXp6MZ5AmZQnU/tyMTlRpaSejg==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bind-apply-helpers": "^1.0.2",
				"get-intrinsic": "^1.3.0"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/callsites": {
			"version": "3.1.0",
			"resolved": "https://registry.npmjs.org/callsites/-/callsites-3.1.0.tgz",
			"integrity": "sha512-P8BjAsXvZS+VIDUI11hHCQEv74YT67YUi5JJFNWIqL235sBmjX4+qx9Muvls5ivyNENctx46xQLQ3aTuE7ssaQ==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">=6"
			}
		},
		"node_modules/chai": {
			"version": "4.5.0",
			"resolved": "https://registry.npmjs.org/chai/-/chai-4.5.0.tgz",
			"integrity": "sha512-RITGBfijLkBddZvnn8jdqoTypxvqbOLYQkGGxXzeFjVHvudaPw0HNFD9x928/eUwYWd2dPCugVqspGALTZZQKw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"assertion-error": "^1.1.0",
				"check-error": "^1.0.3",
				"deep-eql": "^4.1.3",
				"get-func-name": "^2.0.2",
				"loupe": "^2.3.6",
				"pathval": "^1.1.1",
				"type-detect": "^4.1.0"
			},
			"engines": {
				"node": ">=4"
			}
		},
		"node_modules/chalk": {
			"version": "4.1.2",
			"resolved": "https://registry.npmjs.org/chalk/-/chalk-4.1.2.tgz",
			"integrity": "sha512-oKnbhFyRIXpUuez8iBMmyEa4nbj4IOQyuhc/wy9kY7/WVPcwIO9VA668Pu8RkO7+0G76SLROeyw9CpQ061i4mA==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"ansi-styles": "^4.1.0",
				"supports-color": "^7.1.0"
			},
			"engines": {
				"node": ">=10"
			},
			"funding": {
				"url": "https://github.com/chalk/chalk?sponsor=1"
			}
		},
		"node_modules/chalk/node_modules/ansi-styles": {
			"version": "4.3.0",
			"resolved": "https://registry.npmjs.org/ansi-styles/-/ansi-styles-4.3.0.tgz",
			"integrity": "sha512-zbB9rCJAT1rbjiVDb2hqKFHNYLxgtk8NURxZ3IZwD3F6NtxbXZQCnnSi1Lkx+IDohdPlFp222wVALIheZJQSEg==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"color-convert": "^2.0.1"
			},
			"engines": {
				"node": ">=8"
			},
			"funding": {
				"url": "https://github.com/chalk/ansi-styles?sponsor=1"
			}
		},
		"node_modules/check-error": {
			"version": "1.0.3",
			"resolved": "https://registry.npmjs.org/check-error/-/check-error-1.0.3.tgz",
			"integrity": "sha512-iKEoDYaRmd1mxM90a2OEfWhjsjPpYPuQ+lMYsoxB126+t8fw7ySEO48nmDg5COTjxDI65/Y2OWpeEHk3ZOe8zg==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"get-func-name": "^2.0.2"
			},
			"engines": {
				"node": "*"
			}
		},
		"node_modules/color-convert": {
			"version": "2.0.1",
			"resolved": "https://registry.npmjs.org/color-convert/-/color-convert-2.0.1.tgz",
			"integrity": "sha512-RRECPsj7iu/xb5oKYcsFHSppFNnsj/52OVTRKb4zP5onXwVF3zVmmToNcOfGC+CRDpfK/U584fMg38ZHCaElKQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"color-name": "~1.1.4"
			},
			"engines": {
				"node": ">=7.0.0"
			}
		},
		"node_modules/color-name": {
			"version": "1.1.4",
			"resolved": "https://registry.npmjs.org/color-name/-/color-name-1.1.4.tgz",
			"integrity": "sha512-dOy+3AuW3a2wNbZHIuMZpTcgjGuLU/uBL/ubcZF9OXbDo8ff4O8yVp5Bf0efS8uEoYo5q4Fx7dY9OgQGXgAsQA==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/concat-map": {
			"version": "0.0.1",
			"resolved": "https://registry.npmjs.org/concat-map/-/concat-map-0.0.1.tgz",
			"integrity": "sha512-/Srv4dswyQNBfohGpz9o6Yb3Gz3SrUDqBH5rTuhGR7ahtlbYKnVxw2bCFMRljaA7EXHaXZ8wsHdodFvbkhKmqg==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/confbox": {
			"version": "0.1.8",
			"resolved": "https://registry.npmjs.org/confbox/-/confbox-0.1.8.tgz",
			"integrity": "sha512-RMtmw0iFkeR4YV+fUOSucriAQNb9g8zFR52MWCtl+cCZOFRNL6zeB395vPzFhEjjn4fMxXudmELnl/KF/WrK6w==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/crelt": {
			"version": "1.0.7",
			"resolved": "https://registry.npmjs.org/crelt/-/crelt-1.0.7.tgz",
			"integrity": "sha512-aK6BbWfhf4U/wCcLHKPJl/xa6VkVstRaPywWtMKGwuOLc/wZTyQYuoxgvZnNsBvv7Kg3YTBQYYBCggcviQczuA==",
			"dev": true,
			"license": "MIT",
			"peer": true
		},
		"node_modules/cross-spawn": {
			"version": "7.0.6",
			"resolved": "https://registry.npmjs.org/cross-spawn/-/cross-spawn-7.0.6.tgz",
			"integrity": "sha512-uV2QOWP2nWzsy2aMp8aRibhi9dlzF5Hgh5SHaB9OiTGEyDTiJJyx0uy51QXdyWbtAHNua4XJzUKca3OzKUd3vA==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"path-key": "^3.1.0",
				"shebang-command": "^2.0.0",
				"which": "^2.0.1"
			},
			"engines": {
				"node": ">= 8"
			}
		},
		"node_modules/data-view-buffer": {
			"version": "1.0.2",
			"resolved": "https://registry.npmjs.org/data-view-buffer/-/data-view-buffer-1.0.2.tgz",
			"integrity": "sha512-EmKO5V3OLXh1rtK2wgXRansaK1/mtVdTUEiEI0W8RkvgT05kfxaH29PliLnpLP73yYO6142Q72QNa8Wx/A5CqQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bound": "^1.0.3",
				"es-errors": "^1.3.0",
				"is-data-view": "^1.0.2"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/data-view-byte-length": {
			"version": "1.0.2",
			"resolved": "https://registry.npmjs.org/data-view-byte-length/-/data-view-byte-length-1.0.2.tgz",
			"integrity": "sha512-tuhGbE6CfTM9+5ANGf+oQb72Ky/0+s3xKUpHvShfiz2RxMFgFPjsXuRLBVMtvMs15awe45SRb83D6wH4ew6wlQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bound": "^1.0.3",
				"es-errors": "^1.3.0",
				"is-data-view": "^1.0.2"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/inspect-js"
			}
		},
		"node_modules/data-view-byte-offset": {
			"version": "1.0.1",
			"resolved": "https://registry.npmjs.org/data-view-byte-offset/-/data-view-byte-offset-1.0.1.tgz",
			"integrity": "sha512-BS8PfmtDGnrgYdOonGZQdLZslWIeCGFP9tpan0hi1Co2Zr2NKADsvGYA8XxuG/4UWgJ6Cjtv+YJnB6MM69QGlQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bound": "^1.0.2",
				"es-errors": "^1.3.0",
				"is-data-view": "^1.0.1"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/debug": {
			"version": "4.4.3",
			"resolved": "https://registry.npmjs.org/debug/-/debug-4.4.3.tgz",
			"integrity": "sha512-RGwwWnwQvkVfavKVt22FGLw+xYSdzARwm0ru6DhTVA3umU5hZc28V3kO4stgYryrTlLpuvgI9GiijltAjNbcqA==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"ms": "^2.1.3"
			},
			"engines": {
				"node": ">=6.0"
			},
			"peerDependenciesMeta": {
				"supports-color": {
					"optional": true
				}
			}
		},
		"node_modules/deep-eql": {
			"version": "4.1.4",
			"resolved": "https://registry.npmjs.org/deep-eql/-/deep-eql-4.1.4.tgz",
			"integrity": "sha512-SUwdGfqdKOwxCPeVYjwSyRpJ7Z+fhpwIAtmCUdZIWZ/YP5R9WAsyuSgpLVDi9bjWoN2LXHNss/dk3urXtdQxGg==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"type-detect": "^4.0.0"
			},
			"engines": {
				"node": ">=6"
			}
		},
		"node_modules/deep-is": {
			"version": "0.1.4",
			"resolved": "https://registry.npmjs.org/deep-is/-/deep-is-0.1.4.tgz",
			"integrity": "sha512-oIPzksmTg4/MriiaYGO+okXDT7ztn/w3Eptv/+gSIdMdKsJo0u4CfYNFJPy+4SKMuCqGw2wxnA+URMg3t8a/bQ==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/define-data-property": {
			"version": "1.1.4",
			"resolved": "https://registry.npmjs.org/define-data-property/-/define-data-property-1.1.4.tgz",
			"integrity": "sha512-rBMvIzlpA8v6E+SJZoo++HAYqsLrkg7MSfIinMPFhmkorw7X+dOXVJQs+QT69zGkzMyfDnIMN2Wid1+NbL3T+A==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"es-define-property": "^1.0.0",
				"es-errors": "^1.3.0",
				"gopd": "^1.0.1"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/define-properties": {
			"version": "1.2.1",
			"resolved": "https://registry.npmjs.org/define-properties/-/define-properties-1.2.1.tgz",
			"integrity": "sha512-8QmQKqEASLd5nx0U1B1okLElbUuuttJ/AnYmRXbbbGDWh6uS208EjD4Xqq/I9wK7u0v6O08XhTWnt5XtEbR6Dg==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"define-data-property": "^1.0.1",
				"has-property-descriptors": "^1.0.0",
				"object-keys": "^1.1.1"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/diff-sequences": {
			"version": "29.6.3",
			"resolved": "https://registry.npmjs.org/diff-sequences/-/diff-sequences-29.6.3.tgz",
			"integrity": "sha512-EjePK1srD3P08o2j4f0ExnylqRs5B9tJjcp9t1krH2qRi8CCdsYfwe9JgSLurFBWwq4uOlipzfk5fHNvwFKr8Q==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": "^14.15.0 || ^16.10.0 || >=18.0.0"
			}
		},
		"node_modules/doctrine": {
			"version": "3.0.0",
			"resolved": "https://registry.npmjs.org/doctrine/-/doctrine-3.0.0.tgz",
			"integrity": "sha512-yS+Q5i3hBf7GBkd4KG8a7eBNNWNGLTaEwwYWUijIYM7zrlYDM0BFXHjjPWlWZ1Rg7UaddZeIDmi9jF3HmqiQ2w==",
			"dev": true,
			"license": "Apache-2.0",
			"dependencies": {
				"esutils": "^2.0.2"
			},
			"engines": {
				"node": ">=6.0.0"
			}
		},
		"node_modules/dunder-proto": {
			"version": "1.0.1",
			"resolved": "https://registry.npmjs.org/dunder-proto/-/dunder-proto-1.0.1.tgz",
			"integrity": "sha512-KIN/nDJBQRcXw0MLVhZE9iQHmG68qAVIBg9CqmUYjmQIhgij9U5MFvrqkUL5FbtyyzZuOeOt0zdeRe4UY7ct+A==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bind-apply-helpers": "^1.0.1",
				"es-errors": "^1.3.0",
				"gopd": "^1.2.0"
			},
			"engines": {
				"node": ">= 0.4"
			}
		},
		"node_modules/empathic": {
			"version": "2.0.1",
			"resolved": "https://registry.npmjs.org/empathic/-/empathic-2.0.1.tgz",
			"integrity": "sha512-YGRs8knHhKHVShLkFET/rWAU8kmHbOV5LwN938RHI0pljAJ1Gf6SzXsSmRaEzcXTtOOmVqJ5+WtQPL5uigY50Q==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">=14"
			}
		},
		"node_modules/enhanced-resolve": {
			"version": "5.24.5",
			"resolved": "https://registry.npmjs.org/enhanced-resolve/-/enhanced-resolve-5.24.5.tgz",
			"integrity": "sha512-L1l8TNvomm6UVW5B253AGxQagSQr+vGwhMlrrfRS2qmhx46AMpMVJKQYLvWYbysTMY8VoicOvzHzoHMbyzB+4A==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"graceful-fs": "^4.2.4",
				"tapable": "^2.3.3"
			},
			"engines": {
				"node": ">=10.13.0"
			}
		},
		"node_modules/es-abstract": {
			"version": "1.24.2",
			"resolved": "https://registry.npmjs.org/es-abstract/-/es-abstract-1.24.2.tgz",
			"integrity": "sha512-2FpH9Q5i2RRwyEP1AylXe6nYLR5OhaJTZwmlcP0dL/+JCbgg7yyEo/sEK6HeGZRf3dFpWwThaRHVApXSkW3xeg==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"array-buffer-byte-length": "^1.0.2",
				"arraybuffer.prototype.slice": "^1.0.4",
				"available-typed-arrays": "^1.0.7",
				"call-bind": "^1.0.8",
				"call-bound": "^1.0.4",
				"data-view-buffer": "^1.0.2",
				"data-view-byte-length": "^1.0.2",
				"data-view-byte-offset": "^1.0.1",
				"es-define-property": "^1.0.1",
				"es-errors": "^1.3.0",
				"es-object-atoms": "^1.1.1",
				"es-set-tostringtag": "^2.1.0",
				"es-to-primitive": "^1.3.0",
				"function.prototype.name": "^1.1.8",
				"get-intrinsic": "^1.3.0",
				"get-proto": "^1.0.1",
				"get-symbol-description": "^1.1.0",
				"globalthis": "^1.0.4",
				"gopd": "^1.2.0",
				"has-property-descriptors": "^1.0.2",
				"has-proto": "^1.2.0",
				"has-symbols": "^1.1.0",
				"hasown": "^2.0.2",
				"internal-slot": "^1.1.0",
				"is-array-buffer": "^3.0.5",
				"is-callable": "^1.2.7",
				"is-data-view": "^1.0.2",
				"is-negative-zero": "^2.0.3",
				"is-regex": "^1.2.1",
				"is-set": "^2.0.3",
				"is-shared-array-buffer": "^1.0.4",
				"is-string": "^1.1.1",
				"is-typed-array": "^1.1.15",
				"is-weakref": "^1.1.1",
				"math-intrinsics": "^1.1.0",
				"object-inspect": "^1.13.4",
				"object-keys": "^1.1.1",
				"object.assign": "^4.1.7",
				"own-keys": "^1.0.1",
				"regexp.prototype.flags": "^1.5.4",
				"safe-array-concat": "^1.1.3",
				"safe-push-apply": "^1.0.0",
				"safe-regex-test": "^1.1.0",
				"set-proto": "^1.0.0",
				"stop-iteration-iterator": "^1.1.0",
				"string.prototype.trim": "^1.2.10",
				"string.prototype.trimend": "^1.0.9",
				"string.prototype.trimstart": "^1.0.8",
				"typed-array-buffer": "^1.0.3",
				"typed-array-byte-length": "^1.0.3",
				"typed-array-byte-offset": "^1.0.4",
				"typed-array-length": "^1.0.7",
				"unbox-primitive": "^1.1.0",
				"which-typed-array": "^1.1.19"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/es-abstract-get": {
			"version": "1.0.0",
			"resolved": "https://registry.npmjs.org/es-abstract-get/-/es-abstract-get-1.0.0.tgz",
			"integrity": "sha512-6PMWXpdhshVvFp+FoWYs1EvG1Nj0tvk0dZM+XcK0xMEM1czRVcP6ohqPWHy6qPagSpC8j4+p89WXlT+xXJs/fg==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"es-errors": "^1.3.0",
				"es-object-atoms": "^1.1.2",
				"is-callable": "^1.2.7",
				"object-inspect": "^1.13.4"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/es-define-property": {
			"version": "1.0.1",
			"resolved": "https://registry.npmjs.org/es-define-property/-/es-define-property-1.0.1.tgz",
			"integrity": "sha512-e3nRfgfUZ4rNGL232gUgX06QNyyez04KdjFrF+LTRoOXmrOgFKDg4BCdsjW8EnT69eqdYGmRpJwiPVYNrCaW3g==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">= 0.4"
			}
		},
		"node_modules/es-errors": {
			"version": "1.3.0",
			"resolved": "https://registry.npmjs.org/es-errors/-/es-errors-1.3.0.tgz",
			"integrity": "sha512-Zf5H2Kxt2xjTvbJvP2ZWLEICxA6j+hAmMzIlypy4xcBg1vKVnx89Wy0GbS+kf5cwCVFFzdCFh2XSCFNULS6csw==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">= 0.4"
			}
		},
		"node_modules/es-iterator-helpers": {
			"version": "1.4.0",
			"resolved": "https://registry.npmjs.org/es-iterator-helpers/-/es-iterator-helpers-1.4.0.tgz",
			"integrity": "sha512-c/A0P0oxkACDc+cKWw8evLXK83oBKgn0qPOqCYT4x9uolpCIJAcYvJC9QYKNDRPsTeGyCrQ326jrvgZWdCdK5Q==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bind": "^1.0.9",
				"call-bound": "^1.0.4",
				"define-properties": "^1.2.1",
				"es-abstract": "^1.24.2",
				"es-errors": "^1.3.0",
				"es-set-tostringtag": "^2.1.0",
				"function-bind": "^1.1.2",
				"get-intrinsic": "^1.3.0",
				"globalthis": "^1.0.4",
				"gopd": "^1.2.0",
				"has-property-descriptors": "^1.0.2",
				"has-proto": "^1.2.0",
				"has-symbols": "^1.1.0",
				"internal-slot": "^1.1.0",
				"iterator.prototype": "^1.1.5",
				"math-intrinsics": "^1.1.0"
			},
			"engines": {
				"node": ">= 0.4"
			}
		},
		"node_modules/es-object-atoms": {
			"version": "1.1.2",
			"resolved": "https://registry.npmjs.org/es-object-atoms/-/es-object-atoms-1.1.2.tgz",
			"integrity": "sha512-HWcBoN6NileqtSydK2FqHbS/LoDd2pqrnQHLyJzBj4kOp/ky2MWMN694xOfkK8/SnUsW2DH7EfyVlydKCsm1Zw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"es-errors": "^1.3.0"
			},
			"engines": {
				"node": ">= 0.4"
			}
		},
		"node_modules/es-set-tostringtag": {
			"version": "2.1.0",
			"resolved": "https://registry.npmjs.org/es-set-tostringtag/-/es-set-tostringtag-2.1.0.tgz",
			"integrity": "sha512-j6vWzfrGVfyXxge+O0x5sh6cvxAog0a/4Rdd2K36zCMV5eJ+/+tOAngRO8cODMNWbVRdVlmGZQL2YS3yR8bIUA==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"es-errors": "^1.3.0",
				"get-intrinsic": "^1.2.6",
				"has-tostringtag": "^1.0.2",
				"hasown": "^2.0.2"
			},
			"engines": {
				"node": ">= 0.4"
			}
		},
		"node_modules/es-shim-unscopables": {
			"version": "1.1.0",
			"resolved": "https://registry.npmjs.org/es-shim-unscopables/-/es-shim-unscopables-1.1.0.tgz",
			"integrity": "sha512-d9T8ucsEhh8Bi1woXCf+TIKDIROLG5WCkxg8geBCbvk22kzwC5G2OnXVMO6FUsvQlgUUXQ2itephWDLqDzbeCw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"hasown": "^2.0.2"
			},
			"engines": {
				"node": ">= 0.4"
			}
		},
		"node_modules/es-to-primitive": {
			"version": "1.3.4",
			"resolved": "https://registry.npmjs.org/es-to-primitive/-/es-to-primitive-1.3.4.tgz",
			"integrity": "sha512-yPDz7wqpg1/mmHLmS3tcfTfbw5f1eryXvyghYBffGdERwe+mV7ZcWzTR8LR17Kvqt3qfPurjlonmnq3MKXIOXw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"es-abstract-get": "^1.0.0",
				"es-define-property": "^1.0.1",
				"es-errors": "^1.3.0",
				"is-callable": "^1.2.7",
				"is-date-object": "^1.1.0",
				"is-symbol": "^1.1.1"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/esbuild": {
			"version": "0.19.12",
			"resolved": "https://registry.npmjs.org/esbuild/-/esbuild-0.19.12.tgz",
			"integrity": "sha512-aARqgq8roFBj054KvQr5f1sFu0D65G+miZRCuJyJ0G13Zwx7vRar5Zhn2tkQNzIXcBrNVsv/8stehpj+GAjgbg==",
			"dev": true,
			"hasInstallScript": true,
			"license": "MIT",
			"bin": {
				"esbuild": "bin/esbuild"
			},
			"engines": {
				"node": ">=12"
			},
			"optionalDependencies": {
				"@esbuild/aix-ppc64": "0.19.12",
				"@esbuild/android-arm": "0.19.12",
				"@esbuild/android-arm64": "0.19.12",
				"@esbuild/android-x64": "0.19.12",
				"@esbuild/darwin-arm64": "0.19.12",
				"@esbuild/darwin-x64": "0.19.12",
				"@esbuild/freebsd-arm64": "0.19.12",
				"@esbuild/freebsd-x64": "0.19.12",
				"@esbuild/linux-arm": "0.19.12",
				"@esbuild/linux-arm64": "0.19.12",
				"@esbuild/linux-ia32": "0.19.12",
				"@esbuild/linux-loong64": "0.19.12",
				"@esbuild/linux-mips64el": "0.19.12",
				"@esbuild/linux-ppc64": "0.19.12",
				"@esbuild/linux-riscv64": "0.19.12",
				"@esbuild/linux-s390x": "0.19.12",
				"@esbuild/linux-x64": "0.19.12",
				"@esbuild/netbsd-x64": "0.19.12",
				"@esbuild/openbsd-x64": "0.19.12",
				"@esbuild/sunos-x64": "0.19.12",
				"@esbuild/win32-arm64": "0.19.12",
				"@esbuild/win32-ia32": "0.19.12",
				"@esbuild/win32-x64": "0.19.12"
			}
		},
		"node_modules/escape-string-regexp": {
			"version": "4.0.0",
			"resolved": "https://registry.npmjs.org/escape-string-regexp/-/escape-string-regexp-4.0.0.tgz",
			"integrity": "sha512-TtpcNJ3XAzx3Gq8sWRzJaVajRs0uVxA2YAkdb1jm2YkPz4G6egUFAyA3n5vtEIZefPk5Wa4UXbKuS5fKkJWdgA==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">=10"
			},
			"funding": {
				"url": "https://github.com/sponsors/sindresorhus"
			}
		},
		"node_modules/eslint": {
			"version": "8.57.0",
			"resolved": "https://registry.npmjs.org/eslint/-/eslint-8.57.0.tgz",
			"integrity": "sha512-dZ6+mexnaTIbSBZWgou51U6OmzIhYM2VcNdtiTtI7qPNZm35Akpr0f6vtw3w1Kmn5PYo+tZVfh13WrhpS6oLqQ==",
			"deprecated": "This version is no longer supported. Please see https://eslint.org/version-support for other options.",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"@eslint-community/eslint-utils": "^4.2.0",
				"@eslint-community/regexpp": "^4.6.1",
				"@eslint/eslintrc": "^2.1.4",
				"@eslint/js": "8.57.0",
				"@humanwhocodes/config-array": "^0.11.14",
				"@humanwhocodes/module-importer": "^1.0.1",
				"@nodelib/fs.walk": "^1.2.8",
				"@ungap/structured-clone": "^1.2.0",
				"ajv": "^6.12.4",
				"chalk": "^4.0.0",
				"cross-spawn": "^7.0.2",
				"debug": "^4.3.2",
				"doctrine": "^3.0.0",
				"escape-string-regexp": "^4.0.0",
				"eslint-scope": "^7.2.2",
				"eslint-visitor-keys": "^3.4.3",
				"espree": "^9.6.1",
				"esquery": "^1.4.2",
				"esutils": "^2.0.2",
				"fast-deep-equal": "^3.1.3",
				"file-entry-cache": "^6.0.1",
				"find-up": "^5.0.0",
				"glob-parent": "^6.0.2",
				"globals": "^13.19.0",
				"graphemer": "^1.4.0",
				"ignore": "^5.2.0",
				"imurmurhash": "^0.1.4",
				"is-glob": "^4.0.0",
				"is-path-inside": "^3.0.3",
				"js-yaml": "^4.1.0",
				"json-stable-stringify-without-jsonify": "^1.0.1",
				"levn": "^0.4.1",
				"lodash.merge": "^4.6.2",
				"minimatch": "^3.1.2",
				"natural-compare": "^1.4.0",
				"optionator": "^0.9.3",
				"strip-ansi": "^6.0.1",
				"text-table": "^0.2.0"
			},
			"bin": {
				"eslint": "bin/eslint.js"
			},
			"engines": {
				"node": "^12.22.0 || ^14.17.0 || >=16.0.0"
			},
			"funding": {
				"url": "https://opencollective.com/eslint"
			}
		},
		"node_modules/eslint-compat-utils": {
			"version": "0.5.1",
			"resolved": "https://registry.npmjs.org/eslint-compat-utils/-/eslint-compat-utils-0.5.1.tgz",
			"integrity": "sha512-3z3vFexKIEnjHE3zCMRo6fn/e44U7T1khUjg+Hp0ZQMCigh28rALD0nPFBcGZuiLC5rLZa2ubQHDRln09JfU2Q==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"semver": "^7.5.4"
			},
			"engines": {
				"node": ">=12"
			},
			"peerDependencies": {
				"eslint": ">=6.0.0"
			}
		},
		"node_modules/eslint-import-resolver-node": {
			"version": "0.3.10",
			"resolved": "https://registry.npmjs.org/eslint-import-resolver-node/-/eslint-import-resolver-node-0.3.10.tgz",
			"integrity": "sha512-tRrKqFyCaKict5hOd244sL6EQFNycnMQnBe+j8uqGNXYzsImGbGUU4ibtoaBmv5FLwJwcFJNeg1GeVjQfbMrDQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"debug": "^3.2.7",
				"is-core-module": "^2.16.1",
				"resolve": "^2.0.0-next.6"
			}
		},
		"node_modules/eslint-import-resolver-node/node_modules/debug": {
			"version": "3.2.7",
			"resolved": "https://registry.npmjs.org/debug/-/debug-3.2.7.tgz",
			"integrity": "sha512-CFjzYYAi4ThfiQvizrFQevTTXHtnCqWfe7x1AhgEscTz6ZbLbfoLRLPugTQyBth6f8ZERVUSyWHFD/7Wu4t1XQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"ms": "^2.1.1"
			}
		},
		"node_modules/eslint-module-utils": {
			"version": "2.14.0",
			"resolved": "https://registry.npmjs.org/eslint-module-utils/-/eslint-module-utils-2.14.0.tgz",
			"integrity": "sha512-W2WCRZ9Dqntd+2u8jJcVMV2PKulc6RdLgUUoh/yQr3uB6lo/ZOeGx11sv60/8S4QFFKNslAlWhr9u0Ef7ZW6Ig==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"debug": "^3.2.7"
			},
			"engines": {
				"node": ">=4"
			},
			"peerDependenciesMeta": {
				"eslint": {
					"optional": true
				}
			}
		},
		"node_modules/eslint-module-utils/node_modules/debug": {
			"version": "3.2.7",
			"resolved": "https://registry.npmjs.org/debug/-/debug-3.2.7.tgz",
			"integrity": "sha512-CFjzYYAi4ThfiQvizrFQevTTXHtnCqWfe7x1AhgEscTz6ZbLbfoLRLPugTQyBth6f8ZERVUSyWHFD/7Wu4t1XQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"ms": "^2.1.1"
			}
		},
		"node_modules/eslint-plugin-depend": {
			"version": "1.3.1",
			"resolved": "https://registry.npmjs.org/eslint-plugin-depend/-/eslint-plugin-depend-1.3.1.tgz",
			"integrity": "sha512-1uo2rFAr9vzNrCYdp7IBZRB54LiyVxfaIso0R6/QV3t6Dax6DTbW/EV2Hktf0f4UtmGHK8UyzJWI382pwW04jw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"empathic": "^2.0.0",
				"module-replacements": "^2.8.0",
				"semver": "^7.6.3"
			}
		},
		"node_modules/eslint-plugin-es-x": {
			"version": "7.8.0",
			"resolved": "https://registry.npmjs.org/eslint-plugin-es-x/-/eslint-plugin-es-x-7.8.0.tgz",
			"integrity": "sha512-7Ds8+wAAoV3T+LAKeu39Y5BzXCrGKrcISfgKEqTS4BDN8SFEDQd0S43jiQ8vIa3wUKD07qitZdfzlenSi8/0qQ==",
			"dev": true,
			"funding": [
				"https://github.com/sponsors/ota-meshi",
				"https://opencollective.com/eslint"
			],
			"license": "MIT",
			"dependencies": {
				"@eslint-community/eslint-utils": "^4.1.2",
				"@eslint-community/regexpp": "^4.11.0",
				"eslint-compat-utils": "^0.5.1"
			},
			"engines": {
				"node": "^14.18.0 || >=16.0.0"
			},
			"peerDependencies": {
				"eslint": ">=8"
			}
		},
		"node_modules/eslint-plugin-import": {
			"version": "2.32.0",
			"resolved": "https://registry.npmjs.org/eslint-plugin-import/-/eslint-plugin-import-2.32.0.tgz",
			"integrity": "sha512-whOE1HFo/qJDyX4SnXzP4N6zOWn79WhnCUY/iDR0mPfQZO8wcYE4JClzI2oZrhBnnMUCBCHZhO6VQyoBU95mZA==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"@rtsao/scc": "^1.1.0",
				"array-includes": "^3.1.9",
				"array.prototype.findlastindex": "^1.2.6",
				"array.prototype.flat": "^1.3.3",
				"array.prototype.flatmap": "^1.3.3",
				"debug": "^3.2.7",
				"doctrine": "^2.1.0",
				"eslint-import-resolver-node": "^0.3.9",
				"eslint-module-utils": "^2.12.1",
				"hasown": "^2.0.2",
				"is-core-module": "^2.16.1",
				"is-glob": "^4.0.3",
				"minimatch": "^3.1.2",
				"object.fromentries": "^2.0.8",
				"object.groupby": "^1.0.3",
				"object.values": "^1.2.1",
				"semver": "^6.3.1",
				"string.prototype.trimend": "^1.0.9",
				"tsconfig-paths": "^3.15.0"
			},
			"engines": {
				"node": ">=4"
			},
			"peerDependencies": {
				"eslint": "^2 || ^3 || ^4 || ^5 || ^6 || ^7.2.0 || ^8 || ^9"
			}
		},
		"node_modules/eslint-plugin-import/node_modules/debug": {
			"version": "3.2.7",
			"resolved": "https://registry.npmjs.org/debug/-/debug-3.2.7.tgz",
			"integrity": "sha512-CFjzYYAi4ThfiQvizrFQevTTXHtnCqWfe7x1AhgEscTz6ZbLbfoLRLPugTQyBth6f8ZERVUSyWHFD/7Wu4t1XQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"ms": "^2.1.1"
			}
		},
		"node_modules/eslint-plugin-import/node_modules/doctrine": {
			"version": "2.1.0",
			"resolved": "https://registry.npmjs.org/doctrine/-/doctrine-2.1.0.tgz",
			"integrity": "sha512-35mSku4ZXK0vfCuHEDAwt55dg2jNajHZ1odvF+8SSr82EsZY4QmXfuWso8oEd8zRhVObSN18aM0CjSdoBX7zIw==",
			"dev": true,
			"license": "Apache-2.0",
			"dependencies": {
				"esutils": "^2.0.2"
			},
			"engines": {
				"node": ">=0.10.0"
			}
		},
		"node_modules/eslint-plugin-import/node_modules/semver": {
			"version": "6.3.1",
			"resolved": "https://registry.npmjs.org/semver/-/semver-6.3.1.tgz",
			"integrity": "sha512-BR7VvDCVHO+q2xBEWskxS6DJE1qRnb7DxzUrogb71CWoSficBxYsiAGd+Kl0mmq/MprG9yArRkyrQxTO6XjMzA==",
			"dev": true,
			"license": "ISC",
			"bin": {
				"semver": "bin/semver.js"
			}
		},
		"node_modules/eslint-plugin-json-schema-validator": {
			"version": "5.1.0",
			"resolved": "https://registry.npmjs.org/eslint-plugin-json-schema-validator/-/eslint-plugin-json-schema-validator-5.1.0.tgz",
			"integrity": "sha512-ZmVyxRIjm58oqe2kTuy90PpmZPrrKvOjRPXKzq8WCgRgAkidCgm5X8domL2KSfadZ3QFAmifMgGTcVNhZ5ez2g==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"@eslint-community/eslint-utils": "^4.3.0",
				"ajv": "^8.0.0",
				"debug": "^4.3.1",
				"eslint-compat-utils": "^0.5.0",
				"json-schema-migrate": "^2.0.0",
				"jsonc-eslint-parser": "^2.0.0",
				"minimatch": "^8.0.0",
				"synckit": "^0.9.0",
				"toml-eslint-parser": "^0.9.0",
				"tunnel-agent": "^0.6.0",
				"yaml-eslint-parser": "^1.0.0"
			},
			"engines": {
				"node": "^14.18.0 || >=16.0.0"
			},
			"funding": {
				"url": "https://github.com/sponsors/ota-meshi"
			},
			"peerDependencies": {
				"eslint": ">=6.0.0"
			}
		},
		"node_modules/eslint-plugin-json-schema-validator/node_modules/ajv": {
			"version": "8.20.0",
			"resolved": "https://registry.npmjs.org/ajv/-/ajv-8.20.0.tgz",
			"integrity": "sha512-Thbli+OlOj+iMPYFBVBfJ3OmCAnaSyNn4M1vz9T6Gka5Jt9ba/HIR56joy65tY6kx/FCF5VXNB819Y7/GUrBGA==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"fast-deep-equal": "^3.1.3",
				"fast-uri": "^3.0.1",
				"json-schema-traverse": "^1.0.0",
				"require-from-string": "^2.0.2"
			},
			"funding": {
				"type": "github",
				"url": "https://github.com/sponsors/epoberezkin"
			}
		},
		"node_modules/eslint-plugin-json-schema-validator/node_modules/brace-expansion": {
			"version": "2.1.4",
			"resolved": "https://registry.npmjs.org/brace-expansion/-/brace-expansion-2.1.4.tgz",
			"integrity": "sha512-hGfVzPxthbf3+2yjg/RBs60cB0FhqBS/zvdV/4wn4/BmN0bNMMHPc4V/BbFieqf1TKAGGAHnY4eSjajCl0f2Xg==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"balanced-match": "^1.0.0"
			}
		},
		"node_modules/eslint-plugin-json-schema-validator/node_modules/json-schema-traverse": {
			"version": "1.0.0",
			"resolved": "https://registry.npmjs.org/json-schema-traverse/-/json-schema-traverse-1.0.0.tgz",
			"integrity": "sha512-NM8/P9n3XjXhIZn1lLhkFaACTOURQXjWhV4BA/RnOv8xvgqtqpAX9IO4mRQxSx1Rlo4tqzeqb0sOlruaOy3dug==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/eslint-plugin-json-schema-validator/node_modules/minimatch": {
			"version": "8.0.7",
			"resolved": "https://registry.npmjs.org/minimatch/-/minimatch-8.0.7.tgz",
			"integrity": "sha512-V+1uQNdzybxa14e/p00HZnQNNcTjnRJjDxg2V8wtkjFctq4M7hXFws4oekyTP0Jebeq7QYtpFyOeBAjc88zvYg==",
			"dev": true,
			"license": "ISC",
			"dependencies": {
				"brace-expansion": "^2.0.1"
			},
			"engines": {
				"node": ">=16 || 14 >=14.17"
			},
			"funding": {
				"url": "https://github.com/sponsors/isaacs"
			}
		},
		"node_modules/eslint-plugin-n": {
			"version": "17.10.3",
			"resolved": "https://registry.npmjs.org/eslint-plugin-n/-/eslint-plugin-n-17.10.3.tgz",
			"integrity": "sha512-ySZBfKe49nQZWR1yFaA0v/GsH6Fgp8ah6XV0WDz6CN8WO0ek4McMzb7A2xnf4DCYV43frjCygvb9f/wx7UUxRw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"@eslint-community/eslint-utils": "^4.4.0",
				"enhanced-resolve": "^5.17.0",
				"eslint-plugin-es-x": "^7.5.0",
				"get-tsconfig": "^4.7.0",
				"globals": "^15.8.0",
				"ignore": "^5.2.4",
				"minimatch": "^9.0.5",
				"semver": "^7.5.3"
			},
			"engines": {
				"node": "^18.18.0 || ^20.9.0 || >=21.1.0"
			},
			"funding": {
				"url": "https://opencollective.com/eslint"
			},
			"peerDependencies": {
				"eslint": ">=8.23.0"
			}
		},
		"node_modules/eslint-plugin-n/node_modules/brace-expansion": {
			"version": "2.1.4",
			"resolved": "https://registry.npmjs.org/brace-expansion/-/brace-expansion-2.1.4.tgz",
			"integrity": "sha512-hGfVzPxthbf3+2yjg/RBs60cB0FhqBS/zvdV/4wn4/BmN0bNMMHPc4V/BbFieqf1TKAGGAHnY4eSjajCl0f2Xg==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"balanced-match": "^1.0.0"
			}
		},
		"node_modules/eslint-plugin-n/node_modules/globals": {
			"version": "15.15.0",
			"resolved": "https://registry.npmjs.org/globals/-/globals-15.15.0.tgz",
			"integrity": "sha512-7ACyT3wmyp3I61S4fG682L0VA2RGD9otkqGJIwNUMF1SWUombIIk+af1unuDYgMm082aHYwD+mzJvv9Iu8dsgg==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">=18"
			},
			"funding": {
				"url": "https://github.com/sponsors/sindresorhus"
			}
		},
		"node_modules/eslint-plugin-n/node_modules/minimatch": {
			"version": "9.0.9",
			"resolved": "https://registry.npmjs.org/minimatch/-/minimatch-9.0.9.tgz",
			"integrity": "sha512-OBwBN9AL4dqmETlpS2zasx+vTeWclWzkblfZk7KTA5j3jeOONz/tRCnZomUyvNg83wL5Zv9Ss6HMJXAgL8R2Yg==",
			"dev": true,
			"license": "ISC",
			"dependencies": {
				"brace-expansion": "^2.0.2"
			},
			"engines": {
				"node": ">=16 || 14 >=14.17"
			},
			"funding": {
				"url": "https://github.com/sponsors/isaacs"
			}
		},
		"node_modules/eslint-plugin-obsidianmd": {
			"version": "0.4.2",
			"resolved": "git+ssh://git@github.com/obsidianmd/eslint-plugin.git#d7e223960226cf747549c5b21313bd187113640e",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"@eslint-community/eslint-plugin-eslint-comments": "^4.7.2",
				"@eslint/config-helpers": "^0.4.2",
				"@eslint/js": "^9.30.1",
				"@eslint/json": "0.14.0",
				"@microsoft/eslint-plugin-sdl": "^1.1.0",
				"@types/eslint": "9.6.1",
				"@types/node": "20.12.12",
				"@typescript-eslint/types": "^8.33.1",
				"@typescript-eslint/utils": "^8.33.1",
				"eslint": ">=9.19.0",
				"eslint-plugin-depend": "1.3.1",
				"eslint-plugin-import": "^2.31.0",
				"eslint-plugin-json-schema-validator": "5.1.0",
				"eslint-plugin-no-unsanitized": "^4.1.5",
				"eslint-plugin-security": "2.1.1",
				"globals": "14.0.0",
				"obsidian": "1.12.3",
				"semver": "^7.7.4",
				"typescript": "5.4.5",
				"typescript-eslint": "^8.35.1"
			},
			"bin": {
				"eslint-plugin-obsidian": "dist/lib/index.js"
			},
			"engines": {
				"node": ">= 18"
			},
			"peerDependencies": {
				"@eslint/js": "^9.30.1",
				"@eslint/json": "0.14.0",
				"eslint": ">=9.19.0",
				"obsidian": "1.8.7",
				"typescript-eslint": "^8.35.1"
			}
		},
		"node_modules/eslint-plugin-obsidianmd/node_modules/@eslint/eslintrc": {
			"version": "3.3.7",
			"resolved": "https://registry.npmjs.org/@eslint/eslintrc/-/eslintrc-3.3.7.tgz",
			"integrity": "sha512-F42g89Qd5oAWtp0k0nnSrjziAKza7w8SVT4mStc18LZMaRb4J1HQAHLCalEtDCxrTuksx7NU9qsmeLwpOfPqWw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"ajv": "^6.14.0",
				"debug": "^4.3.2",
				"espree": "^10.0.1",
				"globals": "^14.0.0",
				"ignore": "^5.2.0",
				"import-fresh": "^3.2.1",
				"js-yaml": "^4.3.2",
				"minimatch": "^3.1.5",
				"strip-json-comments": "^3.1.1"
			},
			"engines": {
				"node": "^18.18.0 || ^20.9.0 || >=21.1.0"
			},
			"funding": {
				"url": "https://opencollective.com/eslint"
			}
		},
		"node_modules/eslint-plugin-obsidianmd/node_modules/@eslint/js": {
			"version": "9.39.5",
			"resolved": "https://registry.npmjs.org/@eslint/js/-/js-9.39.5.tgz",
			"integrity": "sha512-QywQuszQh77pIXCsq998c8hbhSTI/azTty1Z6N53dmAudKHhy573j3yvRLsX2BSp8YpLtoCEG8E9DJe+8zUh4A==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": "^18.18.0 || ^20.9.0 || >=21.1.0"
			},
			"funding": {
				"url": "https://eslint.org/donate"
			}
		},
		"node_modules/eslint-plugin-obsidianmd/node_modules/@microsoft/eslint-plugin-sdl": {
			"version": "1.1.0",
			"resolved": "https://registry.npmjs.org/@microsoft/eslint-plugin-sdl/-/eslint-plugin-sdl-1.1.0.tgz",
			"integrity": "sha512-dxdNHOemLnBhfY3eByrujX9KyLigcNtW8sU+axzWv5nLGcsSBeKW2YYyTpfPo1hV8YPOmIGnfA4fZHyKVtWqBQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"eslint-plugin-n": "17.10.3",
				"eslint-plugin-react": "7.37.3",
				"eslint-plugin-security": "1.4.0"
			},
			"engines": {
				"node": ">=18.0.0"
			},
			"peerDependencies": {
				"eslint": "^9"
			}
		},
		"node_modules/eslint-plugin-obsidianmd/node_modules/@microsoft/eslint-plugin-sdl/node_modules/eslint-plugin-security": {
			"version": "1.4.0",
			"resolved": "https://registry.npmjs.org/eslint-plugin-security/-/eslint-plugin-security-1.4.0.tgz",
			"integrity": "sha512-xlS7P2PLMXeqfhyf3NpqbvbnW04kN8M9NtmhpR3XGyOvt/vNKS7XPXT5EDbwKW9vCjWH4PpfQvgD/+JgN0VJKA==",
			"dev": true,
			"license": "Apache-2.0",
			"dependencies": {
				"safe-regex": "^1.1.0"
			}
		},
		"node_modules/eslint-plugin-obsidianmd/node_modules/@types/node": {
			"version": "20.12.12",
			"resolved": "https://registry.npmjs.org/@types/node/-/node-20.12.12.tgz",
			"integrity": "sha512-eWLDGF/FOSPtAvEqeRAQ4C8LSA7M1I7i0ky1I8U7kD1J5ITyW3AsRhQrKVoWf5pFKZ2kILsEGJhsI9r93PYnOw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"undici-types": "~5.26.4"
			}
		},
		"node_modules/eslint-plugin-obsidianmd/node_modules/eslint": {
			"version": "9.39.5",
			"resolved": "https://registry.npmjs.org/eslint/-/eslint-9.39.5.tgz",
			"integrity": "sha512-DgZS62aPLXKlnxILS/AYCoRvHaZeXceIzlXPkkGGzJWSow1aEk0lbTlxUSlyjC8jcaKxAdOnTDz+o1JFSBsyjw==",
			"deprecated": "This version is no longer supported. Please see https://eslint.org/version-support for other options.",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"@eslint-community/eslint-utils": "^4.8.0",
				"@eslint-community/regexpp": "^4.12.1",
				"@eslint/config-array": "^0.21.2",
				"@eslint/config-helpers": "^0.4.2",
				"@eslint/core": "^0.17.0",
				"@eslint/eslintrc": "^3.3.6",
				"@eslint/js": "9.39.5",
				"@eslint/plugin-kit": "^0.4.1",
				"@humanfs/node": "^0.16.6",
				"@humanwhocodes/module-importer": "^1.0.1",
				"@humanwhocodes/retry": "^0.4.2",
				"@types/estree": "^1.0.6",
				"ajv": "^6.14.0",
				"chalk": "^4.0.0",
				"cross-spawn": "^7.0.6",
				"debug": "^4.3.2",
				"escape-string-regexp": "^4.0.0",
				"eslint-scope": "^8.4.0",
				"eslint-visitor-keys": "^4.2.1",
				"espree": "^10.4.0",
				"esquery": "^1.5.0",
				"esutils": "^2.0.2",
				"fast-deep-equal": "^3.1.3",
				"file-entry-cache": "^8.0.0",
				"find-up": "^5.0.0",
				"glob-parent": "^6.0.2",
				"ignore": "^5.2.0",
				"imurmurhash": "^0.1.4",
				"is-glob": "^4.0.0",
				"json-stable-stringify-without-jsonify": "^1.0.1",
				"lodash.merge": "^4.6.2",
				"minimatch": "^3.1.5",
				"natural-compare": "^1.4.0",
				"optionator": "^0.9.3"
			},
			"bin": {
				"eslint": "bin/eslint.js"
			},
			"engines": {
				"node": "^18.18.0 || ^20.9.0 || >=21.1.0"
			},
			"funding": {
				"url": "https://eslint.org/donate"
			},
			"peerDependencies": {
				"jiti": "*"
			},
			"peerDependenciesMeta": {
				"jiti": {
					"optional": true
				}
			}
		},
		"node_modules/eslint-plugin-obsidianmd/node_modules/eslint-plugin-no-unsanitized": {
			"version": "4.1.5",
			"resolved": "https://registry.npmjs.org/eslint-plugin-no-unsanitized/-/eslint-plugin-no-unsanitized-4.1.5.tgz",
			"integrity": "sha512-MSB4hXPVFQrI8weqzs6gzl7reP2k/qSjtCoL2vUMSDejIIq9YL1ZKvq5/ORBXab/PvfBBrWO2jWviYpL+4Ghfg==",
			"dev": true,
			"license": "MPL-2.0",
			"peerDependencies": {
				"eslint": "^9 || ^10"
			}
		},
		"node_modules/eslint-plugin-obsidianmd/node_modules/eslint-scope": {
			"version": "8.4.0",
			"resolved": "https://registry.npmjs.org/eslint-scope/-/eslint-scope-8.4.0.tgz",
			"integrity": "sha512-sNXOfKCn74rt8RICKMvJS7XKV/Xk9kA7DyJr8mJik3S7Cwgy3qlkkmyS2uQB3jiJg6VNdZd/pDBJu0nvG2NlTg==",
			"dev": true,
			"license": "BSD-2-Clause",
			"dependencies": {
				"esrecurse": "^4.3.0",
				"estraverse": "^5.2.0"
			},
			"engines": {
				"node": "^18.18.0 || ^20.9.0 || >=21.1.0"
			},
			"funding": {
				"url": "https://opencollective.com/eslint"
			}
		},
		"node_modules/eslint-plugin-obsidianmd/node_modules/eslint-visitor-keys": {
			"version": "4.2.1",
			"resolved": "https://registry.npmjs.org/eslint-visitor-keys/-/eslint-visitor-keys-4.2.1.tgz",
			"integrity": "sha512-Uhdk5sfqcee/9H/rCOJikYz67o0a2Tw2hGRPOG2Y1R2dg7brRe1uG0yaNQDHu+TO/uQPF/5eCapvYSmHUjt7JQ==",
			"dev": true,
			"license": "Apache-2.0",
			"engines": {
				"node": "^18.18.0 || ^20.9.0 || >=21.1.0"
			},
			"funding": {
				"url": "https://opencollective.com/eslint"
			}
		},
		"node_modules/eslint-plugin-obsidianmd/node_modules/espree": {
			"version": "10.4.0",
			"resolved": "https://registry.npmjs.org/espree/-/espree-10.4.0.tgz",
			"integrity": "sha512-j6PAQ2uUr79PZhBjP5C5fhl8e39FmRnOjsD5lGnWrFU8i2G776tBK7+nP8KuQUTTyAZUwfQqXAgrVH5MbH9CYQ==",
			"dev": true,
			"license": "BSD-2-Clause",
			"dependencies": {
				"acorn": "^8.15.0",
				"acorn-jsx": "^5.3.2",
				"eslint-visitor-keys": "^4.2.1"
			},
			"engines": {
				"node": "^18.18.0 || ^20.9.0 || >=21.1.0"
			},
			"funding": {
				"url": "https://opencollective.com/eslint"
			}
		},
		"node_modules/eslint-plugin-obsidianmd/node_modules/file-entry-cache": {
			"version": "8.0.0",
			"resolved": "https://registry.npmjs.org/file-entry-cache/-/file-entry-cache-8.0.0.tgz",
			"integrity": "sha512-XXTUwCvisa5oacNGRP9SfNtYBNAMi+RPwBFmblZEF7N7swHYQS6/Zfk7SRwx4D5j3CH211YNRco1DEMNVfZCnQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"flat-cache": "^4.0.0"
			},
			"engines": {
				"node": ">=16.0.0"
			}
		},
		"node_modules/eslint-plugin-obsidianmd/node_modules/flat-cache": {
			"version": "4.0.1",
			"resolved": "https://registry.npmjs.org/flat-cache/-/flat-cache-4.0.1.tgz",
			"integrity": "sha512-f7ccFPK3SXFHpx15UIGyRJ/FJQctuKZ0zVuN3frBo4HnK3cay9VEW0R6yPYFHC0AgqhukPzKjq22t5DmAyqGyw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"flatted": "^3.2.9",
				"keyv": "^4.5.4"
			},
			"engines": {
				"node": ">=16"
			}
		},
		"node_modules/eslint-plugin-obsidianmd/node_modules/globals": {
			"version": "14.0.0",
			"resolved": "https://registry.npmjs.org/globals/-/globals-14.0.0.tgz",
			"integrity": "sha512-oahGvuMGQlPw/ivIYBjVSrWAfWLBeku5tpPE2fOPLi+WHffIWbuh2tCjhyQhTBPMf5E9jDEH4FOmTYgYwbKwtQ==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">=18"
			},
			"funding": {
				"url": "https://github.com/sponsors/sindresorhus"
			}
		},
		"node_modules/eslint-plugin-obsidianmd/node_modules/obsidian": {
			"version": "1.12.3",
			"resolved": "https://registry.npmjs.org/obsidian/-/obsidian-1.12.3.tgz",
			"integrity": "sha512-HxWqe763dOqzXjnNiHmAJTRERN8KILBSqxDSEqbeSr7W8R8Jxezzbca+nz1LiiqXnMpM8lV2jzAezw3CZ4xNUw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"@types/codemirror": "5.60.8",
				"moment": "2.29.4"
			},
			"peerDependencies": {
				"@codemirror/state": "6.5.0",
				"@codemirror/view": "6.38.6"
			}
		},
		"node_modules/eslint-plugin-obsidianmd/node_modules/safe-regex": {
			"version": "1.1.0",
			"resolved": "https://registry.npmjs.org/safe-regex/-/safe-regex-1.1.0.tgz",
			"integrity": "sha512-aJXcif4xnaNUzvUuC5gcb46oTS7zvg4jpMTnuqtrEPlR3vFr4pxtdTwaF1Qs3Enjn9HK+ZlwQui+a7z0SywIzg==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"ret": "~0.1.10"
			}
		},
		"node_modules/eslint-plugin-obsidianmd/node_modules/typescript": {
			"version": "5.4.5",
			"resolved": "https://registry.npmjs.org/typescript/-/typescript-5.4.5.tgz",
			"integrity": "sha512-vcI4UpRgg81oIRUFwR0WSIHKt11nJ7SAVlYNIu+QpqeyXP+gpQJy/Z4+F0aGxSE4MqwjyXvW/TzgkLAx2AGHwQ==",
			"dev": true,
			"license": "Apache-2.0",
			"bin": {
				"tsc": "bin/tsc",
				"tsserver": "bin/tsserver"
			},
			"engines": {
				"node": ">=14.17"
			}
		},
		"node_modules/eslint-plugin-obsidianmd/node_modules/undici-types": {
			"version": "5.26.5",
			"resolved": "https://registry.npmjs.org/undici-types/-/undici-types-5.26.5.tgz",
			"integrity": "sha512-JlCMO+ehdEIKqlFxk6IfVoAUVmgz7cU7zD/h9XZ0qzeosSHmUJVOzSQvvYSYWXkFXC+IfLKSIffhv0sVZup6pA==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/eslint-plugin-react": {
			"version": "7.37.3",
			"resolved": "https://registry.npmjs.org/eslint-plugin-react/-/eslint-plugin-react-7.37.3.tgz",
			"integrity": "sha512-DomWuTQPFYZwF/7c9W2fkKkStqZmBd3uugfqBYLdkZ3Hii23WzZuOLUskGxB8qkSKqftxEeGL1TB2kMhrce0jA==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"array-includes": "^3.1.8",
				"array.prototype.findlast": "^1.2.5",
				"array.prototype.flatmap": "^1.3.3",
				"array.prototype.tosorted": "^1.1.4",
				"doctrine": "^2.1.0",
				"es-iterator-helpers": "^1.2.1",
				"estraverse": "^5.3.0",
				"hasown": "^2.0.2",
				"jsx-ast-utils": "^2.4.1 || ^3.0.0",
				"minimatch": "^3.1.2",
				"object.entries": "^1.1.8",
				"object.fromentries": "^2.0.8",
				"object.values": "^1.2.1",
				"prop-types": "^15.8.1",
				"resolve": "^2.0.0-next.5",
				"semver": "^6.3.1",
				"string.prototype.matchall": "^4.0.12",
				"string.prototype.repeat": "^1.0.0"
			},
			"engines": {
				"node": ">=4"
			},
			"peerDependencies": {
				"eslint": "^3 || ^4 || ^5 || ^6 || ^7 || ^8 || ^9.7"
			}
		},
		"node_modules/eslint-plugin-react/node_modules/doctrine": {
			"version": "2.1.0",
			"resolved": "https://registry.npmjs.org/doctrine/-/doctrine-2.1.0.tgz",
			"integrity": "sha512-35mSku4ZXK0vfCuHEDAwt55dg2jNajHZ1odvF+8SSr82EsZY4QmXfuWso8oEd8zRhVObSN18aM0CjSdoBX7zIw==",
			"dev": true,
			"license": "Apache-2.0",
			"dependencies": {
				"esutils": "^2.0.2"
			},
			"engines": {
				"node": ">=0.10.0"
			}
		},
		"node_modules/eslint-plugin-react/node_modules/semver": {
			"version": "6.3.1",
			"resolved": "https://registry.npmjs.org/semver/-/semver-6.3.1.tgz",
			"integrity": "sha512-BR7VvDCVHO+q2xBEWskxS6DJE1qRnb7DxzUrogb71CWoSficBxYsiAGd+Kl0mmq/MprG9yArRkyrQxTO6XjMzA==",
			"dev": true,
			"license": "ISC",
			"bin": {
				"semver": "bin/semver.js"
			}
		},
		"node_modules/eslint-plugin-security": {
			"version": "2.1.1",
			"resolved": "https://registry.npmjs.org/eslint-plugin-security/-/eslint-plugin-security-2.1.1.tgz",
			"integrity": "sha512-7cspIGj7WTfR3EhaILzAPcfCo5R9FbeWvbgsPYWivSurTBKW88VQxtP3c4aWMG9Hz/GfJlJVdXEJ3c8LqS+u2w==",
			"dev": true,
			"license": "Apache-2.0",
			"dependencies": {
				"safe-regex": "^2.1.1"
			}
		},
		"node_modules/eslint-scope": {
			"version": "7.2.2",
			"resolved": "https://registry.npmjs.org/eslint-scope/-/eslint-scope-7.2.2.tgz",
			"integrity": "sha512-dOt21O7lTMhDM+X9mB4GX+DZrZtCUJPL/wlcTqxyrx5IvO0IYtILdtrQGQp+8n5S0gwSVmOf9NQrjMOgfQZlIg==",
			"dev": true,
			"license": "BSD-2-Clause",
			"dependencies": {
				"esrecurse": "^4.3.0",
				"estraverse": "^5.2.0"
			},
			"engines": {
				"node": "^12.22.0 || ^14.17.0 || >=16.0.0"
			},
			"funding": {
				"url": "https://opencollective.com/eslint"
			}
		},
		"node_modules/eslint-visitor-keys": {
			"version": "3.4.3",
			"resolved": "https://registry.npmjs.org/eslint-visitor-keys/-/eslint-visitor-keys-3.4.3.tgz",
			"integrity": "sha512-wpc+LXeiyiisxPlEkUzU6svyS1frIO3Mgxj1fdy7Pm8Ygzguax2N3Fa/D/ag1WqbOprdI+uY6wMUl8/a2G+iag==",
			"dev": true,
			"license": "Apache-2.0",
			"engines": {
				"node": "^12.22.0 || ^14.17.0 || >=16.0.0"
			},
			"funding": {
				"url": "https://opencollective.com/eslint"
			}
		},
		"node_modules/espree": {
			"version": "9.6.1",
			"resolved": "https://registry.npmjs.org/espree/-/espree-9.6.1.tgz",
			"integrity": "sha512-oruZaFkjorTpF32kDSI5/75ViwGeZginGGy2NoOSg3Q9bnwlnmDm4HLnkl0RE3n+njDXR037aY1+x58Z/zFdwQ==",
			"dev": true,
			"license": "BSD-2-Clause",
			"dependencies": {
				"acorn": "^8.9.0",
				"acorn-jsx": "^5.3.2",
				"eslint-visitor-keys": "^3.4.1"
			},
			"engines": {
				"node": "^12.22.0 || ^14.17.0 || >=16.0.0"
			},
			"funding": {
				"url": "https://opencollective.com/eslint"
			}
		},
		"node_modules/esquery": {
			"version": "1.7.0",
			"resolved": "https://registry.npmjs.org/esquery/-/esquery-1.7.0.tgz",
			"integrity": "sha512-Ap6G0WQwcU/LHsvLwON1fAQX9Zp0A2Y6Y/cJBl9r/JbW90Zyg4/zbG6zzKa2OTALELarYHmKu0GhpM5EO+7T0g==",
			"dev": true,
			"license": "BSD-3-Clause",
			"dependencies": {
				"estraverse": "^5.1.0"
			},
			"engines": {
				"node": ">=0.10"
			}
		},
		"node_modules/esrecurse": {
			"version": "4.3.0",
			"resolved": "https://registry.npmjs.org/esrecurse/-/esrecurse-4.3.0.tgz",
			"integrity": "sha512-KmfKL3b6G+RXvP8N1vr3Tq1kL/oCFgn2NYXEtqP8/L3pKapUA4G8cFVaoF3SU323CD4XypR/ffioHmkti6/Tag==",
			"dev": true,
			"license": "BSD-2-Clause",
			"dependencies": {
				"estraverse": "^5.2.0"
			},
			"engines": {
				"node": ">=4.0"
			}
		},
		"node_modules/estraverse": {
			"version": "5.3.0",
			"resolved": "https://registry.npmjs.org/estraverse/-/estraverse-5.3.0.tgz",
			"integrity": "sha512-MMdARuVEQziNTeJD8DgMqmhwR11BRQ/cBP+pLtYdSTnf3MIO8fFeiINEbX36ZdNlfU/7A9f3gUw49B3oQsvwBA==",
			"dev": true,
			"license": "BSD-2-Clause",
			"engines": {
				"node": ">=4.0"
			}
		},
		"node_modules/estree-walker": {
			"version": "3.0.3",
			"resolved": "https://registry.npmjs.org/estree-walker/-/estree-walker-3.0.3.tgz",
			"integrity": "sha512-7RUKfXgSMMkzt6ZuXmqapOurLGPPfgj6l9uRZ7lRGolvk0y2yocc35LdcxKC5PQZdn2DMqioAQ2NoWcrTKmm6g==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"@types/estree": "^1.0.0"
			}
		},
		"node_modules/esutils": {
			"version": "2.0.3",
			"resolved": "https://registry.npmjs.org/esutils/-/esutils-2.0.3.tgz",
			"integrity": "sha512-kVscqXk4OCp68SZ0dkgEKVi6/8ij300KBWTJq32P/dYeWTSwK41WyTxalN1eRmA5Z9UU/LX9D7FWSmV9SAYx6g==",
			"dev": true,
			"license": "BSD-2-Clause",
			"engines": {
				"node": ">=0.10.0"
			}
		},
		"node_modules/execa": {
			"version": "8.0.1",
			"resolved": "https://registry.npmjs.org/execa/-/execa-8.0.1.tgz",
			"integrity": "sha512-VyhnebXciFV2DESc+p6B+y0LjSm0krU4OgJN44qFAhBY0TJ+1V61tYD2+wHusZ6F9n5K+vl8k0sTy7PEfV4qpg==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"cross-spawn": "^7.0.3",
				"get-stream": "^8.0.1",
				"human-signals": "^5.0.0",
				"is-stream": "^3.0.0",
				"merge-stream": "^2.0.0",
				"npm-run-path": "^5.1.0",
				"onetime": "^6.0.0",
				"signal-exit": "^4.1.0",
				"strip-final-newline": "^3.0.0"
			},
			"engines": {
				"node": ">=16.17"
			},
			"funding": {
				"url": "https://github.com/sindresorhus/execa?sponsor=1"
			}
		},
		"node_modules/fast-deep-equal": {
			"version": "3.1.3",
			"resolved": "https://registry.npmjs.org/fast-deep-equal/-/fast-deep-equal-3.1.3.tgz",
			"integrity": "sha512-f3qQ9oQy9j2AhBe/H9VC91wLmKBCCU/gDOnKNAYG5hswO7BLKj09Hc5HYNz9cGI++xlpDCIgDaitVs03ATR84Q==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/fast-json-stable-stringify": {
			"version": "2.1.0",
			"resolved": "https://registry.npmjs.org/fast-json-stable-stringify/-/fast-json-stable-stringify-2.1.0.tgz",
			"integrity": "sha512-lhd/wF+Lk98HZoTCtlVraHtfh5XYijIjalXck7saUtuanSDyLMxnHhSXEDJqHxD7msR8D0uCmqlkwjCV8xvwHw==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/fast-levenshtein": {
			"version": "2.0.6",
			"resolved": "https://registry.npmjs.org/fast-levenshtein/-/fast-levenshtein-2.0.6.tgz",
			"integrity": "sha512-DCXu6Ifhqcks7TZKY3Hxp3y6qphY5SJZmrWMDrKcERSOXWQdMhU9Ig/PYrzyw/ul9jOIyh0N4M0tbC5hodg8dw==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/fast-uri": {
			"version": "3.1.6",
			"resolved": "https://registry.npmjs.org/fast-uri/-/fast-uri-3.1.6.tgz",
			"integrity": "sha512-7Ical1vFEMr0onbVzEDIreM22I4khW+fzyQPwvAFWBp1iwdshSZRsL4jjRvPG9JP1uiqMHRto+YU6R2/CzDz5Q==",
			"dev": true,
			"funding": [
				{
					"type": "github",
					"url": "https://github.com/sponsors/fastify"
				},
				{
					"type": "opencollective",
					"url": "https://opencollective.com/fastify"
				}
			],
			"license": "BSD-3-Clause"
		},
		"node_modules/fastq": {
			"version": "1.20.3",
			"resolved": "https://registry.npmjs.org/fastq/-/fastq-1.20.3.tgz",
			"integrity": "sha512-XKv5nnLs6nLF71NgiKJLIZFLkPyIEuOselLG7ujZnGrRfQK8HpvY+WqKhAJUAdLomwVHErVS4LfxFlPq0/FTAw==",
			"dev": true,
			"license": "ISC",
			"dependencies": {
				"reusify": "^1.0.4"
			}
		},
		"node_modules/fdir": {
			"version": "6.5.0",
			"resolved": "https://registry.npmjs.org/fdir/-/fdir-6.5.0.tgz",
			"integrity": "sha512-tIbYtZbucOs0BRGqPJkshJUYdL+SDH7dVM8gjy+ERp3WAUjLEFJE+02kanyHtwjWOnwrKYBiwAmM0p4kLJAnXg==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">=12.0.0"
			},
			"peerDependencies": {
				"picomatch": "^3 || ^4"
			},
			"peerDependenciesMeta": {
				"picomatch": {
					"optional": true
				}
			}
		},
		"node_modules/file-entry-cache": {
			"version": "6.0.1",
			"resolved": "https://registry.npmjs.org/file-entry-cache/-/file-entry-cache-6.0.1.tgz",
			"integrity": "sha512-7Gps/XWymbLk2QLYK4NzpMOrYjMhdIxXuIvy2QBsLE6ljuodKvdkWs/cpyJJ3CVIVpH0Oi1Hvg1ovbMzLdFBBg==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"flat-cache": "^3.0.4"
			},
			"engines": {
				"node": "^10.12.0 || >=12.0.0"
			}
		},
		"node_modules/find-up": {
			"version": "5.0.0",
			"resolved": "https://registry.npmjs.org/find-up/-/find-up-5.0.0.tgz",
			"integrity": "sha512-78/PXT1wlLLDgTzDs7sjq9hzz0vXD+zn+7wypEe4fXQxCmdmqfGsEPQxmiCSQI3ajFV91bVSsvNtrJRiW6nGng==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"locate-path": "^6.0.0",
				"path-exists": "^4.0.0"
			},
			"engines": {
				"node": ">=10"
			},
			"funding": {
				"url": "https://github.com/sponsors/sindresorhus"
			}
		},
		"node_modules/flat-cache": {
			"version": "3.2.0",
			"resolved": "https://registry.npmjs.org/flat-cache/-/flat-cache-3.2.0.tgz",
			"integrity": "sha512-CYcENa+FtcUKLmhhqyctpclsq7QF38pKjZHsGNiSQF5r4FtoKDWabFDl3hzaEQMvT1LHEysw5twgLvpYYb4vbw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"flatted": "^3.2.9",
				"keyv": "^4.5.3",
				"rimraf": "^3.0.2"
			},
			"engines": {
				"node": "^10.12.0 || >=12.0.0"
			}
		},
		"node_modules/flatted": {
			"version": "3.4.4",
			"resolved": "https://registry.npmjs.org/flatted/-/flatted-3.4.4.tgz",
			"integrity": "sha512-5+ybhBZANEJxaH3X5evAFatUxLfEHSr7n6kYJ+1Qd0mUqr4eu9gIf6GDbWHf8RJijHrjjO8G+la14SlL2SeS1Q==",
			"dev": true,
			"license": "ISC"
		},
		"node_modules/for-each": {
			"version": "0.3.5",
			"resolved": "https://registry.npmjs.org/for-each/-/for-each-0.3.5.tgz",
			"integrity": "sha512-dKx12eRCVIzqCxFGplyFKJMPvLEWgmNtUrpTiJIR5u97zEhRG8ySrtboPHZXx7daLxQVrl643cTzbab2tkQjxg==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"is-callable": "^1.2.7"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/fs.realpath": {
			"version": "1.0.0",
			"resolved": "https://registry.npmjs.org/fs.realpath/-/fs.realpath-1.0.0.tgz",
			"integrity": "sha512-OO0pH2lK6a0hZnAdau5ItzHPI6pUlvI7jMVnxUQRtw4owF2wk8lOSabtGDCTP4Ggrg2MbGnWO9X8K1t4+fGMDw==",
			"dev": true,
			"license": "ISC"
		},
		"node_modules/fsevents": {
			"version": "2.3.3",
			"resolved": "https://registry.npmjs.org/fsevents/-/fsevents-2.3.3.tgz",
			"integrity": "sha512-5xoDfX+fL7faATnagmWPpbFtwh/R77WmMMqqHGS65C3vvB0YHrgF+B1YmZ3441tMj5n63k0212XNoJwzlhffQw==",
			"dev": true,
			"hasInstallScript": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"darwin"
			],
			"engines": {
				"node": "^8.16.0 || ^10.6.0 || >=11.0.0"
			}
		},
		"node_modules/function-bind": {
			"version": "1.1.2",
			"resolved": "https://registry.npmjs.org/function-bind/-/function-bind-1.1.2.tgz",
			"integrity": "sha512-7XHNxH7qX9xG5mIwxkhumTox/MIRNcOgDrxWsMt2pAr23WHp6MrRlN7FBSFpCpr+oVO0F744iUgR82nJMfG2SA==",
			"dev": true,
			"license": "MIT",
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/function.prototype.name": {
			"version": "1.2.0",
			"resolved": "https://registry.npmjs.org/function.prototype.name/-/function.prototype.name-1.2.0.tgz",
			"integrity": "sha512-jObKIik1P2QjPHP5nz5BaOtUlfgS0fWo8IUByNXkM+o+02sJOi94em77GwJKQSJ3gfPHdgzLNrHc1uokV4P/ew==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bind": "^1.0.9",
				"call-bound": "^1.0.4",
				"es-define-property": "^1.0.1",
				"es-errors": "^1.3.0",
				"functions-have-names": "^1.2.3",
				"has-property-descriptors": "^1.0.2",
				"hasown": "^2.0.4",
				"is-callable": "^1.2.7",
				"is-document.all": "^1.0.0"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/functions-have-names": {
			"version": "1.2.3",
			"resolved": "https://registry.npmjs.org/functions-have-names/-/functions-have-names-1.2.3.tgz",
			"integrity": "sha512-xckBUXyTIqT97tq2x2AMb+g163b5JFysYk0x4qxNFwbfQkmNZoiRHb6sPzI9/QV33WeuvVYBUIiD4NzNIyqaRQ==",
			"dev": true,
			"license": "MIT",
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/generator-function": {
			"version": "2.0.1",
			"resolved": "https://registry.npmjs.org/generator-function/-/generator-function-2.0.1.tgz",
			"integrity": "sha512-SFdFmIJi+ybC0vjlHN0ZGVGHc3lgE0DxPAT0djjVg+kjOnSqclqmj0KQ7ykTOLP6YxoqOvuAODGdcHJn+43q3g==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">= 0.4"
			}
		},
		"node_modules/get-func-name": {
			"version": "2.0.2",
			"resolved": "https://registry.npmjs.org/get-func-name/-/get-func-name-2.0.2.tgz",
			"integrity": "sha512-8vXOvuE167CtIc3OyItco7N/dpRtBbYOsPsXCz7X/PMnlGjYjSGuZJgM1Y7mmew7BKf9BqvLX2tnOVy1BBUsxQ==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": "*"
			}
		},
		"node_modules/get-intrinsic": {
			"version": "1.3.0",
			"resolved": "https://registry.npmjs.org/get-intrinsic/-/get-intrinsic-1.3.0.tgz",
			"integrity": "sha512-9fSjSaos/fRIVIp+xSJlE6lfwhES7LNtKaCBIamHsjr2na1BiABJPo0mOjjz8GJDURarmCPGqaiVg5mfjb98CQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bind-apply-helpers": "^1.0.2",
				"es-define-property": "^1.0.1",
				"es-errors": "^1.3.0",
				"es-object-atoms": "^1.1.1",
				"function-bind": "^1.1.2",
				"get-proto": "^1.0.1",
				"gopd": "^1.2.0",
				"has-symbols": "^1.1.0",
				"hasown": "^2.0.2",
				"math-intrinsics": "^1.1.0"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/get-proto": {
			"version": "1.0.1",
			"resolved": "https://registry.npmjs.org/get-proto/-/get-proto-1.0.1.tgz",
			"integrity": "sha512-sTSfBjoXBp89JvIKIefqw7U2CCebsc74kiY6awiGogKtoSGbgjYE/G/+l9sF3MWFPNc9IcoOC4ODfKHfxFmp0g==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"dunder-proto": "^1.0.1",
				"es-object-atoms": "^1.0.0"
			},
			"engines": {
				"node": ">= 0.4"
			}
		},
		"node_modules/get-stream": {
			"version": "8.0.1",
			"resolved": "https://registry.npmjs.org/get-stream/-/get-stream-8.0.1.tgz",
			"integrity": "sha512-VaUJspBffn/LMCJVoMvSAdmscJyS1auj5Zulnn5UoYcY531UWmdwhRWkcGKnGU93m5HSXP9LP2usOryrBtQowA==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">=16"
			},
			"funding": {
				"url": "https://github.com/sponsors/sindresorhus"
			}
		},
		"node_modules/get-symbol-description": {
			"version": "1.1.0",
			"resolved": "https://registry.npmjs.org/get-symbol-description/-/get-symbol-description-1.1.0.tgz",
			"integrity": "sha512-w9UMqWwJxHNOvoNzSJ2oPF5wvYcvP7jUvYzhp67yEhTi17ZDBBC1z9pTdGuzjD+EFIqLSYRweZjqfiPzQ06Ebg==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bound": "^1.0.3",
				"es-errors": "^1.3.0",
				"get-intrinsic": "^1.2.6"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/get-tsconfig": {
			"version": "4.14.3",
			"resolved": "https://registry.npmjs.org/get-tsconfig/-/get-tsconfig-4.14.3.tgz",
			"integrity": "sha512-++QEw4DIY7WGoukz+/+A/8dGYPT9l9yIadnmSgZ8Rjr3YVSVDipQSO9CdnJo9ePqFqUUqh+wk9uIaoiAwsiPkA==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"resolve-pkg-maps": "^1.0.0"
			},
			"funding": {
				"url": "https://github.com/privatenumber/get-tsconfig?sponsor=1"
			}
		},
		"node_modules/glob": {
			"version": "7.2.3",
			"resolved": "https://registry.npmjs.org/glob/-/glob-7.2.3.tgz",
			"integrity": "sha512-nFR0zLpU2YCaRxwoCJvL6UvCH2JFyFVIvwTLsIf21AuHlMskA1hhTdk+LlYJtOlYt9v6dvszD2BGRqBL+iQK9Q==",
			"deprecated": "Old versions of glob are not supported, and contain widely publicized security vulnerabilities, which have been fixed in the current version. Please update. Support for old versions may be purchased (at exorbitant rates) by contacting i@izs.me",
			"dev": true,
			"license": "ISC",
			"dependencies": {
				"fs.realpath": "^1.0.0",
				"inflight": "^1.0.4",
				"inherits": "2",
				"minimatch": "^3.1.1",
				"once": "^1.3.0",
				"path-is-absolute": "^1.0.0"
			},
			"engines": {
				"node": "*"
			},
			"funding": {
				"url": "https://github.com/sponsors/isaacs"
			}
		},
		"node_modules/glob-parent": {
			"version": "6.0.2",
			"resolved": "https://registry.npmjs.org/glob-parent/-/glob-parent-6.0.2.tgz",
			"integrity": "sha512-XxwI8EOhVQgWp6iDL+3b0r86f4d6AX6zSU55HfB4ydCEuXLXc5FcYeOu+nnGftS4TEju/11rt4KJPTMgbfmv4A==",
			"dev": true,
			"license": "ISC",
			"dependencies": {
				"is-glob": "^4.0.3"
			},
			"engines": {
				"node": ">=10.13.0"
			}
		},
		"node_modules/globals": {
			"version": "13.24.0",
			"resolved": "https://registry.npmjs.org/globals/-/globals-13.24.0.tgz",
			"integrity": "sha512-AhO5QUcj8llrbG09iWhPU2B204J1xnPeL8kQmVorSsy+Sjj1sk8gIyh6cUocGmH4L0UuhAJy+hJMRA4mgA4mFQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"type-fest": "^0.20.2"
			},
			"engines": {
				"node": ">=8"
			},
			"funding": {
				"url": "https://github.com/sponsors/sindresorhus"
			}
		},
		"node_modules/globalthis": {
			"version": "1.0.4",
			"resolved": "https://registry.npmjs.org/globalthis/-/globalthis-1.0.4.tgz",
			"integrity": "sha512-DpLKbNU4WylpxJykQujfCcwYWiV/Jhm50Goo0wrVILAv5jOr9d+H+UR3PhSCD2rCCEIg0uc+G+muBTwD54JhDQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"define-properties": "^1.2.1",
				"gopd": "^1.0.1"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/gopd": {
			"version": "1.2.0",
			"resolved": "https://registry.npmjs.org/gopd/-/gopd-1.2.0.tgz",
			"integrity": "sha512-ZUKRh6/kUFoAiTAtTYPZJ3hw9wNxx+BIBOijnlG9PnrJsCcSjs1wyyD6vJpaYtgnzDrKYRSqf3OO6Rfa93xsRg==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/graceful-fs": {
			"version": "4.2.11",
			"resolved": "https://registry.npmjs.org/graceful-fs/-/graceful-fs-4.2.11.tgz",
			"integrity": "sha512-RbJ5/jmFcNNCcDV5o9eTnBLJ/HszWV0P73bc+Ff4nS/rJj+YaS6IGyiOL0VoBYX+l1Wrl3k63h/KrH+nhJ0XvQ==",
			"dev": true,
			"license": "ISC"
		},
		"node_modules/graphemer": {
			"version": "1.4.0",
			"resolved": "https://registry.npmjs.org/graphemer/-/graphemer-1.4.0.tgz",
			"integrity": "sha512-EtKwoO6kxCL9WO5xipiHTZlSzBm7WLT627TqC/uVRd0HKmq8NXyebnNYxDoBi7wt8eTWrUrKXCOVaFq9x1kgag==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/has-bigints": {
			"version": "1.1.0",
			"resolved": "https://registry.npmjs.org/has-bigints/-/has-bigints-1.1.0.tgz",
			"integrity": "sha512-R3pbpkcIqv2Pm3dUwgjclDRVmWpTJW2DcMzcIhEXEx1oh/CEMObMm3KLmRJOdvhM7o4uQBnwr8pzRK2sJWIqfg==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/has-flag": {
			"version": "4.0.0",
			"resolved": "https://registry.npmjs.org/has-flag/-/has-flag-4.0.0.tgz",
			"integrity": "sha512-EykJT/Q1KjTWctppgIAgfSO0tKVuZUjhgMr17kqTumMl6Afv3EISleU7qZUzoXDFTAHTDC4NOoG/ZxU3EvlMPQ==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">=8"
			}
		},
		"node_modules/has-property-descriptors": {
			"version": "1.0.2",
			"resolved": "https://registry.npmjs.org/has-property-descriptors/-/has-property-descriptors-1.0.2.tgz",
			"integrity": "sha512-55JNKuIW+vq4Ke1BjOTjM2YctQIvCT7GFzHwmfZPGo5wnrgkid0YQtnAleFSqumZm4az3n2BS+erby5ipJdgrg==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"es-define-property": "^1.0.0"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/has-proto": {
			"version": "1.2.0",
			"resolved": "https://registry.npmjs.org/has-proto/-/has-proto-1.2.0.tgz",
			"integrity": "sha512-KIL7eQPfHQRC8+XluaIw7BHUwwqL19bQn4hzNgdr+1wXoU0KKj6rufu47lhY7KbJR2C6T6+PfyN0Ea7wkSS+qQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"dunder-proto": "^1.0.0"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/has-symbols": {
			"version": "1.1.0",
			"resolved": "https://registry.npmjs.org/has-symbols/-/has-symbols-1.1.0.tgz",
			"integrity": "sha512-1cDNdwJ2Jaohmb3sg4OmKaMBwuC48sYni5HUw2DvsC8LjGTLK9h+eb1X6RyuOHe4hT0ULCW68iomhjUoKUqlPQ==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/has-tostringtag": {
			"version": "1.0.2",
			"resolved": "https://registry.npmjs.org/has-tostringtag/-/has-tostringtag-1.0.2.tgz",
			"integrity": "sha512-NqADB8VjPFLM2V0VvHUewwwsw0ZWBaIdgo+ieHtK3hasLz4qeCRjYcqfB6AQrBggRKppKF8L52/VqdVsO47Dlw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"has-symbols": "^1.0.3"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/hasown": {
			"version": "2.0.4",
			"resolved": "https://registry.npmjs.org/hasown/-/hasown-2.0.4.tgz",
			"integrity": "sha512-T2UbfbBEF32wiepXIsMlTW9+dDYC6wMh/t/vYA4tuOMKqWz/n3vr1NFSxQiyP+zk2mXsoMA/i/7qV6LKut1t1A==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"function-bind": "^1.1.2"
			},
			"engines": {
				"node": ">= 0.4"
			}
		},
		"node_modules/human-signals": {
			"version": "5.0.0",
			"resolved": "https://registry.npmjs.org/human-signals/-/human-signals-5.0.0.tgz",
			"integrity": "sha512-AXcZb6vzzrFAUE61HnN4mpLqd/cSIwNQjtNWR0euPm6y0iqx3G4gOXaIDdtdDwZmhwe82LA6+zinmW4UBWVePQ==",
			"dev": true,
			"license": "Apache-2.0",
			"engines": {
				"node": ">=16.17.0"
			}
		},
		"node_modules/ignore": {
			"version": "5.3.2",
			"resolved": "https://registry.npmjs.org/ignore/-/ignore-5.3.2.tgz",
			"integrity": "sha512-hsBTNUqQTDwkWtcdYI2i06Y/nUBEsNEDJKjWdigLvegy8kDuJAS8uRlpkkcQpyEXL0Z/pjDy5HBmMjRCJ2gq+g==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">= 4"
			}
		},
		"node_modules/import-fresh": {
			"version": "3.3.1",
			"resolved": "https://registry.npmjs.org/import-fresh/-/import-fresh-3.3.1.tgz",
			"integrity": "sha512-TR3KfrTZTYLPB6jUjfx6MF9WcWrHL9su5TObK4ZkYgBdWKPOFoSoQIdEuTuR82pmtxH2spWG9h6etwfr1pLBqQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"parent-module": "^1.0.0",
				"resolve-from": "^4.0.0"
			},
			"engines": {
				"node": ">=6"
			},
			"funding": {
				"url": "https://github.com/sponsors/sindresorhus"
			}
		},
		"node_modules/imurmurhash": {
			"version": "0.1.4",
			"resolved": "https://registry.npmjs.org/imurmurhash/-/imurmurhash-0.1.4.tgz",
			"integrity": "sha512-JmXMZ6wuvDmLiHEml9ykzqO6lwFbof0GG4IkcGaENdCRDDmMVnny7s5HsIgHCbaq0w2MyPhDqkhTUgS2LU2PHA==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">=0.8.19"
			}
		},
		"node_modules/inflight": {
			"version": "1.0.6",
			"resolved": "https://registry.npmjs.org/inflight/-/inflight-1.0.6.tgz",
			"integrity": "sha512-k92I/b08q4wvFscXCLvqfsHCrjrF7yiXsQuIVvVE7N82W3+aqpzuUdBbfhWcy/FZR3/4IgflMgKLOsvPDrGCJA==",
			"deprecated": "This module is not supported, and leaks memory. Do not use it. Check out lru-cache if you want a good and tested way to coalesce async requests by a key value, which is much more comprehensive and powerful.",
			"dev": true,
			"license": "ISC",
			"dependencies": {
				"once": "^1.3.0",
				"wrappy": "1"
			}
		},
		"node_modules/inherits": {
			"version": "2.0.4",
			"resolved": "https://registry.npmjs.org/inherits/-/inherits-2.0.4.tgz",
			"integrity": "sha512-k/vGaX4/Yla3WzyMCvTQOXYeIHvqOKtnqBduzTHpzpQZzAskKMhZ2K+EnBiSM9zGSoIFeMpXKxa4dYeZIQqewQ==",
			"dev": true,
			"license": "ISC"
		},
		"node_modules/internal-slot": {
			"version": "1.1.0",
			"resolved": "https://registry.npmjs.org/internal-slot/-/internal-slot-1.1.0.tgz",
			"integrity": "sha512-4gd7VpWNQNB4UKKCFFVcp1AVv+FMOgs9NKzjHKusc8jTMhd5eL1NqQqOpE0KzMds804/yHlglp3uxgluOqAPLw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"es-errors": "^1.3.0",
				"hasown": "^2.0.2",
				"side-channel": "^1.1.0"
			},
			"engines": {
				"node": ">= 0.4"
			}
		},
		"node_modules/is-array-buffer": {
			"version": "3.0.5",
			"resolved": "https://registry.npmjs.org/is-array-buffer/-/is-array-buffer-3.0.5.tgz",
			"integrity": "sha512-DDfANUiiG2wC1qawP66qlTugJeL5HyzMpfr8lLK+jMQirGzNod0B12cFB/9q838Ru27sBwfw78/rdoU7RERz6A==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bind": "^1.0.8",
				"call-bound": "^1.0.3",
				"get-intrinsic": "^1.2.6"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/is-async-function": {
			"version": "2.1.1",
			"resolved": "https://registry.npmjs.org/is-async-function/-/is-async-function-2.1.1.tgz",
			"integrity": "sha512-9dgM/cZBnNvjzaMYHVoxxfPj2QXt22Ev7SuuPrs+xav0ukGB0S6d4ydZdEiM48kLx5kDV+QBPrpVnFyefL8kkQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"async-function": "^1.0.0",
				"call-bound": "^1.0.3",
				"get-proto": "^1.0.1",
				"has-tostringtag": "^1.0.2",
				"safe-regex-test": "^1.1.0"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/is-bigint": {
			"version": "1.1.0",
			"resolved": "https://registry.npmjs.org/is-bigint/-/is-bigint-1.1.0.tgz",
			"integrity": "sha512-n4ZT37wG78iz03xPRKJrHTdZbe3IicyucEtdRsV5yglwc3GyUfbAfpSeD0FJ41NbUNSt5wbhqfp1fS+BgnvDFQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"has-bigints": "^1.0.2"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/is-boolean-object": {
			"version": "1.2.2",
			"resolved": "https://registry.npmjs.org/is-boolean-object/-/is-boolean-object-1.2.2.tgz",
			"integrity": "sha512-wa56o2/ElJMYqjCjGkXri7it5FbebW5usLw/nPmCMs5DeZ7eziSYZhSmPRn0txqeW4LnAmQQU7FgqLpsEFKM4A==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bound": "^1.0.3",
				"has-tostringtag": "^1.0.2"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/is-callable": {
			"version": "1.2.7",
			"resolved": "https://registry.npmjs.org/is-callable/-/is-callable-1.2.7.tgz",
			"integrity": "sha512-1BC0BVFhS/p0qtw6enp8e+8OD0UrK0oFLztSjNzhcKA3WDuJxxAPXzPuPtKkjEY9UUoEWlX/8fgKeu2S8i9JTA==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/is-core-module": {
			"version": "2.16.2",
			"resolved": "https://registry.npmjs.org/is-core-module/-/is-core-module-2.16.2.tgz",
			"integrity": "sha512-evOr8xfXKxE6qSR0hSXL2r3sd7ALj8+7jQEUvPYcm5sgZFdJ+AYzT6yNmJenvIYQBgIGwfwz08sL8zoL7yq2BA==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"hasown": "^2.0.3"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/is-data-view": {
			"version": "1.0.2",
			"resolved": "https://registry.npmjs.org/is-data-view/-/is-data-view-1.0.2.tgz",
			"integrity": "sha512-RKtWF8pGmS87i2D6gqQu/l7EYRlVdfzemCJN/P3UOs//x1QE7mfhvzHIApBTRf7axvT6DMGwSwBXYCT0nfB9xw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bound": "^1.0.2",
				"get-intrinsic": "^1.2.6",
				"is-typed-array": "^1.1.13"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/is-date-object": {
			"version": "1.1.0",
			"resolved": "https://registry.npmjs.org/is-date-object/-/is-date-object-1.1.0.tgz",
			"integrity": "sha512-PwwhEakHVKTdRNVOw+/Gyh0+MzlCl4R6qKvkhuvLtPMggI1WAHt9sOwZxQLSGpUaDnrdyDsomoRgNnCfKNSXXg==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bound": "^1.0.2",
				"has-tostringtag": "^1.0.2"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/is-document.all": {
			"version": "1.0.0",
			"resolved": "https://registry.npmjs.org/is-document.all/-/is-document.all-1.0.0.tgz",
			"integrity": "sha512-+XSoyS05OdBbhFuELhgTCpFNHkpBOJqtsZfUFFpe5QTw+9Sjbh8zitxhQkYAo6wV7e1Vb8cAPvpCk9jGam/82g==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bound": "^1.0.4"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/is-extglob": {
			"version": "2.1.1",
			"resolved": "https://registry.npmjs.org/is-extglob/-/is-extglob-2.1.1.tgz",
			"integrity": "sha512-SbKbANkN603Vi4jEZv49LeVJMn4yGwsbzZworEoyEiutsN3nJYdbO36zfhGJ6QEDpOZIFkDtnq5JRxmvl3jsoQ==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">=0.10.0"
			}
		},
		"node_modules/is-finalizationregistry": {
			"version": "1.1.1",
			"resolved": "https://registry.npmjs.org/is-finalizationregistry/-/is-finalizationregistry-1.1.1.tgz",
			"integrity": "sha512-1pC6N8qWJbWoPtEjgcL2xyhQOP491EQjeUo3qTKcmV8YSDDJrOepfG8pcC7h/QgnQHYSv0mJ3Z/ZWxmatVrysg==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bound": "^1.0.3"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/is-generator-function": {
			"version": "1.1.2",
			"resolved": "https://registry.npmjs.org/is-generator-function/-/is-generator-function-1.1.2.tgz",
			"integrity": "sha512-upqt1SkGkODW9tsGNG5mtXTXtECizwtS2kA161M+gJPc1xdb/Ax629af6YrTwcOeQHbewrPNlE5Dx7kzvXTizA==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bound": "^1.0.4",
				"generator-function": "^2.0.0",
				"get-proto": "^1.0.1",
				"has-tostringtag": "^1.0.2",
				"safe-regex-test": "^1.1.0"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/is-glob": {
			"version": "4.0.3",
			"resolved": "https://registry.npmjs.org/is-glob/-/is-glob-4.0.3.tgz",
			"integrity": "sha512-xelSayHH36ZgE7ZWhli7pW34hNbNl8Ojv5KVmkJD4hBdD3th8Tfk9vYasLM+mXWOZhFkgZfxhLSnrwRr4elSSg==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"is-extglob": "^2.1.1"
			},
			"engines": {
				"node": ">=0.10.0"
			}
		},
		"node_modules/is-map": {
			"version": "2.0.3",
			"resolved": "https://registry.npmjs.org/is-map/-/is-map-2.0.3.tgz",
			"integrity": "sha512-1Qed0/Hr2m+YqxnM09CjA2d/i6YZNfF6R2oRAOj36eUdS6qIV/huPJNSEpKbupewFs+ZsJlxsjjPbc0/afW6Lw==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/is-negative-zero": {
			"version": "2.0.3",
			"resolved": "https://registry.npmjs.org/is-negative-zero/-/is-negative-zero-2.0.3.tgz",
			"integrity": "sha512-5KoIu2Ngpyek75jXodFvnafB6DJgr3u8uuK0LEZJjrU19DrMD3EVERaR8sjz8CCGgpZvxPl9SuE1GMVPFHx1mw==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/is-number-object": {
			"version": "1.1.1",
			"resolved": "https://registry.npmjs.org/is-number-object/-/is-number-object-1.1.1.tgz",
			"integrity": "sha512-lZhclumE1G6VYD8VHe35wFaIif+CTy5SJIi5+3y4psDgWu4wPDoBhF8NxUOinEc7pHgiTsT6MaBb92rKhhD+Xw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bound": "^1.0.3",
				"has-tostringtag": "^1.0.2"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/is-path-inside": {
			"version": "3.0.3",
			"resolved": "https://registry.npmjs.org/is-path-inside/-/is-path-inside-3.0.3.tgz",
			"integrity": "sha512-Fd4gABb+ycGAmKou8eMftCupSir5lRxqf4aD/vd0cD2qc4HL07OjCeuHMr8Ro4CoMaeCKDB0/ECBOVWjTwUvPQ==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">=8"
			}
		},
		"node_modules/is-regex": {
			"version": "1.2.1",
			"resolved": "https://registry.npmjs.org/is-regex/-/is-regex-1.2.1.tgz",
			"integrity": "sha512-MjYsKHO5O7mCsmRGxWcLWheFqN9DJ/2TmngvjKXihe6efViPqc274+Fx/4fYj/r03+ESvBdTXK0V6tA3rgez1g==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bound": "^1.0.2",
				"gopd": "^1.2.0",
				"has-tostringtag": "^1.0.2",
				"hasown": "^2.0.2"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/is-set": {
			"version": "2.0.3",
			"resolved": "https://registry.npmjs.org/is-set/-/is-set-2.0.3.tgz",
			"integrity": "sha512-iPAjerrse27/ygGLxw+EBR9agv9Y6uLeYVJMu+QNCoouJ1/1ri0mGrcWpfCqFZuzzx3WjtwxG098X+n4OuRkPg==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/is-shared-array-buffer": {
			"version": "1.0.4",
			"resolved": "https://registry.npmjs.org/is-shared-array-buffer/-/is-shared-array-buffer-1.0.4.tgz",
			"integrity": "sha512-ISWac8drv4ZGfwKl5slpHG9OwPNty4jOWPRIhBpxOoD+hqITiwuipOQ2bNthAzwA3B4fIjO4Nln74N0S9byq8A==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bound": "^1.0.3"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/is-stream": {
			"version": "3.0.0",
			"resolved": "https://registry.npmjs.org/is-stream/-/is-stream-3.0.0.tgz",
			"integrity": "sha512-LnQR4bZ9IADDRSkvpqMGvt/tEJWclzklNgSw48V5EAaAeDd6qGvN8ei6k5p0tvxSR171VmGyHuTiAOfxAbr8kA==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": "^12.20.0 || ^14.13.1 || >=16.0.0"
			},
			"funding": {
				"url": "https://github.com/sponsors/sindresorhus"
			}
		},
		"node_modules/is-string": {
			"version": "1.1.1",
			"resolved": "https://registry.npmjs.org/is-string/-/is-string-1.1.1.tgz",
			"integrity": "sha512-BtEeSsoaQjlSPBemMQIrY1MY0uM6vnS1g5fmufYOtnxLGUZM2178PKbhsk7Ffv58IX+ZtcvoGwccYsh0PglkAA==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bound": "^1.0.3",
				"has-tostringtag": "^1.0.2"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/is-symbol": {
			"version": "1.1.1",
			"resolved": "https://registry.npmjs.org/is-symbol/-/is-symbol-1.1.1.tgz",
			"integrity": "sha512-9gGx6GTtCQM73BgmHQXfDmLtfjjTUDSyoxTCbp5WtoixAhfgsDirWIcVQ/IHpvI5Vgd5i/J5F7B9cN/WlVbC/w==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bound": "^1.0.2",
				"has-symbols": "^1.1.0",
				"safe-regex-test": "^1.1.0"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/is-typed-array": {
			"version": "1.1.15",
			"resolved": "https://registry.npmjs.org/is-typed-array/-/is-typed-array-1.1.15.tgz",
			"integrity": "sha512-p3EcsicXjit7SaskXHs1hA91QxgTw46Fv6EFKKGS5DRFLD8yKnohjF3hxoju94b/OcMZoQukzpPpBE9uLVKzgQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"which-typed-array": "^1.1.16"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/is-weakmap": {
			"version": "2.0.2",
			"resolved": "https://registry.npmjs.org/is-weakmap/-/is-weakmap-2.0.2.tgz",
			"integrity": "sha512-K5pXYOm9wqY1RgjpL3YTkF39tni1XajUIkawTLUo9EZEVUFga5gSQJF8nNS7ZwJQ02y+1YCNYcMh+HIf1ZqE+w==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/is-weakref": {
			"version": "1.1.1",
			"resolved": "https://registry.npmjs.org/is-weakref/-/is-weakref-1.1.1.tgz",
			"integrity": "sha512-6i9mGWSlqzNMEqpCp93KwRS1uUOodk2OJ6b+sq7ZPDSy2WuI5NFIxp/254TytR8ftefexkWn5xNiHUNpPOfSew==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bound": "^1.0.3"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/is-weakset": {
			"version": "2.0.4",
			"resolved": "https://registry.npmjs.org/is-weakset/-/is-weakset-2.0.4.tgz",
			"integrity": "sha512-mfcwb6IzQyOKTs84CQMrOwW4gQcaTOAWJ0zzJCl2WSPDrWk/OzDaImWFH3djXhb24g4eudZfLRozAvPGw4d9hQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bound": "^1.0.3",
				"get-intrinsic": "^1.2.6"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/isarray": {
			"version": "2.0.5",
			"resolved": "https://registry.npmjs.org/isarray/-/isarray-2.0.5.tgz",
			"integrity": "sha512-xHjhDr3cNBK0BzdUJSPXZntQUx/mwMS5Rw4A7lPJ90XGAO6ISP/ePDNuo0vhqOZU+UD5JoodwCAAoZQd3FeAKw==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/isexe": {
			"version": "2.0.0",
			"resolved": "https://registry.npmjs.org/isexe/-/isexe-2.0.0.tgz",
			"integrity": "sha512-RHxMLp9lnKHGHRng9QFhRCMbYAcVpn69smSGcq3f36xjgVVWThj4qqLbTLlq7Ssj8B+fIQ1EuCEGI2lKsyQeIw==",
			"dev": true,
			"license": "ISC"
		},
		"node_modules/iterator.prototype": {
			"version": "1.1.5",
			"resolved": "https://registry.npmjs.org/iterator.prototype/-/iterator.prototype-1.1.5.tgz",
			"integrity": "sha512-H0dkQoCa3b2VEeKQBOxFph+JAbcrQdE7KC0UkqwpLmv2EC4P41QXP+rqo9wYodACiG5/WM5s9oDApTU8utwj9g==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"define-data-property": "^1.1.4",
				"es-object-atoms": "^1.0.0",
				"get-intrinsic": "^1.2.6",
				"get-proto": "^1.0.0",
				"has-symbols": "^1.1.0",
				"set-function-name": "^2.0.2"
			},
			"engines": {
				"node": ">= 0.4"
			}
		},
		"node_modules/js-tokens": {
			"version": "9.0.1",
			"resolved": "https://registry.npmjs.org/js-tokens/-/js-tokens-9.0.1.tgz",
			"integrity": "sha512-mxa9E9ITFOt0ban3j6L5MpjwegGz6lBQmM1IJkWeBZGcMxto50+eWdjC/52xDbS2vy0k7vIMK0Fe2wfL9OQSpQ==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/js-yaml": {
			"version": "4.3.2",
			"resolved": "https://registry.npmjs.org/js-yaml/-/js-yaml-4.3.2.tgz",
			"integrity": "sha512-SFNOvSJ+Dgf/9An904Yx+CgSlIPCkIpao4qo51lpee25TIRejdH3rhR4EZMGoNx3/TP3O+wzWuiTFl4sqbltzA==",
			"dev": true,
			"funding": [
				{
					"type": "github",
					"url": "https://github.com/sponsors/puzrin"
				},
				{
					"type": "github",
					"url": "https://github.com/sponsors/nodeca"
				}
			],
			"license": "MIT",
			"dependencies": {
				"argparse": "^2.0.1"
			},
			"bin": {
				"js-yaml": "bin/js-yaml.js"
			}
		},
		"node_modules/json-buffer": {
			"version": "3.0.1",
			"resolved": "https://registry.npmjs.org/json-buffer/-/json-buffer-3.0.1.tgz",
			"integrity": "sha512-4bV5BfR2mqfQTJm+V5tPPdf+ZpuhiIvTuAB5g8kcrXOZpTT/QwwVRWBywX1ozr6lEuPdbHxwaJlm9G6mI2sfSQ==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/json-schema-migrate": {
			"version": "2.0.0",
			"resolved": "https://registry.npmjs.org/json-schema-migrate/-/json-schema-migrate-2.0.0.tgz",
			"integrity": "sha512-r38SVTtojDRp4eD6WsCqiE0eNDt4v1WalBXb9cyZYw9ai5cGtBwzRNWjHzJl38w6TxFkXAIA7h+fyX3tnrAFhQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"ajv": "^8.0.0"
			}
		},
		"node_modules/json-schema-migrate/node_modules/ajv": {
			"version": "8.20.0",
			"resolved": "https://registry.npmjs.org/ajv/-/ajv-8.20.0.tgz",
			"integrity": "sha512-Thbli+OlOj+iMPYFBVBfJ3OmCAnaSyNn4M1vz9T6Gka5Jt9ba/HIR56joy65tY6kx/FCF5VXNB819Y7/GUrBGA==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"fast-deep-equal": "^3.1.3",
				"fast-uri": "^3.0.1",
				"json-schema-traverse": "^1.0.0",
				"require-from-string": "^2.0.2"
			},
			"funding": {
				"type": "github",
				"url": "https://github.com/sponsors/epoberezkin"
			}
		},
		"node_modules/json-schema-migrate/node_modules/json-schema-traverse": {
			"version": "1.0.0",
			"resolved": "https://registry.npmjs.org/json-schema-traverse/-/json-schema-traverse-1.0.0.tgz",
			"integrity": "sha512-NM8/P9n3XjXhIZn1lLhkFaACTOURQXjWhV4BA/RnOv8xvgqtqpAX9IO4mRQxSx1Rlo4tqzeqb0sOlruaOy3dug==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/json-schema-traverse": {
			"version": "0.4.1",
			"resolved": "https://registry.npmjs.org/json-schema-traverse/-/json-schema-traverse-0.4.1.tgz",
			"integrity": "sha512-xbbCH5dCYU5T8LcEhhuh7HJ88HXuW3qsI3Y0zOZFKfZEHcpWiHU/Jxzk629Brsab/mMiHQti9wMP+845RPe3Vg==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/json-stable-stringify-without-jsonify": {
			"version": "1.0.1",
			"resolved": "https://registry.npmjs.org/json-stable-stringify-without-jsonify/-/json-stable-stringify-without-jsonify-1.0.1.tgz",
			"integrity": "sha512-Bdboy+l7tA3OGW6FjyFHWkP5LuByj1Tk33Ljyq0axyzdk9//JSi2u3fP1QSmd1KNwq6VOKYGlAu87CisVir6Pw==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/json5": {
			"version": "1.0.2",
			"resolved": "https://registry.npmjs.org/json5/-/json5-1.0.2.tgz",
			"integrity": "sha512-g1MWMLBiz8FKi1e4w0UyVL3w+iJceWAFBAaBnnGKOpNa5f8TLktkbre1+s6oICydWAm+HRUGTmI+//xv2hvXYA==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"minimist": "^1.2.0"
			},
			"bin": {
				"json5": "lib/cli.js"
			}
		},
		"node_modules/jsonc-eslint-parser": {
			"version": "2.4.2",
			"resolved": "https://registry.npmjs.org/jsonc-eslint-parser/-/jsonc-eslint-parser-2.4.2.tgz",
			"integrity": "sha512-1e4qoRgnn448pRuMvKGsFFymUCquZV0mpGgOyIKNgD3JVDTsVJyRBGH/Fm0tBb8WsWGgmB1mDe6/yJMQM37DUA==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"acorn": "^8.5.0",
				"eslint-visitor-keys": "^3.0.0",
				"espree": "^9.0.0",
				"semver": "^7.3.5"
			},
			"engines": {
				"node": "^12.22.0 || ^14.17.0 || >=16.0.0"
			},
			"funding": {
				"url": "https://github.com/sponsors/ota-meshi"
			}
		},
		"node_modules/jsx-ast-utils": {
			"version": "3.3.5",
			"resolved": "https://registry.npmjs.org/jsx-ast-utils/-/jsx-ast-utils-3.3.5.tgz",
			"integrity": "sha512-ZZow9HBI5O6EPgSJLUb8n2NKgmVWTwCvHGwFuJlMjvLFqlGG6pjirPhtdsseaLZjSibD8eegzmYpUZwoIlj2cQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"array-includes": "^3.1.6",
				"array.prototype.flat": "^1.3.1",
				"object.assign": "^4.1.4",
				"object.values": "^1.1.6"
			},
			"engines": {
				"node": ">=4.0"
			}
		},
		"node_modules/keyv": {
			"version": "4.5.4",
			"resolved": "https://registry.npmjs.org/keyv/-/keyv-4.5.4.tgz",
			"integrity": "sha512-oxVHkHR/EJf2CNXnWxRLW6mg7JyCCUcG0DtEGmL2ctUo1PNTin1PUil+r/+4r5MpVgC/fn1kjsx7mjSujKqIpw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"json-buffer": "3.0.1"
			}
		},
		"node_modules/levn": {
			"version": "0.4.1",
			"resolved": "https://registry.npmjs.org/levn/-/levn-0.4.1.tgz",
			"integrity": "sha512-+bT2uH4E5LGE7h/n3evcS/sQlJXCpIp6ym8OWJ5eV6+67Dsql/LaaT7qJBAt2rzfoa/5QBGBhxDix1dMt2kQKQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"prelude-ls": "^1.2.1",
				"type-check": "~0.4.0"
			},
			"engines": {
				"node": ">= 0.8.0"
			}
		},
		"node_modules/local-pkg": {
			"version": "0.5.1",
			"resolved": "https://registry.npmjs.org/local-pkg/-/local-pkg-0.5.1.tgz",
			"integrity": "sha512-9rrA30MRRP3gBD3HTGnC6cDFpaE1kVDWxWgqWJUN0RvDNAo+Nz/9GxB+nHOH0ifbVFy0hSA1V6vFDvnx54lTEQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"mlly": "^1.7.3",
				"pkg-types": "^1.2.1"
			},
			"engines": {
				"node": ">=14"
			},
			"funding": {
				"url": "https://github.com/sponsors/antfu"
			}
		},
		"node_modules/locate-path": {
			"version": "6.0.0",
			"resolved": "https://registry.npmjs.org/locate-path/-/locate-path-6.0.0.tgz",
			"integrity": "sha512-iPZK6eYjbxRu3uB4/WZ3EsEIMJFMqAoopl3R+zuq0UjcAm/MO6KCweDgPfP3elTztoKP3KtnVHxTn2NHBSDVUw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"p-locate": "^5.0.0"
			},
			"engines": {
				"node": ">=10"
			},
			"funding": {
				"url": "https://github.com/sponsors/sindresorhus"
			}
		},
		"node_modules/lodash.merge": {
			"version": "4.6.2",
			"resolved": "https://registry.npmjs.org/lodash.merge/-/lodash.merge-4.6.2.tgz",
			"integrity": "sha512-0KpjqXRVvrYyCsX1swR/XTK0va6VQkQM6MNo7PqW77ByjAhoARA8EfrP1N4+KlKj8YS0ZUCtRT/YUuhyYDujIQ==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/loose-envify": {
			"version": "1.4.0",
			"resolved": "https://registry.npmjs.org/loose-envify/-/loose-envify-1.4.0.tgz",
			"integrity": "sha512-lyuxPGr/Wfhrlem2CL/UcnUc1zcqKAImBDzukY7Y5F/yQiNdko6+fRLevlw1HgMySw7f611UIY408EtxRSoK3Q==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"js-tokens": "^3.0.0 || ^4.0.0"
			},
			"bin": {
				"loose-envify": "cli.js"
			}
		},
		"node_modules/loose-envify/node_modules/js-tokens": {
			"version": "4.0.0",
			"resolved": "https://registry.npmjs.org/js-tokens/-/js-tokens-4.0.0.tgz",
			"integrity": "sha512-RdJUflcE3cUzKiMqQgsCu06FPu9UdIJO0beYbPhHN4k6apgJtifcoCtT9bcxOpYBtpD2kCM6Sbzg4CausW/PKQ==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/loupe": {
			"version": "2.3.7",
			"resolved": "https://registry.npmjs.org/loupe/-/loupe-2.3.7.tgz",
			"integrity": "sha512-zSMINGVYkdpYSOBmLi0D1Uo7JU9nVdQKrHxC8eYlV+9YKK9WePqAlL7lSlorG/U2Fw1w0hTBmaa/jrQ3UbPHtA==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"get-func-name": "^2.0.1"
			}
		},
		"node_modules/magic-string": {
			"version": "0.30.21",
			"resolved": "https://registry.npmjs.org/magic-string/-/magic-string-0.30.21.tgz",
			"integrity": "sha512-vd2F4YUyEXKGcLHoq+TEyCjxueSeHnFxyyjNp80yg0XV4vUhnDer/lvvlqM/arB5bXQN5K2/3oinyCRyx8T2CQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"@jridgewell/sourcemap-codec": "^1.5.5"
			}
		},
		"node_modules/math-intrinsics": {
			"version": "1.1.0",
			"resolved": "https://registry.npmjs.org/math-intrinsics/-/math-intrinsics-1.1.0.tgz",
			"integrity": "sha512-/IXtbwEk5HTPyEwyKX6hGkYXxM9nbj64B+ilVJnC/R6B0pH5G4V3b0pVbL7DBj4tkhBAppbQUlf6F6Xl9LHu1g==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">= 0.4"
			}
		},
		"node_modules/merge-stream": {
			"version": "2.0.0",
			"resolved": "https://registry.npmjs.org/merge-stream/-/merge-stream-2.0.0.tgz",
			"integrity": "sha512-abv/qOcuPfk3URPfDzmZU1LKmuw8kT+0nIHvKrKgFrwifol/doWcdA4ZqsWQ8ENrFKkd67Mfpo/LovbIUsbt3w==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/mimic-fn": {
			"version": "4.0.0",
			"resolved": "https://registry.npmjs.org/mimic-fn/-/mimic-fn-4.0.0.tgz",
			"integrity": "sha512-vqiC06CuhBTUdZH+RYl8sFrL096vA45Ok5ISO6sE/Mr1jRbGH4Csnhi8f3wKVl7x8mO4Au7Ir9D3Oyv1VYMFJw==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">=12"
			},
			"funding": {
				"url": "https://github.com/sponsors/sindresorhus"
			}
		},
		"node_modules/minimatch": {
			"version": "3.1.5",
			"resolved": "https://registry.npmjs.org/minimatch/-/minimatch-3.1.5.tgz",
			"integrity": "sha512-VgjWUsnnT6n+NUk6eZq77zeFdpW2LWDzP6zFGrCbHXiYNul5Dzqk2HHQ5uFH2DNW5Xbp8+jVzaeNt94ssEEl4w==",
			"dev": true,
			"license": "ISC",
			"dependencies": {
				"brace-expansion": "^1.1.7"
			},
			"engines": {
				"node": "*"
			}
		},
		"node_modules/minimist": {
			"version": "1.2.8",
			"resolved": "https://registry.npmjs.org/minimist/-/minimist-1.2.8.tgz",
			"integrity": "sha512-2yyAR8qBkN3YuheJanUpWC5U3bb5osDywNB8RzDVlDwDHbocAJveqqj1u8+SVD7jkWT4yvsHCpWqqWqAxb0zCA==",
			"dev": true,
			"license": "MIT",
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/mlly": {
			"version": "1.8.2",
			"resolved": "https://registry.npmjs.org/mlly/-/mlly-1.8.2.tgz",
			"integrity": "sha512-d+ObxMQFmbt10sretNDytwt85VrbkhhUA/JBGm1MPaWJ65Cl4wOgLaB1NYvJSZ0Ef03MMEU/0xpPMXUIQ29UfA==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"acorn": "^8.16.0",
				"pathe": "^2.0.3",
				"pkg-types": "^1.3.1",
				"ufo": "^1.6.3"
			}
		},
		"node_modules/mlly/node_modules/pathe": {
			"version": "2.0.3",
			"resolved": "https://registry.npmjs.org/pathe/-/pathe-2.0.3.tgz",
			"integrity": "sha512-WUjGcAqP1gQacoQe+OBJsFA7Ld4DyXuUIjZ5cc75cLHvJ7dtNsTugphxIADwspS+AraAUePCKrSVtPLFj/F88w==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/module-replacements": {
			"version": "2.11.0",
			"resolved": "https://registry.npmjs.org/module-replacements/-/module-replacements-2.11.0.tgz",
			"integrity": "sha512-j5sNQm3VCpQQ7nTqGeOZtoJtV3uKERgCBm9QRhmGRiXiqkf7iRFOkfxdJRZWLkqYY8PNf4cDQF/WfXUYLENrRA==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/moment": {
			"version": "2.29.4",
			"resolved": "https://registry.npmjs.org/moment/-/moment-2.29.4.tgz",
			"integrity": "sha512-5LC9SOxjSc2HF6vO2CyuTDNivEdoz2IvyJJGj6X8DJ0eFyfszE0QiEd+iXmBvUP3WHxSjFH/vIsA0EN00cgr8w==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": "*"
			}
		},
		"node_modules/ms": {
			"version": "2.1.3",
			"resolved": "https://registry.npmjs.org/ms/-/ms-2.1.3.tgz",
			"integrity": "sha512-6FlzubTLZG3J2a/NVCAleEhjzq5oxgHyaCU9yYXvcLsvoVaHJq/s5xXI6/XXP6tz7R9xAOtHnSO/tXtF3WRTlA==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/nanoid": {
			"version": "3.3.18",
			"resolved": "https://registry.npmjs.org/nanoid/-/nanoid-3.3.18.tgz",
			"integrity": "sha512-DTg4MJbGMWkfi6VZFdNt2/caMbQy4Ou+Op/hJQvGEWcnVfoA1QA+xzRKAzw9jD6+GVOOeYr/mIcuDSdug6F6+w==",
			"dev": true,
			"funding": [
				{
					"type": "github",
					"url": "https://github.com/sponsors/ai"
				}
			],
			"license": "MIT",
			"bin": {
				"nanoid": "bin/nanoid.cjs"
			},
			"engines": {
				"node": "^10 || ^12 || ^13.7 || ^14 || >=15.0.1"
			}
		},
		"node_modules/natural-compare": {
			"version": "1.4.0",
			"resolved": "https://registry.npmjs.org/natural-compare/-/natural-compare-1.4.0.tgz",
			"integrity": "sha512-OWND8ei3VtNC9h7V60qff3SVobHr996CTwgxubgyQYEpg290h9J0buyECNNJexkFm5sOajh5G116RYA1c8ZMSw==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/node-exports-info": {
			"version": "1.6.2",
			"resolved": "https://registry.npmjs.org/node-exports-info/-/node-exports-info-1.6.2.tgz",
			"integrity": "sha512-kXs9Go0cah0qHVV2v389IXQLdLCeE1xfFtjOAF+iobu0OIoG1pje8At2vMHyaPMiPMnG/LWP50twML21eMcAag==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"array.prototype.flatmap": "^1.3.3",
				"es-errors": "^1.3.0",
				"object.entries": "^1.1.9",
				"semver": "^6.3.1"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/node-exports-info/node_modules/semver": {
			"version": "6.3.1",
			"resolved": "https://registry.npmjs.org/semver/-/semver-6.3.1.tgz",
			"integrity": "sha512-BR7VvDCVHO+q2xBEWskxS6DJE1qRnb7DxzUrogb71CWoSficBxYsiAGd+Kl0mmq/MprG9yArRkyrQxTO6XjMzA==",
			"dev": true,
			"license": "ISC",
			"bin": {
				"semver": "bin/semver.js"
			}
		},
		"node_modules/npm-run-path": {
			"version": "5.3.0",
			"resolved": "https://registry.npmjs.org/npm-run-path/-/npm-run-path-5.3.0.tgz",
			"integrity": "sha512-ppwTtiJZq0O/ai0z7yfudtBpWIoxM8yE6nHi1X47eFR2EWORqfbu6CnPlNsjeN683eT0qG6H/Pyf9fCcvjnnnQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"path-key": "^4.0.0"
			},
			"engines": {
				"node": "^12.20.0 || ^14.13.1 || >=16.0.0"
			},
			"funding": {
				"url": "https://github.com/sponsors/sindresorhus"
			}
		},
		"node_modules/npm-run-path/node_modules/path-key": {
			"version": "4.0.0",
			"resolved": "https://registry.npmjs.org/path-key/-/path-key-4.0.0.tgz",
			"integrity": "sha512-haREypq7xkM7ErfgIyA0z+Bj4AGKlMSdlQE2jvJo6huWD1EdkKYV+G/T4nq0YEF2vgTT8kqMFKo1uHn950r4SQ==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">=12"
			},
			"funding": {
				"url": "https://github.com/sponsors/sindresorhus"
			}
		},
		"node_modules/object-assign": {
			"version": "4.1.1",
			"resolved": "https://registry.npmjs.org/object-assign/-/object-assign-4.1.1.tgz",
			"integrity": "sha512-rJgTQnkUnH1sFw8yT6VSU3zD3sWmu6sZhIseY8VX+GRu3P6F7Fu+JNDoXfklElbLJSnc3FUQHVe4cU5hj+BcUg==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">=0.10.0"
			}
		},
		"node_modules/object-inspect": {
			"version": "1.13.4",
			"resolved": "https://registry.npmjs.org/object-inspect/-/object-inspect-1.13.4.tgz",
			"integrity": "sha512-W67iLl4J2EXEGTbfeHCffrjDfitvLANg0UlX3wFUUSTx92KXRFegMHUVgSqE+wvhAbi4WqjGg9czysTV2Epbew==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/object-keys": {
			"version": "1.1.1",
			"resolved": "https://registry.npmjs.org/object-keys/-/object-keys-1.1.1.tgz",
			"integrity": "sha512-NuAESUOUMrlIXOfHKzD6bpPu3tYt3xvjNdRIQ+FeT0lNb4K8WR70CaDxhuNguS2XG+GjkyMwOzsN5ZktImfhLA==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">= 0.4"
			}
		},
		"node_modules/object.assign": {
			"version": "4.1.7",
			"resolved": "https://registry.npmjs.org/object.assign/-/object.assign-4.1.7.tgz",
			"integrity": "sha512-nK28WOo+QIjBkDduTINE4JkF/UJJKyf2EJxvJKfblDpyg0Q+pkOHNTL0Qwy6NP6FhE/EnzV73BxxqcJaXY9anw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bind": "^1.0.8",
				"call-bound": "^1.0.3",
				"define-properties": "^1.2.1",
				"es-object-atoms": "^1.0.0",
				"has-symbols": "^1.1.0",
				"object-keys": "^1.1.1"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/object.entries": {
			"version": "1.1.9",
			"resolved": "https://registry.npmjs.org/object.entries/-/object.entries-1.1.9.tgz",
			"integrity": "sha512-8u/hfXFRBD1O0hPUjioLhoWFHRmt6tKA4/vZPyckBr18l1KE9uHrFaFaUi8MDRTpi4uak2goyPTSNJLXX2k2Hw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bind": "^1.0.8",
				"call-bound": "^1.0.4",
				"define-properties": "^1.2.1",
				"es-object-atoms": "^1.1.1"
			},
			"engines": {
				"node": ">= 0.4"
			}
		},
		"node_modules/object.fromentries": {
			"version": "2.0.8",
			"resolved": "https://registry.npmjs.org/object.fromentries/-/object.fromentries-2.0.8.tgz",
			"integrity": "sha512-k6E21FzySsSK5a21KRADBd/NGneRegFO5pLHfdQLpRDETUNJueLXs3WCzyQ3tFRDYgbq3KHGXfTbi2bs8WQ6rQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bind": "^1.0.7",
				"define-properties": "^1.2.1",
				"es-abstract": "^1.23.2",
				"es-object-atoms": "^1.0.0"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/object.groupby": {
			"version": "1.0.3",
			"resolved": "https://registry.npmjs.org/object.groupby/-/object.groupby-1.0.3.tgz",
			"integrity": "sha512-+Lhy3TQTuzXI5hevh8sBGqbmurHbbIjAi0Z4S63nthVLmLxfbj4T54a4CfZrXIrt9iP4mVAPYMo/v99taj3wjQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bind": "^1.0.7",
				"define-properties": "^1.2.1",
				"es-abstract": "^1.23.2"
			},
			"engines": {
				"node": ">= 0.4"
			}
		},
		"node_modules/object.values": {
			"version": "1.2.1",
			"resolved": "https://registry.npmjs.org/object.values/-/object.values-1.2.1.tgz",
			"integrity": "sha512-gXah6aZrcUxjWg2zR2MwouP2eHlCBzdV4pygudehaKXSGW4v2AsRQUK+lwwXhii6KFZcunEnmSUoYp5CXibxtA==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bind": "^1.0.8",
				"call-bound": "^1.0.3",
				"define-properties": "^1.2.1",
				"es-object-atoms": "^1.0.0"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/obsidian": {
			"version": "1.13.1",
			"resolved": "https://registry.npmjs.org/obsidian/-/obsidian-1.13.1.tgz",
			"integrity": "sha512-qtTEA2pmhJzhuhJqzbBFRYhpIOqvW+krDYjtFynv66KbxBbumHBlsJfWw3I4jtnK/6fZwbQhCrmmDdRwXmX56w==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"@types/codemirror": "5.60.8",
				"moment": "2.29.4"
			},
			"peerDependencies": {
				"@codemirror/state": "6.5.0",
				"@codemirror/view": "6.38.6"
			}
		},
		"node_modules/once": {
			"version": "1.4.0",
			"resolved": "https://registry.npmjs.org/once/-/once-1.4.0.tgz",
			"integrity": "sha512-lNaJgI+2Q5URQBkccEKHTQOPaXdUxnZZElQTZY0MFUAuaEqe1E+Nyvgdz/aIyNi6Z9MzO5dv1H8n58/GELp3+w==",
			"dev": true,
			"license": "ISC",
			"dependencies": {
				"wrappy": "1"
			}
		},
		"node_modules/onetime": {
			"version": "6.0.0",
			"resolved": "https://registry.npmjs.org/onetime/-/onetime-6.0.0.tgz",
			"integrity": "sha512-1FlR+gjXK7X+AsAHso35MnyN5KqGwJRi/31ft6x0M194ht7S+rWAvd7PHss9xSKMzE0asv1pyIHaJYq+BbacAQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"mimic-fn": "^4.0.0"
			},
			"engines": {
				"node": ">=12"
			},
			"funding": {
				"url": "https://github.com/sponsors/sindresorhus"
			}
		},
		"node_modules/optionator": {
			"version": "0.9.4",
			"resolved": "https://registry.npmjs.org/optionator/-/optionator-0.9.4.tgz",
			"integrity": "sha512-6IpQ7mKUxRcZNLIObR0hz7lxsapSSIYNZJwXPGeF0mTVqGKFIXj1DQcMoT22S3ROcLyY/rz0PWaWZ9ayWmad9g==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"deep-is": "^0.1.3",
				"fast-levenshtein": "^2.0.6",
				"levn": "^0.4.1",
				"prelude-ls": "^1.2.1",
				"type-check": "^0.4.0",
				"word-wrap": "^1.2.5"
			},
			"engines": {
				"node": ">= 0.8.0"
			}
		},
		"node_modules/own-keys": {
			"version": "1.0.2",
			"resolved": "https://registry.npmjs.org/own-keys/-/own-keys-1.0.2.tgz",
			"integrity": "sha512-19YVAg7T+WTrxggPukVq7DjTv6+PJ867TmhCvBsYwmbFCsZd344rq2Ld1p0wo8f8Qrrhgp82c6FJRqdXWtSEhg==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bound": "^1.0.4",
				"get-intrinsic": "^1.3.0",
				"object-keys": "^1.1.1",
				"safe-push-apply": "^1.0.0"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/p-limit": {
			"version": "5.0.0",
			"resolved": "https://registry.npmjs.org/p-limit/-/p-limit-5.0.0.tgz",
			"integrity": "sha512-/Eaoq+QyLSiXQ4lyYV23f14mZRQcXnxfHrN0vCai+ak9G0pp9iEQukIIZq5NccEvwRB8PUnZT0KsOoDCINS1qQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"yocto-queue": "^1.0.0"
			},
			"engines": {
				"node": ">=18"
			},
			"funding": {
				"url": "https://github.com/sponsors/sindresorhus"
			}
		},
		"node_modules/p-locate": {
			"version": "5.0.0",
			"resolved": "https://registry.npmjs.org/p-locate/-/p-locate-5.0.0.tgz",
			"integrity": "sha512-LaNjtRWUBY++zB5nE/NwcaoMylSPk+S+ZHNB1TzdbMJMny6dynpAGt7X/tl/QYq3TIeE6nxHppbo2LGymrG5Pw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"p-limit": "^3.0.2"
			},
			"engines": {
				"node": ">=10"
			},
			"funding": {
				"url": "https://github.com/sponsors/sindresorhus"
			}
		},
		"node_modules/p-locate/node_modules/p-limit": {
			"version": "3.1.0",
			"resolved": "https://registry.npmjs.org/p-limit/-/p-limit-3.1.0.tgz",
			"integrity": "sha512-TYOanM3wGwNGsZN2cVTYPArw454xnXj5qmWF1bEoAc4+cU/ol7GVh7odevjp1FNHduHc3KZMcFduxU5Xc6uJRQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"yocto-queue": "^0.1.0"
			},
			"engines": {
				"node": ">=10"
			},
			"funding": {
				"url": "https://github.com/sponsors/sindresorhus"
			}
		},
		"node_modules/p-locate/node_modules/yocto-queue": {
			"version": "0.1.0",
			"resolved": "https://registry.npmjs.org/yocto-queue/-/yocto-queue-0.1.0.tgz",
			"integrity": "sha512-rVksvsnNCdJ/ohGc6xgPwyN8eheCxsiLM8mxuE/t/mOVqJewPuO1miLpTHQiRgTKCLexL4MeAFVagts7HmNZ2Q==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">=10"
			},
			"funding": {
				"url": "https://github.com/sponsors/sindresorhus"
			}
		},
		"node_modules/parent-module": {
			"version": "1.0.1",
			"resolved": "https://registry.npmjs.org/parent-module/-/parent-module-1.0.1.tgz",
			"integrity": "sha512-GQ2EWRpQV8/o+Aw8YqtfZZPfNRWZYkbidE9k5rpl/hC3vtHHBfGm2Ifi6qWV+coDGkrUKZAxE3Lot5kcsRlh+g==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"callsites": "^3.0.0"
			},
			"engines": {
				"node": ">=6"
			}
		},
		"node_modules/path-exists": {
			"version": "4.0.0",
			"resolved": "https://registry.npmjs.org/path-exists/-/path-exists-4.0.0.tgz",
			"integrity": "sha512-ak9Qy5Q7jYb2Wwcey5Fpvg2KoAc/ZIhLSLOSBmRmygPsGwkVVt0fZa0qrtMz+m6tJTAHfZQ8FnmB4MG4LWy7/w==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">=8"
			}
		},
		"node_modules/path-is-absolute": {
			"version": "1.0.1",
			"resolved": "https://registry.npmjs.org/path-is-absolute/-/path-is-absolute-1.0.1.tgz",
			"integrity": "sha512-AVbw3UJ2e9bq64vSaS9Am0fje1Pa8pbGqTTsmXfaIiMpnr5DlDhfJOuLj9Sf95ZPVDAUerDfEk88MPmPe7UCQg==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">=0.10.0"
			}
		},
		"node_modules/path-key": {
			"version": "3.1.1",
			"resolved": "https://registry.npmjs.org/path-key/-/path-key-3.1.1.tgz",
			"integrity": "sha512-ojmeN0qd+y0jszEtoY48r0Peq5dwMEkIlCOu6Q5f41lfkswXuKtYrhgoTpLnyIcHm24Uhqx+5Tqm2InSwLhE6Q==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">=8"
			}
		},
		"node_modules/path-parse": {
			"version": "1.0.7",
			"resolved": "https://registry.npmjs.org/path-parse/-/path-parse-1.0.7.tgz",
			"integrity": "sha512-LDJzPVEEEPR+y48z93A0Ed0yXb8pAByGWo/k5YYdYgpY2/2EsOsksJrq7lOHxryrVOn1ejG6oAp8ahvOIQD8sw==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/pathe": {
			"version": "1.1.2",
			"resolved": "https://registry.npmjs.org/pathe/-/pathe-1.1.2.tgz",
			"integrity": "sha512-whLdWMYL2TwI08hn8/ZqAbrVemu0LNaNNJZX73O6qaIdCTfXutsLhMkjdENX0qhsQ9uIimo4/aQOmXkoon2nDQ==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/pathval": {
			"version": "1.1.1",
			"resolved": "https://registry.npmjs.org/pathval/-/pathval-1.1.1.tgz",
			"integrity": "sha512-Dp6zGqpTdETdR63lehJYPeIOqpiNBNtc7BpWSLrOje7UaIsE5aY92r/AunQA7rsXvet3lrJ3JnZX29UPTKXyKQ==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": "*"
			}
		},
		"node_modules/picocolors": {
			"version": "1.1.1",
			"resolved": "https://registry.npmjs.org/picocolors/-/picocolors-1.1.1.tgz",
			"integrity": "sha512-xceH2snhtb5M9liqDsmEw56le376mTZkEX/jEb/RxNFyegNul7eNslCXP9FDj/Lcu0X8KEyMceP2ntpaHrDEVA==",
			"dev": true,
			"license": "ISC"
		},
		"node_modules/picomatch": {
			"version": "4.0.7",
			"resolved": "https://registry.npmjs.org/picomatch/-/picomatch-4.0.7.tgz",
			"integrity": "sha512-qcJu88Q2IWqJsDD529JKMdwGm/dvInW4HvQnRwiH9JtihJvzGOscDtHE3x1pBKeUOTysQ8kVmLnJ2kJu7yhcGA==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">=12"
			},
			"funding": {
				"url": "https://github.com/sponsors/jonschlinkert"
			}
		},
		"node_modules/pkg-types": {
			"version": "1.3.1",
			"resolved": "https://registry.npmjs.org/pkg-types/-/pkg-types-1.3.1.tgz",
			"integrity": "sha512-/Jm5M4RvtBFVkKWRu2BLUTNP8/M2a+UwuAX+ae4770q1qVGtfjG+WTCupoZixokjmHiry8uI+dlY8KXYV5HVVQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"confbox": "^0.1.8",
				"mlly": "^1.7.4",
				"pathe": "^2.0.1"
			}
		},
		"node_modules/pkg-types/node_modules/pathe": {
			"version": "2.0.3",
			"resolved": "https://registry.npmjs.org/pathe/-/pathe-2.0.3.tgz",
			"integrity": "sha512-WUjGcAqP1gQacoQe+OBJsFA7Ld4DyXuUIjZ5cc75cLHvJ7dtNsTugphxIADwspS+AraAUePCKrSVtPLFj/F88w==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/possible-typed-array-names": {
			"version": "1.1.0",
			"resolved": "https://registry.npmjs.org/possible-typed-array-names/-/possible-typed-array-names-1.1.0.tgz",
			"integrity": "sha512-/+5VFTchJDoVj3bhoqi6UeymcD00DAwb1nJwamzPvHEszJ4FpF6SNNbUbOS8yI56qHzdV8eK0qEfOSiodkTdxg==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">= 0.4"
			}
		},
		"node_modules/postcss": {
			"version": "8.5.26",
			"resolved": "https://registry.npmjs.org/postcss/-/postcss-8.5.26.tgz",
			"integrity": "sha512-u82N74LFzG8ca+dD8puPnplTXoGH4fTPpVGuIbt36G3qvNlkvfD0lEAZSxaly3KX8TS/L1A1gsCEmvKmBcVbkQ==",
			"dev": true,
			"funding": [
				{
					"type": "opencollective",
					"url": "https://opencollective.com/postcss/"
				},
				{
					"type": "tidelift",
					"url": "https://tidelift.com/funding/github/npm/postcss"
				},
				{
					"type": "github",
					"url": "https://github.com/sponsors/ai"
				}
			],
			"license": "MIT",
			"dependencies": {
				"nanoid": "^3.3.17",
				"picocolors": "^1.1.1",
				"source-map-js": "^1.2.1"
			},
			"engines": {
				"node": "^10 || ^12 || >=14"
			}
		},
		"node_modules/prelude-ls": {
			"version": "1.2.1",
			"resolved": "https://registry.npmjs.org/prelude-ls/-/prelude-ls-1.2.1.tgz",
			"integrity": "sha512-vkcDPrRZo1QZLbn5RLGPpg/WmIQ65qoWWhcGKf/b5eplkkarX0m9z8ppCat4mlOqUsWpyNuYgO3VRyrYHSzX5g==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">= 0.8.0"
			}
		},
		"node_modules/pretty-format": {
			"version": "29.7.0",
			"resolved": "https://registry.npmjs.org/pretty-format/-/pretty-format-29.7.0.tgz",
			"integrity": "sha512-Pdlw/oPxN+aXdmM9R00JVC9WVFoCLTKJvDVLgmJ+qAffBMxsV85l/Lu7sNx4zSzPyoL2euImuEwHhOXdEgNFZQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"@jest/schemas": "^29.6.3",
				"ansi-styles": "^5.0.0",
				"react-is": "^18.0.0"
			},
			"engines": {
				"node": "^14.15.0 || ^16.10.0 || >=18.0.0"
			}
		},
		"node_modules/prop-types": {
			"version": "15.8.1",
			"resolved": "https://registry.npmjs.org/prop-types/-/prop-types-15.8.1.tgz",
			"integrity": "sha512-oj87CgZICdulUohogVAR7AjlC0327U4el4L6eAvOqCeudMDVU0NThNaV+b9Df4dXgSP1gXMTnPdhfe/2qDH5cg==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"loose-envify": "^1.4.0",
				"object-assign": "^4.1.1",
				"react-is": "^16.13.1"
			}
		},
		"node_modules/prop-types/node_modules/react-is": {
			"version": "16.13.1",
			"resolved": "https://registry.npmjs.org/react-is/-/react-is-16.13.1.tgz",
			"integrity": "sha512-24e6ynE2H+OKt4kqsOvNd8kBpV65zoxbA4BVsEOB3ARVWQki/DHzaUoC5KuON/BiccDaCCTZBuOcfZs70kR8bQ==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/punycode": {
			"version": "2.3.1",
			"resolved": "https://registry.npmjs.org/punycode/-/punycode-2.3.1.tgz",
			"integrity": "sha512-vYt7UD1U9Wg6138shLtLOvdAu+8DsC/ilFtEVHcH+wydcSpNE20AfSOduf6MkRFahL5FY7X1oU7nKVZFtfq8Fg==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">=6"
			}
		},
		"node_modules/queue-microtask": {
			"version": "1.2.3",
			"resolved": "https://registry.npmjs.org/queue-microtask/-/queue-microtask-1.2.3.tgz",
			"integrity": "sha512-NuaNSa6flKT5JaSYQzJok04JzTL1CA6aGhv5rfLW3PgqA+M2ChpZQnAC8h8i4ZFkBS8X5RqkDBHA7r4hej3K9A==",
			"dev": true,
			"funding": [
				{
					"type": "github",
					"url": "https://github.com/sponsors/feross"
				},
				{
					"type": "patreon",
					"url": "https://www.patreon.com/feross"
				},
				{
					"type": "consulting",
					"url": "https://feross.org/support"
				}
			],
			"license": "MIT"
		},
		"node_modules/react-is": {
			"version": "18.3.1",
			"resolved": "https://registry.npmjs.org/react-is/-/react-is-18.3.1.tgz",
			"integrity": "sha512-/LLMVyas0ljjAtoYiPqYiL8VWXzUUdThrmU5+n20DZv+a+ClRoevUzw5JxU+Ieh5/c87ytoTBV9G1FiKfNJdmg==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/reflect.getprototypeof": {
			"version": "1.0.10",
			"resolved": "https://registry.npmjs.org/reflect.getprototypeof/-/reflect.getprototypeof-1.0.10.tgz",
			"integrity": "sha512-00o4I+DVrefhv+nX0ulyi3biSHCPDe+yLv5o/p6d/UVlirijB8E16FtfwSAi4g3tcqrQ4lRAqQSoFEZJehYEcw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bind": "^1.0.8",
				"define-properties": "^1.2.1",
				"es-abstract": "^1.23.9",
				"es-errors": "^1.3.0",
				"es-object-atoms": "^1.0.0",
				"get-intrinsic": "^1.2.7",
				"get-proto": "^1.0.1",
				"which-builtin-type": "^1.2.1"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/regexp-tree": {
			"version": "0.1.27",
			"resolved": "https://registry.npmjs.org/regexp-tree/-/regexp-tree-0.1.27.tgz",
			"integrity": "sha512-iETxpjK6YoRWJG5o6hXLwvjYAoW+FEZn9os0PD/b6AP6xQwsa/Y7lCVgIixBbUPMfhu+i2LtdeAqVTgGlQarfA==",
			"dev": true,
			"license": "MIT",
			"bin": {
				"regexp-tree": "bin/regexp-tree"
			}
		},
		"node_modules/regexp.prototype.flags": {
			"version": "1.5.4",
			"resolved": "https://registry.npmjs.org/regexp.prototype.flags/-/regexp.prototype.flags-1.5.4.tgz",
			"integrity": "sha512-dYqgNSZbDwkaJ2ceRd9ojCGjBq+mOm9LmtXnAnEGyHhN/5R7iDW2TRw3h+o/jCFxus3P2LfWIIiwowAjANm7IA==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bind": "^1.0.8",
				"define-properties": "^1.2.1",
				"es-errors": "^1.3.0",
				"get-proto": "^1.0.1",
				"gopd": "^1.2.0",
				"set-function-name": "^2.0.2"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/require-from-string": {
			"version": "2.0.2",
			"resolved": "https://registry.npmjs.org/require-from-string/-/require-from-string-2.0.2.tgz",
			"integrity": "sha512-Xf0nWe6RseziFMu+Ap9biiUbmplq6S9/p+7w7YXP/JBHhrUDDUhwa+vANyubuqfZWTveU//DYVGsDG7RKL/vEw==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">=0.10.0"
			}
		},
		"node_modules/resolve": {
			"version": "2.0.0-next.7",
			"resolved": "https://registry.npmjs.org/resolve/-/resolve-2.0.0-next.7.tgz",
			"integrity": "sha512-tqt+NBWwyaMgw3zDsnygx4CByWjQEJHOPMdslYhppaQSJUtL/D4JO9CcBBlhPoI8lz9oJIDXkwXfhF4aWqP8xQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"es-errors": "^1.3.0",
				"is-core-module": "^2.16.2",
				"node-exports-info": "^1.6.0",
				"object-keys": "^1.1.1",
				"path-parse": "^1.0.7",
				"supports-preserve-symlinks-flag": "^1.0.0"
			},
			"bin": {
				"resolve": "bin/resolve"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/resolve-from": {
			"version": "4.0.0",
			"resolved": "https://registry.npmjs.org/resolve-from/-/resolve-from-4.0.0.tgz",
			"integrity": "sha512-pb/MYmXstAkysRFx8piNI1tGFNQIFA3vkE3Gq4EuA1dF6gHp/+vgZqsCGJapvy8N3Q+4o7FwvquPJcnZ7RYy4g==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">=4"
			}
		},
		"node_modules/resolve-pkg-maps": {
			"version": "1.0.0",
			"resolved": "https://registry.npmjs.org/resolve-pkg-maps/-/resolve-pkg-maps-1.0.0.tgz",
			"integrity": "sha512-seS2Tj26TBVOC2NIc2rOe2y2ZO7efxITtLZcGSOnHHNOQ7CkiUBfw0Iw2ck6xkIhPwLhKNLS8BO+hEpngQlqzw==",
			"dev": true,
			"license": "MIT",
			"funding": {
				"url": "https://github.com/privatenumber/resolve-pkg-maps?sponsor=1"
			}
		},
		"node_modules/ret": {
			"version": "0.1.15",
			"resolved": "https://registry.npmjs.org/ret/-/ret-0.1.15.tgz",
			"integrity": "sha512-TTlYpa+OL+vMMNG24xSlQGEJ3B/RzEfUlLct7b5G/ytav+wPrplCpVMFuwzXbkecJrb6IYo1iFb0S9v37754mg==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">=0.12"
			}
		},
		"node_modules/reusify": {
			"version": "1.1.0",
			"resolved": "https://registry.npmjs.org/reusify/-/reusify-1.1.0.tgz",
			"integrity": "sha512-g6QUff04oZpHs0eG5p83rFLhHeV00ug/Yf9nZM6fLeUrPguBTkTQOdpAWWspMh55TZfVQDPaN3NQJfbVRAxdIw==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"iojs": ">=1.0.0",
				"node": ">=0.10.0"
			}
		},
		"node_modules/rimraf": {
			"version": "3.0.2",
			"resolved": "https://registry.npmjs.org/rimraf/-/rimraf-3.0.2.tgz",
			"integrity": "sha512-JZkJMZkAGFFPP2YqXZXPbMlMBgsxzE8ILs4lMIX/2o0L9UBw9O/Y3o6wFw/i9YLapcUJWwqbi3kdxIPdC62TIA==",
			"deprecated": "Rimraf versions prior to v4 are no longer supported",
			"dev": true,
			"license": "ISC",
			"dependencies": {
				"glob": "^7.1.3"
			},
			"bin": {
				"rimraf": "bin.js"
			},
			"funding": {
				"url": "https://github.com/sponsors/isaacs"
			}
		},
		"node_modules/rollup": {
			"version": "4.62.5",
			"resolved": "https://registry.npmjs.org/rollup/-/rollup-4.62.5.tgz",
			"integrity": "sha512-/tqMfgP7GPA3PHhCmuiS4vIjrSVhHLgY++i+dhbG462euyAj7FpM4D9uq1X3BgjlqRdpcOrYhcQtfiQLNc8tqw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"@types/estree": "1.0.9"
			},
			"bin": {
				"rollup": "dist/bin/rollup"
			},
			"engines": {
				"node": ">=18.0.0",
				"npm": ">=8.0.0"
			},
			"optionalDependencies": {
				"@napi-rs/lzma-linux-x64-gnu": "1.5.1",
				"@rollup/rollup-android-arm-eabi": "4.62.5",
				"@rollup/rollup-android-arm64": "4.62.5",
				"@rollup/rollup-darwin-arm64": "4.62.5",
				"@rollup/rollup-darwin-x64": "4.62.5",
				"@rollup/rollup-freebsd-arm64": "4.62.5",
				"@rollup/rollup-freebsd-x64": "4.62.5",
				"@rollup/rollup-linux-arm-gnueabihf": "4.62.5",
				"@rollup/rollup-linux-arm-musleabihf": "4.62.5",
				"@rollup/rollup-linux-arm64-gnu": "4.62.5",
				"@rollup/rollup-linux-arm64-musl": "4.62.5",
				"@rollup/rollup-linux-loong64-gnu": "4.62.5",
				"@rollup/rollup-linux-loong64-musl": "4.62.5",
				"@rollup/rollup-linux-ppc64-gnu": "4.62.5",
				"@rollup/rollup-linux-ppc64-musl": "4.62.5",
				"@rollup/rollup-linux-riscv64-gnu": "4.62.5",
				"@rollup/rollup-linux-riscv64-musl": "4.62.5",
				"@rollup/rollup-linux-s390x-gnu": "4.62.5",
				"@rollup/rollup-linux-x64-gnu": "4.62.5",
				"@rollup/rollup-linux-x64-musl": "4.62.5",
				"@rollup/rollup-openbsd-x64": "4.62.5",
				"@rollup/rollup-openharmony-arm64": "4.62.5",
				"@rollup/rollup-win32-arm64-msvc": "4.62.5",
				"@rollup/rollup-win32-ia32-msvc": "4.62.5",
				"@rollup/rollup-win32-x64-gnu": "4.62.5",
				"@rollup/rollup-win32-x64-msvc": "4.62.5",
				"fsevents": "~2.3.2"
			}
		},
		"node_modules/run-parallel": {
			"version": "1.2.0",
			"resolved": "https://registry.npmjs.org/run-parallel/-/run-parallel-1.2.0.tgz",
			"integrity": "sha512-5l4VyZR86LZ/lDxZTR6jqL8AFE2S0IFLMP26AbjsLVADxHdhB/c0GUsH+y39UfCi3dzz8OlQuPmnaJOMoDHQBA==",
			"dev": true,
			"funding": [
				{
					"type": "github",
					"url": "https://github.com/sponsors/feross"
				},
				{
					"type": "patreon",
					"url": "https://www.patreon.com/feross"
				},
				{
					"type": "consulting",
					"url": "https://feross.org/support"
				}
			],
			"license": "MIT",
			"dependencies": {
				"queue-microtask": "^1.2.2"
			}
		},
		"node_modules/safe-array-concat": {
			"version": "1.1.4",
			"resolved": "https://registry.npmjs.org/safe-array-concat/-/safe-array-concat-1.1.4.tgz",
			"integrity": "sha512-wtZlHyOje6OZTGqAoaDKxFkgRtkF9CnHAVnCHKfuj200wAgL+bSJhdsCD2l0Qx/2ekEXjPWcyKkfGb5CPboslg==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bind": "^1.0.9",
				"call-bound": "^1.0.4",
				"get-intrinsic": "^1.3.0",
				"has-symbols": "^1.1.0",
				"isarray": "^2.0.5"
			},
			"engines": {
				"node": ">=0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/safe-buffer": {
			"version": "5.2.1",
			"resolved": "https://registry.npmjs.org/safe-buffer/-/safe-buffer-5.2.1.tgz",
			"integrity": "sha512-rp3So07KcdmmKbGvgaNxQSJr7bGVSVk5S9Eq1F+ppbRo70+YeaDxkw5Dd8NPN+GD6bjnYm2VuPuCXmpuYvmCXQ==",
			"dev": true,
			"funding": [
				{
					"type": "github",
					"url": "https://github.com/sponsors/feross"
				},
				{
					"type": "patreon",
					"url": "https://www.patreon.com/feross"
				},
				{
					"type": "consulting",
					"url": "https://feross.org/support"
				}
			],
			"license": "MIT"
		},
		"node_modules/safe-push-apply": {
			"version": "1.0.0",
			"resolved": "https://registry.npmjs.org/safe-push-apply/-/safe-push-apply-1.0.0.tgz",
			"integrity": "sha512-iKE9w/Z7xCzUMIZqdBsp6pEQvwuEebH4vdpjcDWnyzaI6yl6O9FHvVpmGelvEHNsoY6wGblkxR6Zty/h00WiSA==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"es-errors": "^1.3.0",
				"isarray": "^2.0.5"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/safe-regex": {
			"version": "2.1.1",
			"resolved": "https://registry.npmjs.org/safe-regex/-/safe-regex-2.1.1.tgz",
			"integrity": "sha512-rx+x8AMzKb5Q5lQ95Zoi6ZbJqwCLkqi3XuJXp5P3rT8OEc6sZCJG5AE5dU3lsgRr/F4Bs31jSlVN+j5KrsGu9A==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"regexp-tree": "~0.1.1"
			}
		},
		"node_modules/safe-regex-test": {
			"version": "1.1.0",
			"resolved": "https://registry.npmjs.org/safe-regex-test/-/safe-regex-test-1.1.0.tgz",
			"integrity": "sha512-x/+Cz4YrimQxQccJf5mKEbIa1NzeCRNI5Ecl/ekmlYaampdNLPalVyIcCZNNH3MvmqBugV5TMYZXv0ljslUlaw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bound": "^1.0.2",
				"es-errors": "^1.3.0",
				"is-regex": "^1.2.1"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/semver": {
			"version": "7.8.5",
			"resolved": "https://registry.npmjs.org/semver/-/semver-7.8.5.tgz",
			"integrity": "sha512-Y7/KDsb8LjooZpwaqGyulO6DQlksgCncchHGk+sZIY4SBvUocMBEFH5Ur1fI4dV+Jvl0w6cjvucaIi40puRioA==",
			"dev": true,
			"license": "ISC",
			"bin": {
				"semver": "bin/semver.js"
			},
			"engines": {
				"node": ">=10"
			}
		},
		"node_modules/set-function-length": {
			"version": "1.2.2",
			"resolved": "https://registry.npmjs.org/set-function-length/-/set-function-length-1.2.2.tgz",
			"integrity": "sha512-pgRc4hJ4/sNjWCSS9AmnS40x3bNMDTknHgL5UaMBTMyJnU90EgWh1Rz+MC9eFu4BuN/UwZjKQuY/1v3rM7HMfg==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"define-data-property": "^1.1.4",
				"es-errors": "^1.3.0",
				"function-bind": "^1.1.2",
				"get-intrinsic": "^1.2.4",
				"gopd": "^1.0.1",
				"has-property-descriptors": "^1.0.2"
			},
			"engines": {
				"node": ">= 0.4"
			}
		},
		"node_modules/set-function-name": {
			"version": "2.0.2",
			"resolved": "https://registry.npmjs.org/set-function-name/-/set-function-name-2.0.2.tgz",
			"integrity": "sha512-7PGFlmtwsEADb0WYyvCMa1t+yke6daIG4Wirafur5kcf+MhUnPms1UeR0CKQdTZD81yESwMHbtn+TR+dMviakQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"define-data-property": "^1.1.4",
				"es-errors": "^1.3.0",
				"functions-have-names": "^1.2.3",
				"has-property-descriptors": "^1.0.2"
			},
			"engines": {
				"node": ">= 0.4"
			}
		},
		"node_modules/set-proto": {
			"version": "1.0.0",
			"resolved": "https://registry.npmjs.org/set-proto/-/set-proto-1.0.0.tgz",
			"integrity": "sha512-RJRdvCo6IAnPdsvP/7m6bsQqNnn1FCBX5ZNtFL98MmFF/4xAIJTIg1YbHW5DC2W5SKZanrC6i4HsJqlajw/dZw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"dunder-proto": "^1.0.1",
				"es-errors": "^1.3.0",
				"es-object-atoms": "^1.0.0"
			},
			"engines": {
				"node": ">= 0.4"
			}
		},
		"node_modules/shebang-command": {
			"version": "2.0.0",
			"resolved": "https://registry.npmjs.org/shebang-command/-/shebang-command-2.0.0.tgz",
			"integrity": "sha512-kHxr2zZpYtdmrN1qDjrrX/Z1rR1kG8Dx+gkpK1G4eXmvXswmcE1hTWBWYUzlraYw1/yZp6YuDY77YtvbN0dmDA==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"shebang-regex": "^3.0.0"
			},
			"engines": {
				"node": ">=8"
			}
		},
		"node_modules/shebang-regex": {
			"version": "3.0.0",
			"resolved": "https://registry.npmjs.org/shebang-regex/-/shebang-regex-3.0.0.tgz",
			"integrity": "sha512-7++dFhtcx3353uBaq8DDR4NuxBetBzC7ZQOhmTQInHEd6bSrXdiEyzCvG07Z44UYdLShWUyXt5M/yhz8ekcb1A==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">=8"
			}
		},
		"node_modules/side-channel": {
			"version": "1.1.1",
			"resolved": "https://registry.npmjs.org/side-channel/-/side-channel-1.1.1.tgz",
			"integrity": "sha512-6x6dK6zJdpTzF4sQeNYxwtvBzf6Eg4GtlesS94HOvTudUeyK2WXAaIfmDgsyslYrRBeFIlsi54AYsFGUuhmvrQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"es-errors": "^1.3.0",
				"object-inspect": "^1.13.4",
				"side-channel-list": "^1.0.1",
				"side-channel-map": "^1.0.1",
				"side-channel-weakmap": "^1.0.2"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/side-channel-list": {
			"version": "1.0.1",
			"resolved": "https://registry.npmjs.org/side-channel-list/-/side-channel-list-1.0.1.tgz",
			"integrity": "sha512-mjn/0bi/oUURjc5Xl7IaWi/OJJJumuoJFQJfDDyO46+hBWsfaVM65TBHq2eoZBhzl9EchxOijpkbRC8SVBQU0w==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"es-errors": "^1.3.0",
				"object-inspect": "^1.13.4"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/side-channel-map": {
			"version": "1.0.1",
			"resolved": "https://registry.npmjs.org/side-channel-map/-/side-channel-map-1.0.1.tgz",
			"integrity": "sha512-VCjCNfgMsby3tTdo02nbjtM/ewra6jPHmpThenkTYh8pG9ucZ/1P8So4u4FGBek/BjpOVsDCMoLA/iuBKIFXRA==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bound": "^1.0.2",
				"es-errors": "^1.3.0",
				"get-intrinsic": "^1.2.5",
				"object-inspect": "^1.13.3"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/side-channel-weakmap": {
			"version": "1.0.2",
			"resolved": "https://registry.npmjs.org/side-channel-weakmap/-/side-channel-weakmap-1.0.2.tgz",
			"integrity": "sha512-WPS/HvHQTYnHisLo9McqBHOJk2FkHO/tlpvldyrnem4aeQp4hai3gythswg6p01oSoTl58rcpiFAjF2br2Ak2A==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bound": "^1.0.2",
				"es-errors": "^1.3.0",
				"get-intrinsic": "^1.2.5",
				"object-inspect": "^1.13.3",
				"side-channel-map": "^1.0.1"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/siginfo": {
			"version": "2.0.0",
			"resolved": "https://registry.npmjs.org/siginfo/-/siginfo-2.0.0.tgz",
			"integrity": "sha512-ybx0WO1/8bSBLEWXZvEd7gMW3Sn3JFlW3TvX1nREbDLRNQNaeNN8WK0meBwPdAaOI7TtRRRJn/Es1zhrrCHu7g==",
			"dev": true,
			"license": "ISC"
		},
		"node_modules/signal-exit": {
			"version": "4.1.0",
			"resolved": "https://registry.npmjs.org/signal-exit/-/signal-exit-4.1.0.tgz",
			"integrity": "sha512-bzyZ1e88w9O1iNJbKnOlvYTrWPDl46O1bG0D3XInv+9tkPrxrN8jUUTiFlDkkmKWgn1M6CfIA13SuGqOa9Korw==",
			"dev": true,
			"license": "ISC",
			"engines": {
				"node": ">=14"
			},
			"funding": {
				"url": "https://github.com/sponsors/isaacs"
			}
		},
		"node_modules/source-map-js": {
			"version": "1.2.1",
			"resolved": "https://registry.npmjs.org/source-map-js/-/source-map-js-1.2.1.tgz",
			"integrity": "sha512-UXWMKhLOwVKb728IUtQPXxfYU+usdybtUrK/8uGE8CQMvrhOpwvzDBwj0QhSL7MQc7vIsISBG8VQ8+IDQxpfQA==",
			"dev": true,
			"license": "BSD-3-Clause",
			"engines": {
				"node": ">=0.10.0"
			}
		},
		"node_modules/stackback": {
			"version": "0.0.2",
			"resolved": "https://registry.npmjs.org/stackback/-/stackback-0.0.2.tgz",
			"integrity": "sha512-1XMJE5fQo1jGH6Y/7ebnwPOBEkIEnT4QF32d5R1+VXdXveM0IBMJt8zfaxX1P3QhVwrYe+576+jkANtSS2mBbw==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/std-env": {
			"version": "3.10.0",
			"resolved": "https://registry.npmjs.org/std-env/-/std-env-3.10.0.tgz",
			"integrity": "sha512-5GS12FdOZNliM5mAOxFRg7Ir0pWz8MdpYm6AY6VPkGpbA7ZzmbzNcBJQ0GPvvyWgcY7QAhCgf9Uy89I03faLkg==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/stop-iteration-iterator": {
			"version": "1.1.0",
			"resolved": "https://registry.npmjs.org/stop-iteration-iterator/-/stop-iteration-iterator-1.1.0.tgz",
			"integrity": "sha512-eLoXW/DHyl62zxY4SCaIgnRhuMr6ri4juEYARS8E6sCEqzKpOiE521Ucofdx+KnDZl5xmvGYaaKCk5FEOxJCoQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"es-errors": "^1.3.0",
				"internal-slot": "^1.1.0"
			},
			"engines": {
				"node": ">= 0.4"
			}
		},
		"node_modules/string.prototype.matchall": {
			"version": "4.1.0",
			"resolved": "https://registry.npmjs.org/string.prototype.matchall/-/string.prototype.matchall-4.1.0.tgz",
			"integrity": "sha512-tHNHTxInrYLCga9O9YGxWA3G9/nnzQw8UGAyqGx3Ar1pSTTzIuM4woFSq4SowkXCjJIwq5sIiQvEfRI9tCH1qQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bind": "^1.0.9",
				"call-bound": "^1.0.4",
				"define-properties": "^1.2.1",
				"es-abstract": "^1.24.2",
				"es-errors": "^1.3.0",
				"es-object-atoms": "^1.1.2",
				"get-intrinsic": "^1.3.0",
				"gopd": "^1.2.0",
				"has-symbols": "^1.1.0",
				"internal-slot": "^1.1.0",
				"regexp.prototype.flags": "^1.5.4",
				"set-function-name": "^2.0.2",
				"side-channel": "^1.1.1"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/string.prototype.repeat": {
			"version": "1.0.0",
			"resolved": "https://registry.npmjs.org/string.prototype.repeat/-/string.prototype.repeat-1.0.0.tgz",
			"integrity": "sha512-0u/TldDbKD8bFCQ/4f5+mNRrXwZ8hg2w7ZR8wa16e8z9XpePWl3eGEcUD0OXpEH/VJH/2G3gjUtR3ZOiBe2S/w==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"define-properties": "^1.1.3",
				"es-abstract": "^1.17.5"
			}
		},
		"node_modules/string.prototype.trim": {
			"version": "1.2.11",
			"resolved": "https://registry.npmjs.org/string.prototype.trim/-/string.prototype.trim-1.2.11.tgz",
			"integrity": "sha512-PwvK7BU+CMTJGYQCTZb5RWXIML92lftJLhQz1tBzgKiqGxJaMlBAa48POXaNAC2s4y8jr3EFqrkF9+44neS46w==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bind": "^1.0.9",
				"call-bound": "^1.0.4",
				"define-data-property": "^1.1.4",
				"define-properties": "^1.2.1",
				"es-abstract": "^1.24.2",
				"es-object-atoms": "^1.1.2",
				"has-property-descriptors": "^1.0.2",
				"safe-regex-test": "^1.1.0"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/string.prototype.trimend": {
			"version": "1.0.10",
			"resolved": "https://registry.npmjs.org/string.prototype.trimend/-/string.prototype.trimend-1.0.10.tgz",
			"integrity": "sha512-2+3aDAOmPTmuFwjDnmJG2ctEkQKVki7vOSqaxkv42Mowj1V6PnvuwFCRrR5lChUux1TBskPjfkeTOhqczDMxTw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bind": "^1.0.9",
				"call-bound": "^1.0.4",
				"define-properties": "^1.2.1",
				"es-object-atoms": "^1.1.2"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/string.prototype.trimstart": {
			"version": "1.0.8",
			"resolved": "https://registry.npmjs.org/string.prototype.trimstart/-/string.prototype.trimstart-1.0.8.tgz",
			"integrity": "sha512-UXSH262CSZY1tfu3G3Secr6uGLCFVPMhIqHjlgCUtCCcgihYc/xKs9djMTMUOb2j1mVSeU8EU6NWc/iQKU6Gfg==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bind": "^1.0.7",
				"define-properties": "^1.2.1",
				"es-object-atoms": "^1.0.0"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/strip-ansi": {
			"version": "6.0.1",
			"resolved": "https://registry.npmjs.org/strip-ansi/-/strip-ansi-6.0.1.tgz",
			"integrity": "sha512-Y38VPSHcqkFrCpFnQ9vuSXmquuv5oXOKpGeT6aGrr3o3Gc9AlVa6JBfUSOCnbxGGZF+/0ooI7KrPuUSztUdU5A==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"ansi-regex": "^5.0.1"
			},
			"engines": {
				"node": ">=8"
			}
		},
		"node_modules/strip-bom": {
			"version": "3.0.0",
			"resolved": "https://registry.npmjs.org/strip-bom/-/strip-bom-3.0.0.tgz",
			"integrity": "sha512-vavAMRXOgBVNF6nyEEmL3DBK19iRpDcoIwW+swQ+CbGiu7lju6t+JklA1MHweoWtadgt4ISVUsXLyDq34ddcwA==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">=4"
			}
		},
		"node_modules/strip-final-newline": {
			"version": "3.0.0",
			"resolved": "https://registry.npmjs.org/strip-final-newline/-/strip-final-newline-3.0.0.tgz",
			"integrity": "sha512-dOESqjYr96iWYylGObzd39EuNTa5VJxyvVAEm5Jnh7KGo75V43Hk1odPQkNDyXNmUR6k+gEiDVXnjB8HJ3crXw==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">=12"
			},
			"funding": {
				"url": "https://github.com/sponsors/sindresorhus"
			}
		},
		"node_modules/strip-json-comments": {
			"version": "3.1.1",
			"resolved": "https://registry.npmjs.org/strip-json-comments/-/strip-json-comments-3.1.1.tgz",
			"integrity": "sha512-6fPc+R4ihwqP6N/aIv2f1gMH8lOVtWQHoqC4yK6oSDVVocumAsfCqjkXnqiYMhmMwS/mEHLp7Vehlt3ql6lEig==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">=8"
			},
			"funding": {
				"url": "https://github.com/sponsors/sindresorhus"
			}
		},
		"node_modules/strip-literal": {
			"version": "2.1.1",
			"resolved": "https://registry.npmjs.org/strip-literal/-/strip-literal-2.1.1.tgz",
			"integrity": "sha512-631UJ6O00eNGfMiWG78ck80dfBab8X6IVFB51jZK5Icd7XAs60Z5y7QdSd/wGIklnWvRbUNloVzhOKKmutxQ6Q==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"js-tokens": "^9.0.1"
			},
			"funding": {
				"url": "https://github.com/sponsors/antfu"
			}
		},
		"node_modules/style-mod": {
			"version": "4.1.3",
			"resolved": "https://registry.npmjs.org/style-mod/-/style-mod-4.1.3.tgz",
			"integrity": "sha512-i/n8VsZydrugj3Iuzll8+x/00GH2vnYsk1eomD8QiRrSAeW6ItbCQDtfXCeJHd0iwiNagqjQkvpvREEPtW3IoQ==",
			"dev": true,
			"license": "MIT",
			"peer": true
		},
		"node_modules/supports-color": {
			"version": "7.2.0",
			"resolved": "https://registry.npmjs.org/supports-color/-/supports-color-7.2.0.tgz",
			"integrity": "sha512-qpCAvRl9stuOHveKsn7HncJRvv501qIacKzQlO/+Lwxc9+0q2wLyv4Dfvt80/DPn2pqOBsJdDiogXGR9+OvwRw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"has-flag": "^4.0.0"
			},
			"engines": {
				"node": ">=8"
			}
		},
		"node_modules/supports-preserve-symlinks-flag": {
			"version": "1.0.0",
			"resolved": "https://registry.npmjs.org/supports-preserve-symlinks-flag/-/supports-preserve-symlinks-flag-1.0.0.tgz",
			"integrity": "sha512-ot0WnXS9fgdkgIcePe6RHNk1WA8+muPa6cSjeR3V8K27q9BB1rTE3R1p7Hv0z1ZyAc8s6Vvv8DIyWf681MAt0w==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/synckit": {
			"version": "0.9.3",
			"resolved": "https://registry.npmjs.org/synckit/-/synckit-0.9.3.tgz",
			"integrity": "sha512-JJoOEKTfL1urb1mDoEblhD9NhEbWmq9jHEMEnxoC4ujUaZ4itA8vKgwkFAyNClgxplLi9tsUKX+EduK0p/l7sg==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"@pkgr/core": "^0.1.0",
				"tslib": "^2.6.2"
			},
			"engines": {
				"node": "^14.18.0 || >=16.0.0"
			},
			"funding": {
				"url": "https://opencollective.com/unts"
			}
		},
		"node_modules/tapable": {
			"version": "2.3.3",
			"resolved": "https://registry.npmjs.org/tapable/-/tapable-2.3.3.tgz",
			"integrity": "sha512-uxc/zpqFg6x7C8vOE7lh6Lbda8eEL9zmVm/PLeTPBRhh1xCgdWaQ+J1CUieGpIfm2HdtsUpRv+HshiasBMcc6A==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">=6"
			},
			"funding": {
				"type": "opencollective",
				"url": "https://opencollective.com/webpack"
			}
		},
		"node_modules/text-table": {
			"version": "0.2.0",
			"resolved": "https://registry.npmjs.org/text-table/-/text-table-0.2.0.tgz",
			"integrity": "sha512-N+8UisAXDGk8PFXP4HAzVR9nbfmVJ3zYLAWiTIoqC5v5isinhr+r5uaO8+7r3BMfuNIufIsA7RdpVgacC2cSpw==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/tinybench": {
			"version": "2.9.0",
			"resolved": "https://registry.npmjs.org/tinybench/-/tinybench-2.9.0.tgz",
			"integrity": "sha512-0+DUvqWMValLmha6lr4kD8iAMK1HzV0/aKnCtWb9v9641TnP/MFb7Pc2bxoxQjTXAErryXVgUOfv2YqNllqGeg==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/tinyglobby": {
			"version": "0.2.17",
			"resolved": "https://registry.npmjs.org/tinyglobby/-/tinyglobby-0.2.17.tgz",
			"integrity": "sha512-wXR/dYpcqKmfWpEdZjiKJOwCNFndD0DMnrW/cYjVGttEkBfVgcLFHoNrlj47mjOVic9yyNu65alsgF4NQyTa2g==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"fdir": "^6.5.0",
				"picomatch": "^4.0.4"
			},
			"engines": {
				"node": ">=12.0.0"
			},
			"funding": {
				"url": "https://github.com/sponsors/SuperchupuDev"
			}
		},
		"node_modules/tinypool": {
			"version": "0.8.4",
			"resolved": "https://registry.npmjs.org/tinypool/-/tinypool-0.8.4.tgz",
			"integrity": "sha512-i11VH5gS6IFeLY3gMBQ00/MmLncVP7JLXOw1vlgkytLmJK7QnEr7NXf0LBdxfmNPAeyetukOk0bOYrJrFGjYJQ==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">=14.0.0"
			}
		},
		"node_modules/tinyspy": {
			"version": "2.2.1",
			"resolved": "https://registry.npmjs.org/tinyspy/-/tinyspy-2.2.1.tgz",
			"integrity": "sha512-KYad6Vy5VDWV4GH3fjpseMQ/XU2BhIYP7Vzd0LG44qRWm/Yt2WCOTicFdvmgo6gWaqooMQCawTtILVQJupKu7A==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">=14.0.0"
			}
		},
		"node_modules/toml-eslint-parser": {
			"version": "0.9.3",
			"resolved": "https://registry.npmjs.org/toml-eslint-parser/-/toml-eslint-parser-0.9.3.tgz",
			"integrity": "sha512-moYoCvkNUAPCxSW9jmHmRElhm4tVJpHL8ItC/+uYD0EpPSFXbck7yREz9tNdJVTSpHVod8+HoipcpbQ0oE6gsw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"eslint-visitor-keys": "^3.0.0"
			},
			"engines": {
				"node": "^12.22.0 || ^14.17.0 || >=16.0.0"
			},
			"funding": {
				"url": "https://github.com/sponsors/ota-meshi"
			}
		},
		"node_modules/ts-api-utils": {
			"version": "2.5.0",
			"resolved": "https://registry.npmjs.org/ts-api-utils/-/ts-api-utils-2.5.0.tgz",
			"integrity": "sha512-OJ/ibxhPlqrMM0UiNHJ/0CKQkoKF243/AEmplt3qpRgkW8VG7IfOS41h7V8TjITqdByHzrjcS/2si+y4lIh8NA==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">=18.12"
			},
			"peerDependencies": {
				"typescript": ">=4.8.4"
			}
		},
		"node_modules/tsconfig-paths": {
			"version": "3.15.0",
			"resolved": "https://registry.npmjs.org/tsconfig-paths/-/tsconfig-paths-3.15.0.tgz",
			"integrity": "sha512-2Ac2RgzDe/cn48GvOe3M+o82pEFewD3UPbyoUHHdKasHwJKjds4fLXWf/Ux5kATBKN20oaFGu+jbElp1pos0mg==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"@types/json5": "^0.0.29",
				"json5": "^1.0.2",
				"minimist": "^1.2.6",
				"strip-bom": "^3.0.0"
			}
		},
		"node_modules/tslib": {
			"version": "2.8.1",
			"resolved": "https://registry.npmjs.org/tslib/-/tslib-2.8.1.tgz",
			"integrity": "sha512-oJFu94HQb+KVduSUQL7wnpmqnfmLsOA/nAh6b6EH0wCEoK0/mPeXU6c3wKDV83MkOuHPRHtSXKKU99IBazS/2w==",
			"dev": true,
			"license": "0BSD"
		},
		"node_modules/tunnel-agent": {
			"version": "0.6.0",
			"resolved": "https://registry.npmjs.org/tunnel-agent/-/tunnel-agent-0.6.0.tgz",
			"integrity": "sha512-McnNiV1l8RYeY8tBgEpuodCC1mLUdbSN+CYBL7kJsJNInOP8UjDDEwdk6Mw60vdLLrr5NHKZhMAOSrR2NZuQ+w==",
			"dev": true,
			"license": "Apache-2.0",
			"dependencies": {
				"safe-buffer": "^5.0.1"
			},
			"engines": {
				"node": "*"
			}
		},
		"node_modules/type-check": {
			"version": "0.4.0",
			"resolved": "https://registry.npmjs.org/type-check/-/type-check-0.4.0.tgz",
			"integrity": "sha512-XleUoc9uwGXqjWwXaUTZAmzMcFZ5858QA2vvx1Ur5xIcixXIP+8LnFDgRplU30us6teqdlskFfu+ae4K79Ooew==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"prelude-ls": "^1.2.1"
			},
			"engines": {
				"node": ">= 0.8.0"
			}
		},
		"node_modules/type-detect": {
			"version": "4.1.0",
			"resolved": "https://registry.npmjs.org/type-detect/-/type-detect-4.1.0.tgz",
			"integrity": "sha512-Acylog8/luQ8L7il+geoSxhEkazvkslg7PSNKOX59mbB9cOveP5aq9h74Y7YU8yDpJwetzQQrfIwtf4Wp4LKcw==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">=4"
			}
		},
		"node_modules/type-fest": {
			"version": "0.20.2",
			"resolved": "https://registry.npmjs.org/type-fest/-/type-fest-0.20.2.tgz",
			"integrity": "sha512-Ne+eE4r0/iWnpAxD852z3A+N0Bt5RN//NjJwRd2VFHEmrywxf5vsZlh4R6lixl6B+wz/8d+maTSAkN1FIkI3LQ==",
			"dev": true,
			"license": "(MIT OR CC0-1.0)",
			"engines": {
				"node": ">=10"
			},
			"funding": {
				"url": "https://github.com/sponsors/sindresorhus"
			}
		},
		"node_modules/typed-array-buffer": {
			"version": "1.0.3",
			"resolved": "https://registry.npmjs.org/typed-array-buffer/-/typed-array-buffer-1.0.3.tgz",
			"integrity": "sha512-nAYYwfY3qnzX30IkA6AQZjVbtK6duGontcQm1WSG1MD94YLqK0515GNApXkoxKOWMusVssAHWLh9SeaoefYFGw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bound": "^1.0.3",
				"es-errors": "^1.3.0",
				"is-typed-array": "^1.1.14"
			},
			"engines": {
				"node": ">= 0.4"
			}
		},
		"node_modules/typed-array-byte-length": {
			"version": "1.0.3",
			"resolved": "https://registry.npmjs.org/typed-array-byte-length/-/typed-array-byte-length-1.0.3.tgz",
			"integrity": "sha512-BaXgOuIxz8n8pIq3e7Atg/7s+DpiYrxn4vdot3w9KbnBhcRQq6o3xemQdIfynqSeXeDrF32x+WvfzmOjPiY9lg==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bind": "^1.0.8",
				"for-each": "^0.3.3",
				"gopd": "^1.2.0",
				"has-proto": "^1.2.0",
				"is-typed-array": "^1.1.14"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/typed-array-byte-offset": {
			"version": "1.0.4",
			"resolved": "https://registry.npmjs.org/typed-array-byte-offset/-/typed-array-byte-offset-1.0.4.tgz",
			"integrity": "sha512-bTlAFB/FBYMcuX81gbL4OcpH5PmlFHqlCCpAl8AlEzMz5k53oNDvN8p1PNOWLEmI2x4orp3raOFB51tv9X+MFQ==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"available-typed-arrays": "^1.0.7",
				"call-bind": "^1.0.8",
				"for-each": "^0.3.3",
				"gopd": "^1.2.0",
				"has-proto": "^1.2.0",
				"is-typed-array": "^1.1.15",
				"reflect.getprototypeof": "^1.0.9"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/typed-array-length": {
			"version": "1.0.8",
			"resolved": "https://registry.npmjs.org/typed-array-length/-/typed-array-length-1.0.8.tgz",
			"integrity": "sha512-phPGCwqr2+Qo0fwniCE8e4pKnGu/yFb5nD5Y8bf0EEeiI5GklnACYA9GFy/DrAeRrKHXvHn+1SUsOWgJp6RO+g==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bind": "^1.0.9",
				"for-each": "^0.3.5",
				"gopd": "^1.2.0",
				"is-typed-array": "^1.1.15",
				"possible-typed-array-names": "^1.1.0",
				"reflect.getprototypeof": "^1.0.10"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/typescript": {
			"version": "5.9.3",
			"resolved": "https://registry.npmjs.org/typescript/-/typescript-5.9.3.tgz",
			"integrity": "sha512-jl1vZzPDinLr9eUt3J/t7V6FgNEw9QjvBPdysz9KfQDD41fQrC2Y4vKQdiaUpFT4bXlb1RHhLpp8wtm6M5TgSw==",
			"dev": true,
			"license": "Apache-2.0",
			"bin": {
				"tsc": "bin/tsc",
				"tsserver": "bin/tsserver"
			},
			"engines": {
				"node": ">=14.17"
			}
		},
		"node_modules/typescript-eslint": {
			"version": "8.69.0",
			"resolved": "https://registry.npmjs.org/typescript-eslint/-/typescript-eslint-8.69.0.tgz",
			"integrity": "sha512-B3MltX0VqjUBNEe3b3sSuiRbfa6XrfHFtBiPamjT5AsW/dfq+y+bc0wyuS9DxAS1LyzCxRp2+rxzpLUvqM2BvA==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"@typescript-eslint/eslint-plugin": "8.69.0",
				"@typescript-eslint/parser": "8.69.0",
				"@typescript-eslint/typescript-estree": "8.69.0",
				"@typescript-eslint/utils": "8.69.0"
			},
			"engines": {
				"node": "^18.18.0 || ^20.9.0 || >=21.1.0"
			},
			"funding": {
				"type": "opencollective",
				"url": "https://opencollective.com/typescript-eslint"
			},
			"peerDependencies": {
				"eslint": "^8.57.0 || ^9.0.0 || ^10.0.0",
				"typescript": ">=4.8.4 <6.1.0"
			}
		},
		"node_modules/ufo": {
			"version": "1.6.4",
			"resolved": "https://registry.npmjs.org/ufo/-/ufo-1.6.4.tgz",
			"integrity": "sha512-JFNbkD1Svwe0KvGi8GOeLcP4kAWQ609twvCdcHxq1oSL8svv39ZuSvajcD8B+5D0eL4+s1Is2D/O6KN3qcTeRA==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/unbox-primitive": {
			"version": "1.1.0",
			"resolved": "https://registry.npmjs.org/unbox-primitive/-/unbox-primitive-1.1.0.tgz",
			"integrity": "sha512-nWJ91DjeOkej/TA8pXQ3myruKpKEYgqvpw9lz4OPHj/NWFNluYrjbz9j01CJ8yKQd2g4jFoOkINCTW2I5LEEyw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bound": "^1.0.3",
				"has-bigints": "^1.0.2",
				"has-symbols": "^1.1.0",
				"which-boxed-primitive": "^1.1.1"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/undici-types": {
			"version": "6.21.0",
			"resolved": "https://registry.npmjs.org/undici-types/-/undici-types-6.21.0.tgz",
			"integrity": "sha512-iwDZqg0QAGrg9Rav5H4n0M64c3mkR59cJ6wQp+7C4nI0gsmExaedaYLNO44eT4AtBBwjbTiGPMlt2Md0T9H9JQ==",
			"dev": true,
			"license": "MIT"
		},
		"node_modules/uri-js": {
			"version": "4.4.1",
			"resolved": "https://registry.npmjs.org/uri-js/-/uri-js-4.4.1.tgz",
			"integrity": "sha512-7rKUyy33Q1yc98pQ1DAmLtwX109F7TIfWlW1Ydo8Wl1ii1SeHieeh0HHfPeL2fMXK6z0s8ecKs9frCuLJvndBg==",
			"dev": true,
			"license": "BSD-2-Clause",
			"dependencies": {
				"punycode": "^2.1.0"
			}
		},
		"node_modules/vite": {
			"version": "5.4.21",
			"resolved": "https://registry.npmjs.org/vite/-/vite-5.4.21.tgz",
			"integrity": "sha512-o5a9xKjbtuhY6Bi5S3+HvbRERmouabWbyUcpXXUA1u+GNUKoROi9byOJ8M0nHbHYHkYICiMlqxkg1KkYmm25Sw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"esbuild": "^0.21.3",
				"postcss": "^8.4.43",
				"rollup": "^4.20.0"
			},
			"bin": {
				"vite": "bin/vite.js"
			},
			"engines": {
				"node": "^18.0.0 || >=20.0.0"
			},
			"funding": {
				"url": "https://github.com/vitejs/vite?sponsor=1"
			},
			"optionalDependencies": {
				"fsevents": "~2.3.3"
			},
			"peerDependencies": {
				"@types/node": "^18.0.0 || >=20.0.0",
				"less": "*",
				"lightningcss": "^1.21.0",
				"sass": "*",
				"sass-embedded": "*",
				"stylus": "*",
				"sugarss": "*",
				"terser": "^5.4.0"
			},
			"peerDependenciesMeta": {
				"@types/node": {
					"optional": true
				},
				"less": {
					"optional": true
				},
				"lightningcss": {
					"optional": true
				},
				"sass": {
					"optional": true
				},
				"sass-embedded": {
					"optional": true
				},
				"stylus": {
					"optional": true
				},
				"sugarss": {
					"optional": true
				},
				"terser": {
					"optional": true
				}
			}
		},
		"node_modules/vite-node": {
			"version": "1.6.1",
			"resolved": "https://registry.npmjs.org/vite-node/-/vite-node-1.6.1.tgz",
			"integrity": "sha512-YAXkfvGtuTzwWbDSACdJSg4A4DZiAqckWe90Zapc/sEX3XvHcw1NdurM/6od8J207tSDqNbSsgdCacBgvJKFuA==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"cac": "^6.7.14",
				"debug": "^4.3.4",
				"pathe": "^1.1.1",
				"picocolors": "^1.0.0",
				"vite": "^5.0.0"
			},
			"bin": {
				"vite-node": "vite-node.mjs"
			},
			"engines": {
				"node": "^18.0.0 || >=20.0.0"
			},
			"funding": {
				"url": "https://opencollective.com/vitest"
			}
		},
		"node_modules/vite/node_modules/@esbuild/aix-ppc64": {
			"version": "0.21.5",
			"resolved": "https://registry.npmjs.org/@esbuild/aix-ppc64/-/aix-ppc64-0.21.5.tgz",
			"integrity": "sha512-1SDgH6ZSPTlggy1yI6+Dbkiz8xzpHJEVAlF/AM1tHPLsf5STom9rwtjE4hKAF20FfXXNTFqEYXyJNWh1GiZedQ==",
			"cpu": [
				"ppc64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"aix"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/vite/node_modules/@esbuild/android-arm": {
			"version": "0.21.5",
			"resolved": "https://registry.npmjs.org/@esbuild/android-arm/-/android-arm-0.21.5.tgz",
			"integrity": "sha512-vCPvzSjpPHEi1siZdlvAlsPxXl7WbOVUBBAowWug4rJHb68Ox8KualB+1ocNvT5fjv6wpkX6o/iEpbDrf68zcg==",
			"cpu": [
				"arm"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"android"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/vite/node_modules/@esbuild/android-arm64": {
			"version": "0.21.5",
			"resolved": "https://registry.npmjs.org/@esbuild/android-arm64/-/android-arm64-0.21.5.tgz",
			"integrity": "sha512-c0uX9VAUBQ7dTDCjq+wdyGLowMdtR/GoC2U5IYk/7D1H1JYC0qseD7+11iMP2mRLN9RcCMRcjC4YMclCzGwS/A==",
			"cpu": [
				"arm64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"android"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/vite/node_modules/@esbuild/android-x64": {
			"version": "0.21.5",
			"resolved": "https://registry.npmjs.org/@esbuild/android-x64/-/android-x64-0.21.5.tgz",
			"integrity": "sha512-D7aPRUUNHRBwHxzxRvp856rjUHRFW1SdQATKXH2hqA0kAZb1hKmi02OpYRacl0TxIGz/ZmXWlbZgjwWYaCakTA==",
			"cpu": [
				"x64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"android"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/vite/node_modules/@esbuild/darwin-arm64": {
			"version": "0.21.5",
			"resolved": "https://registry.npmjs.org/@esbuild/darwin-arm64/-/darwin-arm64-0.21.5.tgz",
			"integrity": "sha512-DwqXqZyuk5AiWWf3UfLiRDJ5EDd49zg6O9wclZ7kUMv2WRFr4HKjXp/5t8JZ11QbQfUS6/cRCKGwYhtNAY88kQ==",
			"cpu": [
				"arm64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"darwin"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/vite/node_modules/@esbuild/darwin-x64": {
			"version": "0.21.5",
			"resolved": "https://registry.npmjs.org/@esbuild/darwin-x64/-/darwin-x64-0.21.5.tgz",
			"integrity": "sha512-se/JjF8NlmKVG4kNIuyWMV/22ZaerB+qaSi5MdrXtd6R08kvs2qCN4C09miupktDitvh8jRFflwGFBQcxZRjbw==",
			"cpu": [
				"x64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"darwin"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/vite/node_modules/@esbuild/freebsd-arm64": {
			"version": "0.21.5",
			"resolved": "https://registry.npmjs.org/@esbuild/freebsd-arm64/-/freebsd-arm64-0.21.5.tgz",
			"integrity": "sha512-5JcRxxRDUJLX8JXp/wcBCy3pENnCgBR9bN6JsY4OmhfUtIHe3ZW0mawA7+RDAcMLrMIZaf03NlQiX9DGyB8h4g==",
			"cpu": [
				"arm64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"freebsd"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/vite/node_modules/@esbuild/freebsd-x64": {
			"version": "0.21.5",
			"resolved": "https://registry.npmjs.org/@esbuild/freebsd-x64/-/freebsd-x64-0.21.5.tgz",
			"integrity": "sha512-J95kNBj1zkbMXtHVH29bBriQygMXqoVQOQYA+ISs0/2l3T9/kj42ow2mpqerRBxDJnmkUDCaQT/dfNXWX/ZZCQ==",
			"cpu": [
				"x64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"freebsd"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/vite/node_modules/@esbuild/linux-arm": {
			"version": "0.21.5",
			"resolved": "https://registry.npmjs.org/@esbuild/linux-arm/-/linux-arm-0.21.5.tgz",
			"integrity": "sha512-bPb5AHZtbeNGjCKVZ9UGqGwo8EUu4cLq68E95A53KlxAPRmUyYv2D6F0uUI65XisGOL1hBP5mTronbgo+0bFcA==",
			"cpu": [
				"arm"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"linux"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/vite/node_modules/@esbuild/linux-arm64": {
			"version": "0.21.5",
			"resolved": "https://registry.npmjs.org/@esbuild/linux-arm64/-/linux-arm64-0.21.5.tgz",
			"integrity": "sha512-ibKvmyYzKsBeX8d8I7MH/TMfWDXBF3db4qM6sy+7re0YXya+K1cem3on9XgdT2EQGMu4hQyZhan7TeQ8XkGp4Q==",
			"cpu": [
				"arm64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"linux"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/vite/node_modules/@esbuild/linux-ia32": {
			"version": "0.21.5",
			"resolved": "https://registry.npmjs.org/@esbuild/linux-ia32/-/linux-ia32-0.21.5.tgz",
			"integrity": "sha512-YvjXDqLRqPDl2dvRODYmmhz4rPeVKYvppfGYKSNGdyZkA01046pLWyRKKI3ax8fbJoK5QbxblURkwK/MWY18Tg==",
			"cpu": [
				"ia32"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"linux"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/vite/node_modules/@esbuild/linux-loong64": {
			"version": "0.21.5",
			"resolved": "https://registry.npmjs.org/@esbuild/linux-loong64/-/linux-loong64-0.21.5.tgz",
			"integrity": "sha512-uHf1BmMG8qEvzdrzAqg2SIG/02+4/DHB6a9Kbya0XDvwDEKCoC8ZRWI5JJvNdUjtciBGFQ5PuBlpEOXQj+JQSg==",
			"cpu": [
				"loong64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"linux"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/vite/node_modules/@esbuild/linux-mips64el": {
			"version": "0.21.5",
			"resolved": "https://registry.npmjs.org/@esbuild/linux-mips64el/-/linux-mips64el-0.21.5.tgz",
			"integrity": "sha512-IajOmO+KJK23bj52dFSNCMsz1QP1DqM6cwLUv3W1QwyxkyIWecfafnI555fvSGqEKwjMXVLokcV5ygHW5b3Jbg==",
			"cpu": [
				"mips64el"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"linux"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/vite/node_modules/@esbuild/linux-ppc64": {
			"version": "0.21.5",
			"resolved": "https://registry.npmjs.org/@esbuild/linux-ppc64/-/linux-ppc64-0.21.5.tgz",
			"integrity": "sha512-1hHV/Z4OEfMwpLO8rp7CvlhBDnjsC3CttJXIhBi+5Aj5r+MBvy4egg7wCbe//hSsT+RvDAG7s81tAvpL2XAE4w==",
			"cpu": [
				"ppc64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"linux"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/vite/node_modules/@esbuild/linux-riscv64": {
			"version": "0.21.5",
			"resolved": "https://registry.npmjs.org/@esbuild/linux-riscv64/-/linux-riscv64-0.21.5.tgz",
			"integrity": "sha512-2HdXDMd9GMgTGrPWnJzP2ALSokE/0O5HhTUvWIbD3YdjME8JwvSCnNGBnTThKGEB91OZhzrJ4qIIxk/SBmyDDA==",
			"cpu": [
				"riscv64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"linux"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/vite/node_modules/@esbuild/linux-s390x": {
			"version": "0.21.5",
			"resolved": "https://registry.npmjs.org/@esbuild/linux-s390x/-/linux-s390x-0.21.5.tgz",
			"integrity": "sha512-zus5sxzqBJD3eXxwvjN1yQkRepANgxE9lgOW2qLnmr8ikMTphkjgXu1HR01K4FJg8h1kEEDAqDcZQtbrRnB41A==",
			"cpu": [
				"s390x"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"linux"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/vite/node_modules/@esbuild/linux-x64": {
			"version": "0.21.5",
			"resolved": "https://registry.npmjs.org/@esbuild/linux-x64/-/linux-x64-0.21.5.tgz",
			"integrity": "sha512-1rYdTpyv03iycF1+BhzrzQJCdOuAOtaqHTWJZCWvijKD2N5Xu0TtVC8/+1faWqcP9iBCWOmjmhoH94dH82BxPQ==",
			"cpu": [
				"x64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"linux"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/vite/node_modules/@esbuild/netbsd-x64": {
			"version": "0.21.5",
			"resolved": "https://registry.npmjs.org/@esbuild/netbsd-x64/-/netbsd-x64-0.21.5.tgz",
			"integrity": "sha512-Woi2MXzXjMULccIwMnLciyZH4nCIMpWQAs049KEeMvOcNADVxo0UBIQPfSmxB3CWKedngg7sWZdLvLczpe0tLg==",
			"cpu": [
				"x64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"netbsd"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/vite/node_modules/@esbuild/openbsd-x64": {
			"version": "0.21.5",
			"resolved": "https://registry.npmjs.org/@esbuild/openbsd-x64/-/openbsd-x64-0.21.5.tgz",
			"integrity": "sha512-HLNNw99xsvx12lFBUwoT8EVCsSvRNDVxNpjZ7bPn947b8gJPzeHWyNVhFsaerc0n3TsbOINvRP2byTZ5LKezow==",
			"cpu": [
				"x64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"openbsd"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/vite/node_modules/@esbuild/sunos-x64": {
			"version": "0.21.5",
			"resolved": "https://registry.npmjs.org/@esbuild/sunos-x64/-/sunos-x64-0.21.5.tgz",
			"integrity": "sha512-6+gjmFpfy0BHU5Tpptkuh8+uw3mnrvgs+dSPQXQOv3ekbordwnzTVEb4qnIvQcYXq6gzkyTnoZ9dZG+D4garKg==",
			"cpu": [
				"x64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"sunos"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/vite/node_modules/@esbuild/win32-arm64": {
			"version": "0.21.5",
			"resolved": "https://registry.npmjs.org/@esbuild/win32-arm64/-/win32-arm64-0.21.5.tgz",
			"integrity": "sha512-Z0gOTd75VvXqyq7nsl93zwahcTROgqvuAcYDUr+vOv8uHhNSKROyU961kgtCD1e95IqPKSQKH7tBTslnS3tA8A==",
			"cpu": [
				"arm64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"win32"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/vite/node_modules/@esbuild/win32-ia32": {
			"version": "0.21.5",
			"resolved": "https://registry.npmjs.org/@esbuild/win32-ia32/-/win32-ia32-0.21.5.tgz",
			"integrity": "sha512-SWXFF1CL2RVNMaVs+BBClwtfZSvDgtL//G/smwAc5oVK/UPu2Gu9tIaRgFmYFFKrmg3SyAjSrElf0TiJ1v8fYA==",
			"cpu": [
				"ia32"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"win32"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/vite/node_modules/@esbuild/win32-x64": {
			"version": "0.21.5",
			"resolved": "https://registry.npmjs.org/@esbuild/win32-x64/-/win32-x64-0.21.5.tgz",
			"integrity": "sha512-tQd/1efJuzPC6rCFwEvLtci/xNFcTZknmXs98FYDfGE4wP9ClFV98nyKrzJKVPMhdDnjzLhdUyMX4PsQAPjwIw==",
			"cpu": [
				"x64"
			],
			"dev": true,
			"license": "MIT",
			"optional": true,
			"os": [
				"win32"
			],
			"engines": {
				"node": ">=12"
			}
		},
		"node_modules/vite/node_modules/esbuild": {
			"version": "0.21.5",
			"resolved": "https://registry.npmjs.org/esbuild/-/esbuild-0.21.5.tgz",
			"integrity": "sha512-mg3OPMV4hXywwpoDxu3Qda5xCKQi+vCTZq8S9J/EpkhB2HzKXq4SNFZE3+NK93JYxc8VMSep+lOUSC/RVKaBqw==",
			"dev": true,
			"hasInstallScript": true,
			"license": "MIT",
			"bin": {
				"esbuild": "bin/esbuild"
			},
			"engines": {
				"node": ">=12"
			},
			"optionalDependencies": {
				"@esbuild/aix-ppc64": "0.21.5",
				"@esbuild/android-arm": "0.21.5",
				"@esbuild/android-arm64": "0.21.5",
				"@esbuild/android-x64": "0.21.5",
				"@esbuild/darwin-arm64": "0.21.5",
				"@esbuild/darwin-x64": "0.21.5",
				"@esbuild/freebsd-arm64": "0.21.5",
				"@esbuild/freebsd-x64": "0.21.5",
				"@esbuild/linux-arm": "0.21.5",
				"@esbuild/linux-arm64": "0.21.5",
				"@esbuild/linux-ia32": "0.21.5",
				"@esbuild/linux-loong64": "0.21.5",
				"@esbuild/linux-mips64el": "0.21.5",
				"@esbuild/linux-ppc64": "0.21.5",
				"@esbuild/linux-riscv64": "0.21.5",
				"@esbuild/linux-s390x": "0.21.5",
				"@esbuild/linux-x64": "0.21.5",
				"@esbuild/netbsd-x64": "0.21.5",
				"@esbuild/openbsd-x64": "0.21.5",
				"@esbuild/sunos-x64": "0.21.5",
				"@esbuild/win32-arm64": "0.21.5",
				"@esbuild/win32-ia32": "0.21.5",
				"@esbuild/win32-x64": "0.21.5"
			}
		},
		"node_modules/vitest": {
			"version": "1.6.1",
			"resolved": "https://registry.npmjs.org/vitest/-/vitest-1.6.1.tgz",
			"integrity": "sha512-Ljb1cnSJSivGN0LqXd/zmDbWEM0RNNg2t1QW/XUhYl/qPqyu7CsqeWtqQXHVaJsecLPuDoak2oJcZN2QoRIOag==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"@vitest/expect": "1.6.1",
				"@vitest/runner": "1.6.1",
				"@vitest/snapshot": "1.6.1",
				"@vitest/spy": "1.6.1",
				"@vitest/utils": "1.6.1",
				"acorn-walk": "^8.3.2",
				"chai": "^4.3.10",
				"debug": "^4.3.4",
				"execa": "^8.0.1",
				"local-pkg": "^0.5.0",
				"magic-string": "^0.30.5",
				"pathe": "^1.1.1",
				"picocolors": "^1.0.0",
				"std-env": "^3.5.0",
				"strip-literal": "^2.0.0",
				"tinybench": "^2.5.1",
				"tinypool": "^0.8.3",
				"vite": "^5.0.0",
				"vite-node": "1.6.1",
				"why-is-node-running": "^2.2.2"
			},
			"bin": {
				"vitest": "vitest.mjs"
			},
			"engines": {
				"node": "^18.0.0 || >=20.0.0"
			},
			"funding": {
				"url": "https://opencollective.com/vitest"
			},
			"peerDependencies": {
				"@edge-runtime/vm": "*",
				"@types/node": "^18.0.0 || >=20.0.0",
				"@vitest/browser": "1.6.1",
				"@vitest/ui": "1.6.1",
				"happy-dom": "*",
				"jsdom": "*"
			},
			"peerDependenciesMeta": {
				"@edge-runtime/vm": {
					"optional": true
				},
				"@types/node": {
					"optional": true
				},
				"@vitest/browser": {
					"optional": true
				},
				"@vitest/ui": {
					"optional": true
				},
				"happy-dom": {
					"optional": true
				},
				"jsdom": {
					"optional": true
				}
			}
		},
		"node_modules/w3c-keyname": {
			"version": "2.2.8",
			"resolved": "https://registry.npmjs.org/w3c-keyname/-/w3c-keyname-2.2.8.tgz",
			"integrity": "sha512-dpojBhNsCNN7T82Tm7k26A6G9ML3NkhDsnw9n/eoxSRlVBB4CEtIQ/KTCLI2Fwf3ataSXRhYFkQi3SlnFwPvPQ==",
			"dev": true,
			"license": "MIT",
			"peer": true
		},
		"node_modules/which": {
			"version": "2.0.2",
			"resolved": "https://registry.npmjs.org/which/-/which-2.0.2.tgz",
			"integrity": "sha512-BLI3Tl1TW3Pvl70l3yq3Y64i+awpwXqsGBYWkkqMtnbXgrMD+yj7rhW0kuEDxzJaYXGjEW5ogapKNMEKNMjibA==",
			"dev": true,
			"license": "ISC",
			"dependencies": {
				"isexe": "^2.0.0"
			},
			"bin": {
				"node-which": "bin/node-which"
			},
			"engines": {
				"node": ">= 8"
			}
		},
		"node_modules/which-boxed-primitive": {
			"version": "1.1.1",
			"resolved": "https://registry.npmjs.org/which-boxed-primitive/-/which-boxed-primitive-1.1.1.tgz",
			"integrity": "sha512-TbX3mj8n0odCBFVlY8AxkqcHASw3L60jIuF8jFP78az3C2YhmGvqbHBpAjTRH2/xqYunrJ9g1jSyjCjpoWzIAA==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"is-bigint": "^1.1.0",
				"is-boolean-object": "^1.2.1",
				"is-number-object": "^1.1.1",
				"is-string": "^1.1.1",
				"is-symbol": "^1.1.1"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/which-builtin-type": {
			"version": "1.2.1",
			"resolved": "https://registry.npmjs.org/which-builtin-type/-/which-builtin-type-1.2.1.tgz",
			"integrity": "sha512-6iBczoX+kDQ7a3+YJBnh3T+KZRxM/iYNPXicqk66/Qfm1b93iu+yOImkg0zHbj5LNOcNv1TEADiZ0xa34B4q6Q==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"call-bound": "^1.0.2",
				"function.prototype.name": "^1.1.6",
				"has-tostringtag": "^1.0.2",
				"is-async-function": "^2.0.0",
				"is-date-object": "^1.1.0",
				"is-finalizationregistry": "^1.1.0",
				"is-generator-function": "^1.0.10",
				"is-regex": "^1.2.1",
				"is-weakref": "^1.0.2",
				"isarray": "^2.0.5",
				"which-boxed-primitive": "^1.1.0",
				"which-collection": "^1.0.2",
				"which-typed-array": "^1.1.16"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/which-collection": {
			"version": "1.0.2",
			"resolved": "https://registry.npmjs.org/which-collection/-/which-collection-1.0.2.tgz",
			"integrity": "sha512-K4jVyjnBdgvc86Y6BkaLZEN933SwYOuBFkdmBu9ZfkcAbdVbpITnDmjvZ/aQjRXQrv5EPkTnD1s39GiiqbngCw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"is-map": "^2.0.3",
				"is-set": "^2.0.3",
				"is-weakmap": "^2.0.2",
				"is-weakset": "^2.0.3"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/which-typed-array": {
			"version": "1.1.22",
			"resolved": "https://registry.npmjs.org/which-typed-array/-/which-typed-array-1.1.22.tgz",
			"integrity": "sha512-fvO4ExWMFsqyhG3AiPAObMuY1lxaqgYcxbc49CNdWDDECOJNgQyvsOWVwbZc+qf3rzRtxojBK+CMEv0Ld5CYpw==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"available-typed-arrays": "^1.0.7",
				"call-bind": "^1.0.9",
				"call-bound": "^1.0.4",
				"for-each": "^0.3.5",
				"get-proto": "^1.0.1",
				"gopd": "^1.2.0",
				"has-tostringtag": "^1.0.2"
			},
			"engines": {
				"node": ">= 0.4"
			},
			"funding": {
				"url": "https://github.com/sponsors/ljharb"
			}
		},
		"node_modules/why-is-node-running": {
			"version": "2.3.0",
			"resolved": "https://registry.npmjs.org/why-is-node-running/-/why-is-node-running-2.3.0.tgz",
			"integrity": "sha512-hUrmaWBdVDcxvYqnyh09zunKzROWjbZTiNy8dBEjkS7ehEDQibXJ7XvlmtbwuTclUiIyN+CyXQD4Vmko8fNm8w==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"siginfo": "^2.0.0",
				"stackback": "0.0.2"
			},
			"bin": {
				"why-is-node-running": "cli.js"
			},
			"engines": {
				"node": ">=8"
			}
		},
		"node_modules/word-wrap": {
			"version": "1.2.5",
			"resolved": "https://registry.npmjs.org/word-wrap/-/word-wrap-1.2.5.tgz",
			"integrity": "sha512-BN22B5eaMMI9UMtjrGd5g5eCYPpCPDUy0FJXbYsaT5zYxjFOckS53SQDE3pWkVoWpHXVb3BrYcEN4Twa55B5cA==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">=0.10.0"
			}
		},
		"node_modules/wrappy": {
			"version": "1.0.2",
			"resolved": "https://registry.npmjs.org/wrappy/-/wrappy-1.0.2.tgz",
			"integrity": "sha512-l4Sp/DRseor9wL6EvV2+TuQn63dMkPjZ/sp9XkghTEbV9KlPS1xUsZ3u7/IQO4wxtcFB4bgpQPRcR3QCvezPcQ==",
			"dev": true,
			"license": "ISC"
		},
		"node_modules/yaml": {
			"version": "2.9.0",
			"resolved": "https://registry.npmjs.org/yaml/-/yaml-2.9.0.tgz",
			"integrity": "sha512-2AvhNX3mb8zd6Zy7INTtSpl1F15HW6Wnqj0srWlkKLcpYl/gMIMJiyuGq2KeI2YFxUPjdlB+3Lc10seMLtL4cA==",
			"dev": true,
			"license": "ISC",
			"bin": {
				"yaml": "bin.mjs"
			},
			"engines": {
				"node": ">= 14.6"
			},
			"funding": {
				"url": "https://github.com/sponsors/eemeli"
			}
		},
		"node_modules/yaml-eslint-parser": {
			"version": "1.3.2",
			"resolved": "https://registry.npmjs.org/yaml-eslint-parser/-/yaml-eslint-parser-1.3.2.tgz",
			"integrity": "sha512-odxVsHAkZYYglR30aPYRY4nUGJnoJ2y1ww2HDvZALo0BDETv9kWbi16J52eHs+PWRNmF4ub6nZqfVOeesOvntg==",
			"dev": true,
			"license": "MIT",
			"dependencies": {
				"eslint-visitor-keys": "^3.0.0",
				"yaml": "^2.0.0"
			},
			"engines": {
				"node": "^14.17.0 || >=16.0.0"
			},
			"funding": {
				"url": "https://github.com/sponsors/ota-meshi"
			}
		},
		"node_modules/yocto-queue": {
			"version": "1.2.2",
			"resolved": "https://registry.npmjs.org/yocto-queue/-/yocto-queue-1.2.2.tgz",
			"integrity": "sha512-4LCcse/U2MHZ63HAJVE+v71o7yOdIe4cZ70Wpf8D/IyjDKYQLV5GD46B+hSTjJsvV5PztjvHoU580EftxjDZFQ==",
			"dev": true,
			"license": "MIT",
			"engines": {
				"node": ">=12.20"
			},
			"funding": {
				"url": "https://github.com/sponsors/sindresorhus"
			}
		}
	}
}

```

## plugin release checklist.md

```markdown
\# Obsidian Plugin Publishing Checklist (2026)



Obsidian relaunched its plugin submission system in May 2026. Submissions now go through \*\*Obsidian Community\*\* (community.obsidian.md), not a GitHub pull request against `community-plugins.json`. There are two layers of review:



1\. \*\*Automated review\*\* — runs on every version you release (not just the first one), checks security, code quality, and known vulnerabilities, and usually returns a result within a few minutes.

2\. \*\*Manual review\*\* — Obsidian staff still hand-review submissions, especially popular/featured plugins or anything flagged by the community. This is slower and not guaranteed on a timeline.



If your plugin fails automated review after being listed, it gets pulled from search within 24 hours until you fix it — so treat this as a permanent gate, not a one-time hurdle.



Use this checklist in order: Section 1 items are absolute blockers, Sections 2–5 are what the bot and human reviewers actually check line by line, and Section 6+ covers submission mechanics and post-launch growth.



\---



\## 1. Hard blockers — fix these or you cannot pass, ever



These come from Obsidian's Developer Policies. Violating them isn't a "warning," it's a rejection (or later removal):



\- \[ ] \*\*No obfuscated code.\*\* Ship readable source — minified is fine, deliberately obfuscated/hidden-purpose code is not.

\- \[ ] \*\*No dynamic ads\*\* (anything loaded from the internet to display ads).

\- \[ ] \*\*No static ads outside your plugin's own UI\*\* (e.g. don't inject banners into the user's notes) unless disclosed — see disclosures below.

\- \[ ] \*\*No client-side telemetry.\*\* You cannot silently collect and phone home usage data from the user's device.

\- \[ ] \*\*No tracking without explicit opt-in consent.\*\* Any data collection needs a clear opt-in (checkbox/setting), not a default-on toggle buried in fine print.

\- \[ ] \*\*LICENSE file present at repo root\*\*, and you comply with the licenses of any third-party code you used (with attribution in the README where required).

\- \[ ] \*\*Closed-source plugins are not currently accepted\*\* for new submissions. If your plugin isn't open source, it won't get in right now.



\### Disclosures (allowed, but must be stated clearly in your README)

If any of these apply, say so explicitly in the README — don't just let a reviewer discover it:

\- \[ ] Payment required for full access, or account required for full access.

\- \[ ] Any network use — name the remote service(s) and explain why they're needed.

\- \[ ] Access to files outside the vault — explain why.

\- \[ ] Static ads within your own UI.

\- \[ ] Server-side telemetry — link to an actual privacy policy explaining what's collected and how it's used.



Also decide your pricing label honestly, since Obsidian requires one of three: \*\*Free\*\* (no payment tied to it at all — donation links are fine), \*\*Optional payments\*\* (works free but unlocks features or talks to a paid API/service, even one with a free tier), or \*\*Paid\*\* (must pay to use core features). Mislabeling this is a common rejection reason.



\---



\## 2. Repo \& release structure



\- \[ ] Root of repo contains: `manifest.json`, `main.js`, `styles.css` (only if you have styles), `README.md`, `LICENSE`, and `versions.json` if you support multiple `minAppVersion`s over time.

\- \[ ] `manifest.json` fields (`id`, `name`, `version`, `minAppVersion`) exactly match what you're submitting/what's in `community-plugins.json`.

\- \[ ] `id` is unique and doesn't collide with an existing plugin.

\- \[ ] `minAppVersion` is set to the actual minimum Obsidian version your API usage requires — if unsure, use the latest stable build number rather than guessing low.

\- \[ ] `fundingUrl` (if present) only points to something like Buy Me a Coffee or GitHub Sponsors — remove it entirely if you don't accept donations.

\- \[ ] GitHub \*\*release name/tag matches your manifest version exactly\*\*, with no `v` prefix (`1.2.0`, not `v1.2.0`).

\- \[ ] The release itself has `main.js`, `manifest.json`, and `styles.css` uploaded as \*\*individual binary assets\*\* on the release — not just relying on the auto-generated source zip.

\- \[ ] README actually explains what the plugin does and how to use it (this is checked, not a formality).

\- \[ ] Rename every placeholder from the sample plugin template — `MyPlugin`, `MyPluginSettings`, `SampleSettingTab`, etc. Reviewers notice leftover boilerplate names immediately and read it as a sign you didn't clean up.



\---



\## 3. Code-quality pitfalls (this is what actually gets flagged)



These are pulled straight from Obsidian's own "common review comments" list — i.e., the exact things that get your PR/scan commented on:



\- \[ ] Use `this.app`, never the global `app` / `window.app`.

\- \[ ] Strip debug `console.log` calls — the console should be clean by default; only errors should show.

\- \[ ] Use `getFileByPath` / `getFolderByPath` / `getAbstractFileByPath` instead of iterating `vault.getFiles()` to find something by path.

\- \[ ] Use the \*\*Editor API\*\* for edits to the currently open note, not `Vault.modify()` (which loses cursor position, selection, folds).

\- \[ ] Use `Vault.process()` for background edits to a file that isn't open, not `Vault.modify()`.

\- \[ ] Use `FileManager.processFrontMatter()` for frontmatter edits — don't hand-parse YAML.

\- \[ ] Prefer the Vault API over the Adapter API for file ops (caching + race-condition safety).

\- \[ ] Run any user-supplied or constructed path through `normalizePath()`.

\- \[ ] Don't set a default hotkey for commands (causes conflicts, and no hotkey works cross-platform by default).

\- \[ ] Use the right command callback type: `callback` (unconditional), `checkCallback` (conditional), `editorCallback`/`editorCheckCallback` (needs an active Markdown editor).

\- \[ ] Don't access `workspace.activeLeaf` directly — use `getActiveViewOfType()` / `workspace.activeEditor`.

\- \[ ] Don't hold a live reference to a custom view instance in `registerView` — re-fetch via `getActiveLeavesOfType()` when needed, to avoid memory leaks.

\- \[ ] Don't detach leaves in `onunload` (breaks layout restore on update).

\- \[ ] Clean up anything you register — event listeners, intervals, etc. — using `registerEvent()`/`addCommand()` etc. so it's auto-released on unload.

\- \[ ] Prefer `const`/`let` over `var`, and `async`/`await` over raw `.then()` chains.

\- \[ ] If your plugin has more than one `.ts` file, organize it into folders — flat piles of files slow reviewers down and count against you.



\---



\## 4. Security checklist



\- \[ ] \*\*Never\*\* build DOM from user/note input with `innerHTML`, `outerHTML`, or `insertAdjacentHTML` — this is a real XSS vector reviewers specifically scan for. Use `createEl()`/`createDiv()`/`createSpan()` or the DOM API instead, and `el.empty()` to clear content.

\- \[ ] No hardcoded inline styles (`el.style.color = ...`) — use CSS classes + Obsidian's CSS variables so themes/snippets can still override you. This is technically a style guideline, but reviewers treat inline styling plus injected HTML as a bigger red flag together.

\- \[ ] Any network requests are clearly justified and disclosed (see Section 1).

\- \[ ] If you bundle any third-party dependency with known CVEs, update it before submitting — the automated scanner checks for known vulnerabilities.



\---



\## 5. UI text checklist (small, but reviewers do flag it)



\- \[ ] Sentence case everywhere in the UI — "Template folder location," not "Template Folder Location."

\- \[ ] No top-level heading in your settings tab named "Settings," "General," or your plugin's own name.

\- \[ ] If you have multiple settings sections, only add headings when there's more than one section, and never put the word "settings" inside a heading ("Advanced," not "Advanced settings").

\- \[ ] Use `new Setting(containerEl).setName('...').setHeading()` for section headings — not raw `<h1>`/`<h2>` elements.



\---



\## 6. Mobile compatibility (skip if desktop-only, otherwise check)



\- \[ ] If your plugin is marked mobile-compatible, avoid Node.js/Electron-only APIs (`fs`, `child\_process`, etc.) — they don't exist on mobile and will crash the app there.

\- \[ ] Avoid regex lookbehind (`(?<=...)`) if you need to support older mobile WebView engines — it isn't universally supported there.



\---



\## 7. Self-check before you ever submit



Obsidian gives you two ways to run the same automated review yourself, before it's public:



1\. \*\*`obsidianmd/eslint-plugin`\*\* — the official ESLint plugin that checks your code against these exact guidelines locally, in your own dev loop.

2\. \*\*Developer dashboard preview scan\*\* — once logged into community.obsidian.md, you can run the automated review against any branch, tag, or commit \*without\* actually publishing a release. Use this to dry-run a submission and see the scorecard before committing to it publicly.



Run both before your first submission and before every subsequent release — a failed post-launch scan pulls your plugin from search within 24 hours.



\---



\## 8. Submitting (new flow, not the old GitHub PR)



1\. Create an Obsidian account if you don't have one (required for the dashboard).

2\. Sign in at \*\*community.obsidian.md\*\* and connect your GitHub account.

3\. From the developer dashboard, choose the repo to submit and complete the guided steps (this replaces manually editing `community-plugins.json` yourself).

4\. Submission triggers \*\*immediate automated review\*\* — expect a result within minutes, not days.

5\. If it passes, the plugin becomes searchable/installable inside Obsidian within about 24 hours.

6\. If it fails, the dashboard shows you exactly what failed (errors block; warnings don't block but should still be fixed) — fix and resubmit rather than opening a new PR.

7\. Manual review can still happen afterward (especially if your plugin gets popular or someone flags it) — passing automated review is necessary but isn't a permanent guarantee against further scrutiny.



Updates after the first approval don't need a new submission — push a new GitHub release and it's picked up and auto-scanned.



\---



\## 9. Increasing your odds of traction (the "going viral" part)



Nothing here is guaranteed, but these consistently correlate with plugins that get noticed:



\- \*\*A README with a GIF or screenshot in the first screen-height.\*\* Most people judge a plugin by whether they can \*see\* what it does in 5 seconds — text-only READMEs get skipped.

\- \*\*One clear job-to-be-done in the name/description\*\*, not a feature list. "Solves X" beats "does X, Y, Z, and also W."

\- \*\*Post it yourself\*\* in r/ObsidianMD, the Obsidian Discord `#updates`/`#plugin-dev` channels, and the "Share \& showcase" category on the Obsidian forum — the directory alone rarely drives discovery for a brand-new plugin.

\- \*\*Respond fast to early issues.\*\* The first 20–30 users are disproportionately vocal; a quick fix/reply turns them into advocates, silence turns them into a bad first GitHub issue thread that new visitors see.

\- \*\*Keep a real changelog\*\* and bump versions with actual notes — it signals active maintenance, which matters both to users and, per the policies above, to Obsidian's own "unmaintained plugin" removal criteria.

\- \*\*Categorize it correctly\*\* on the new Community site (it's now organized by category — Integrations, Bases, Charts, etc.) so it surfaces in the right browse/filter views.



\---



\## 10. Ongoing obligation (don't forget after launch)



\- \[ ] You're expected to keep maintaining the plugin. Long-term abandonment + it breaking on newer Obsidian versions is grounds for removal per policy.

\- \[ ] Every future release is auto-scanned — a regression that trips the scanner pulls you from search in 24 hours, so treat the eslint plugin / dashboard preview scan as a pre-release step permanently, not just for launch.



\---



\*Sources: Obsidian's "The future of Obsidian plugins" announcement (May 2026), Obsidian Developer Documentation — Plugin guidelines, Developer policies, and the obsidian-releases submission checklist template.\*


```

## README.md

```markdown
# Quran Key

> Contextual Qur'an verse extraction, snippet trimming, multi-source tafsir retrieval, and reflection journaling for Obsidian.

![Quran Key Overview Demo](docs/assets/hero-demo.gif)

---

## Features

- **Contextual Verse Extraction**: Auto-detects quotes, braces `{query}`, selections, and shorthand citations (e.g., `[البقرة:255]` or `البقرة 255-257`) directly from the cursor line.
- **Snippet Trimming & View Toggle**: Extract exact word-ranges `(من-إلى)` or invoke extraction consecutively to toggle between full ayah and snippet views.
- **Multi-Source Tafsir Engine**: Fetch commentary across 40+ classical and contemporary tafsir books with custom source support.
- **Tadabbur & Reflection Journaling**: Automatically log notes, benefits, and reflections into dedicated per-ayah files (`تدبرات` / `آثار`).
- **Typography & Ornate Styling**: Custom Qur'anic fonts, accent colors, and stylized ornate ayah numbering (`۝١٢`) in both Live Preview and Reading View.
- **Footnote & Utility Commands**: Convert inline citations into markdown footnotes, strip tashkeel, or clean references with single hotkeys.

---

## Demos & Workflows

### 1. Contextual Verse Extraction & Auto-Detection
Type a search query, select text, or write a chapter/verse mention, then execute **Extract Quran verse from context**.

![Verse Extraction Demo](docs/assets/extraction-demo.gif)

### 2. Snippet Trimming & Toggle View
Crop specific phrases using `(word1-word2)` shorthand next to a reference, or repeat the extract command to toggle between the snippet and the full verse.

![Snippet Trimming Demo](docs/assets/snippet-demo.gif)

### 3. Multi-Source Tafsir Retrieval
Fetch commentary for single ayahs or multi-ayah ranges using your preferred books or auto-detected authors mentioned on the line.

![Tafsir Retrieval Demo](docs/assets/tafsir-demo.gif)

### 4. Tadabbur & Athar Journaling
Select your reflection text and run **Log selection as تدبر** to create or append to dedicated verse notes linked via frontmatter.




### Video Walkthrough
[▶ Click here to watch the full walkthrough demo](https://github.com/user-attachments/assets/050b9c1e-5144-429e-b5c0-3a14a89bd6a9)



---

## Command Reference

| Command | Description |
| :--- | :--- |
| `Extract Quran verse from context` | Primary extraction: resolves queries, ranges, or selections on the current line. |
| `Open global Quran search modal` | Opens the full-corpus fuzzy/literal search modal with live analytics. |
| `Fetch contextual tafsir for current line` | Retrieves tafsir commentary for the verse/range at the cursor. |
| `Open global tafsir selection modal` | Interactive picker to choose books first, then select verse range. |
| `Log selection as تدبر` | Links and moves/copies selection into the verse's Tadabbur file. |
| `Log selection as أثر` | Links and moves/copies selection into the verse's Athar file. |
| `Convert Quran reference to footnote` | Converts inline `[Surah:Ayah]` to a numbered markdown footnote `[^quran1]`. |
| `Remove Quran reference from line` | Strips matched Qur'anic citations from the current line. |
| `Strip tashkeel from selection or line` | Removes diacritics/tashkeel from selection or active line. |

---

## Network & Privacy Disclosures

In compliance with Obsidian Developer Policies:

- **Network Access**: This plugin makes outgoing HTTPS requests to `tafsir.app` (or custom API endpoints configured by the user in Settings) **only when a tafsir retrieval command is explicitly executed**.
- **No Telemetry / Tracking**: This plugin does not collect, log, or transmit any analytics, telemetry, or user vault data.
- **Pricing & Offline Use**: 100% Free and open source. All Qur'an text extraction, search, normalization, and reflection features function completely offline without internet connectivity.

---

## Customization

- **Verse Formatting**: Customize wrapper glyphs (e.g., `﴿ ... ﴾`), reference syntax templates (`[{surah}:{verse}]`), and ornate number styles (`۝`).
- **Custom Tafsir Sources**: Add any custom API endpoint using `{bookId}`, `{surahId}`, and `{ayahId}` placeholders.
- **Normalization Rules**: Add or toggle custom Arabic text regex substitutions in settings.
- **Custom Reflection Categories**: Add new categories (e.g., `فائدة`, `لطيفة`) with dedicated target vault folders.

---

## Installation

### From Obsidian Community Plugins
1. Open **Settings** > **Community plugins**.
2. Search for `Quran Key`.
3. Click **Install**, then **Enable**.

### Manual Installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest [GitHub Release](https://github.com/MohamedSaleh0-0/quran-key/releases).
2. Create a folder named `quran-key` under your vault's `.obsidian/plugins/` directory.
3. Copy the downloaded files into `.obsidian/plugins/quran-key/`.
4. Reload Obsidian and enable **Quran Key** in Community Plugins settings.

---

## License

This project is open source and licensed under the [MIT License](LICENSE).

```

## styles.css

```css
/* All colors/fonts/sizes below are driven by CSS custom properties that the
   plugin writes at runtime from Settings (see
   src/infrastructure/obsidian/QuranHighlightExtension.ts). Nothing here is
   !important — every selector is scoped under .quran-key-* so themes and
   user CSS snippets can still override it. */

.cm-quran-key-text {
	font-family: var(--quran-key-font-family);
	font-size: var(--quran-key-font-size);
	line-height: var(--quran-key-line-height);
	color: var(--quran-key-color);
	text-rendering: optimizeLegibility;
	-webkit-font-smoothing: antialiased;
	background-color: transparent;
}

.quran-key-modal-alias {
	color: var(--text-muted);
	font-size: 0.82em;
	font-style: italic;
	margin-right: 8px;
	opacity: 0.75;
}

.quran-key-analytics-dashboard {
	display: flex;
	justify-content: space-around;
	align-items: center;
	background: var(--background-secondary-alt);
	border: 1px solid var(--background-modifier-border);
	border-radius: 6px;
	padding: 10px;
	margin: 10px 0;
	font-size: 0.82em;
	color: var(--text-normal);
}

.quran-key-analytics-dashboard[dir="rtl"] {
	direction: rtl;
}

.quran-key-analytics-stat {
	flex: 1;
	text-align: center;
	border-inline-start: 1px solid var(--background-modifier-border);
}

.quran-key-analytics-stat:first-child {
	border-inline-start: none;
}

.quran-key-analytics-label {
	color: var(--text-muted);
	display: block;
	margin-bottom: 4px;
	font-size: 0.9em;
}

.quran-key-analytics-value {
	font-weight: 600;
	color: var(--text-accent);
	font-size: 1.1em;
}

.quran-key-highlight {
	color: var(--text-accent);
	font-weight: bold;
}

.quran-key-suggestion-text {
	font-size: 1.1em;
	line-height: 1.5;
	text-align: right;
	direction: rtl;
}

.quran-key-suggestion-meta {
	color: var(--text-muted);
	display: block;
	margin-top: 4px;
	text-align: right;
	direction: rtl;
}

.quran-key-picker-modal {
	max-width: 600px;
	max-height: 80vh;
	display: flex;
	flex-direction: column;
	direction: rtl;
	text-align: right;
}

.quran-key-picker-list {
	flex: 1;
	overflow-y: auto;
	max-height: 45vh;
	border: 1px solid var(--background-modifier-border);
	border-radius: 6px;
	padding: 5px;
	background: var(--background-primary);
}

.quran-key-picker-item {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 10px 12px;
	border-bottom: 1px solid var(--background-modifier-border);
	cursor: pointer;
	border-radius: 4px;
}

.quran-key-picker-item.is-active {
	background: var(--background-modifier-hover);
	box-shadow: inset 3px 0 0 var(--text-accent);
}

.quran-key-picker-item-right {
	display: flex;
	align-items: center;
	gap: 10px;
}

.quran-key-picker-item-name {
	font-size: 1.2em;
	color: var(--text-muted);
}

.quran-key-picker-item-name.is-checked {
	color: var(--text-normal);
	font-weight: 500;
}

.quran-key-picker-add-source {
	margin-top: 10px;
}

.quran-key-picker-add-source > summary {
	cursor: pointer;
	color: var(--text-accent);
	font-size: 0.92em;
	padding: 6px 0;
}

.quran-key-picker-footer {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	margin-top: 14px;
	padding-top: 10px;
	border-top: 1px solid var(--background-modifier-border);
}

.quran-key-picker-hint {
	color: var(--text-muted);
	font-size: 0.8em;
}

/* Toggled off entirely via settings.styleOrnateNumbers (see
   QuranHighlightExtension.ts); when on, styleable independently of the
   surrounding .cm-quran-key-text ayah text. Override via
   settings.customCss, which is appended after this stylesheet loads. */
.quran-key-ornate-number {
	color: var(--text-accent);
	font-weight: 600;
}

.quran-key-settings-textarea {
	width: 100%;
	min-height: 100px;
	font-family: var(--font-monospace);
	font-size: 0.85em;
}
```

## SUMMARY.md

```markdown
# Implementation summary

Delivered as new/changed source files (mirroring `src/`), not a diff,
since the sandbox only has read access to the project's `bundle.md` and
can't run `npm install`/build anyway (same limitation the project's own
README already notes). `WIRING.md` has the exact `main.ts` edits needed
to plug these in.

## Done

**Heading levels — free text.** `HeadingLevel` union removed from
`config/types.ts`. `rangeHeadingLevel`/`bookHeadingLevel` are now plain
strings, rendered as `type: "text"` fields in `SettingsSchema.ts` — no
dropdown, no fixed ceiling.

**Unified ayah notes.** New `AyahNoteRepository` port +
`ObsidianAyahNoteRepository` implementation: one note per ayah by
default (`ayahNotesFolder`), with content organized under per-category
headings inside it. `ReflectionCategoryDescriptor` gained
`organizationMode` ("unified" | "ownFolder"), `headingText`,
`headingLevel`, `parentCategoryId` — a category can still opt into its
own per-ayah folder (your "فوائد عملية" example), in which case the
unified note keeps a single synced link line to it and vice versa
(`ayahNote:` frontmatter), so the unified note stays "the reference"
either way.

**Heading-section insertion — pure, tested domain logic.**
`HeadingSectionInserter` (`domain/services`) finds-or-creates a heading
(nested under a parent the first time only, via
`ReflectionCategoryCatalog.ancestorChain` — cycle-safe) and inserts an
entry either directly under it (newest-first) or at the section's end
(chronological), governed by the new global
`reflectionInsertionMode` setting. Covered by
`tests/domain/HeadingSectionInserter.spec.ts`.

**Ayah linking (`relatedAyat`).** New `LinkAyahsTogether` use case +
`LinkAyatModal` (search/checkbox/keyboard picker, same proven pattern as
`TafsirBookPickerModal`) + new "Link related ayahs" command. Union-merge
only, no overwrite — linking a 3rd ayah into an existing pair never drops
the first link. No "reason" field, by design.

**Backlink instead of silent erase.** `deleteSelectionAfterLinkingReflection`
now means "replace the selection with a backlink" (default `true`),
never "erase to nothing." Alias and surrounding text are both
templatable (`reflectionBacklinkAliasTemplate` / `...WrapTemplate`).

**Customizable entry separator.** `reflectionEntrySeparator`, default
`"\n\n---\n\n"`, free text, can be emptied.

**Ayah text at the top of a note.** `includeAyahTextInReflectionNote`,
written once at note creation, never repeated per entry.

**`TafsirBookPickerModal` keyboard-nav-after-click fix.** One line
(`this.searchEl.focus()`) — root-caused in the file's own comment: a
mouse click's target gets destroyed by the subsequent `renderList()`,
dropping focus to `<body>`, which is *outside* the capture-phase
listener's path (an ancestor, not a descendant) — so arrow keys fall
through to native scroll. Applied to `LinkAyatModal` too, from the start.

**Category management UI.** Full CRUD in the settings tab: name,
organization mode, heading text/level, optional parent, folder — for
both builtin and custom categories (editing a builtin's field records a
`customReflectionCategories` override, same convention `TafsirCatalog`
already uses for builtin tafsir books).

## Deliberately deferred (per the design discussion itself)

- **Migration (`unified` <-> `ownFolder` for an already-populated
  category).** Explicitly agreed to be a separate, later phase — its
  correctness depends on the note-shape design landing first, and it
  needs to be atomic-per-ayah with an explicit "migrate now" action
  rather than a silent settings-diff trigger. `migrateLegacySettings`
  has a doc comment marking where it will hook in.
- **Mobile-only touch buttons** for Shift+Enter/Alt+Enter equivalents,
  and the **quran-modal keyboard remap** (Shift+Enter = range,
  Alt+Enter = range/insert + tafsir) — agreed as a separate batch from
  the note-organization work; not touched here to keep this change
  reviewable as one coherent unit.
- **`tags: []`** in unified-note frontmatter and **richer corpus fields**
  (juz'/hizb/page/Meccan-Medinan) — mentioned as easy future additions,
  not confirmed as wanted now.

## Files

```
src/config/types.ts                                    (changed)
src/config/defaults.ts                                  (changed)
src/config/strings.ts                                    (changed)
src/domain/entities/ReflectionCategory.ts                (changed)
src/domain/services/ReflectionCategoryCatalog.ts          (changed — ancestorChain)
src/domain/services/HeadingSectionInserter.ts             (new)
src/domain/ports/AyahNoteRepository.ts                    (new, replaces ReflectionFileRepository)
src/application/use-cases/LinkReflectionToVerses.ts        (rewritten)
src/application/use-cases/LinkAyahsTogether.ts             (new)
src/infrastructure/obsidian/ObsidianAyahNoteRepository.ts  (new, replaces ObsidianReflectionFileRepository)
src/presentation/modals/LinkAyatModal.ts                   (new)
src/presentation/modals/TafsirBookPickerModal.ts            (focus fix)
src/presentation/settings/SettingsSchema.ts                (changed)
src/presentation/settings/QuranKeySettingsTab.ts             (changed — category CRUD)
src/presentation/AppServices.ts                             (changed)
src/presentation/commands/definitions/linkAyat.ts             (new)
src/presentation/commands/registerCommands.ts                 (changed)
data/reflectionCategories.json                              (changed shape)
tests/domain/HeadingSectionInserter.spec.ts                    (new)
WIRING.md                                                     (main.ts edit instructions)
```

```

## tsconfig.json

```json
{
	"compilerOptions": {
		"baseUrl": ".",
		"paths": {
			"@domain/*": ["src/domain/*"],
			"@application/*": ["src/application/*"],
			"@infrastructure/*": ["src/infrastructure/*"],
			"@presentation/*": ["src/presentation/*"],
			"@config/*": ["src/config/*"]
		},
		"inlineSourceMap": true,
		"inlineSources": true,
		"module": "ESNext",
		"target": "ES6",
		"allowJs": true,
		"noImplicitAny": true,
		"moduleResolution": "node",
		"importHelpers": true,
		"isolatedModules": true,
		"strict": true,
		"strictNullChecks": true,
		"resolveJsonModule": true,
		"esModuleInterop": true,
		"lib": ["DOM", "ES6", "ES7"]
	},
	"include": ["src/**/*.ts"]
}

```

## versions.json

```json
{
	"1.0.1": "1.8.0"
}
```

## vitest.config.ts

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["tests/**/*.spec.ts"],
	},
});

```

## WIRING.md

```markdown
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

```

## normalizationRules.json

```json
[
  {
    "id": "alef-madda-variants",
    "kind": "literal",
    "description": "unify various spellings of يا أيّها (ya ayyuha)",
    "pattern": "يا\\s+أيها",
    "flags": "g",
    "replacement": "يايها"
  },
  {
    "id": "ya-ayyuha-1",
    "kind": "literal",
    "description": "unify joined spelling ياأيها",
    "pattern": "ياأيها",
    "flags": "g",
    "replacement": "يايها"
  },
  {
    "id": "ya-ayyuha-2",
    "kind": "literal",
    "description": "unify joined spelling يأيها",
    "pattern": "يأيها",
    "flags": "g",
    "replacement": "يايها"
  },
  {
    "id": "salah",
    "kind": "literal",
    "description": "صلوة -> صلاة (salah short-alef spelling)",
    "pattern": "صلوة",
    "flags": "g",
    "replacement": "صلاة"
  },
  {
    "id": "zakah",
    "kind": "literal",
    "description": "زكوة -> زكاة (zakah short-alef spelling)",
    "pattern": "زكوة",
    "flags": "g",
    "replacement": "زكاة"
  },
  {
    "id": "hayah",
    "kind": "literal",
    "description": "حيوة -> حياة (hayah short-alef spelling)",
    "pattern": "حيوة",
    "flags": "g",
    "replacement": "حياة"
  },
  {
    "id": "mishkah",
    "kind": "literal",
    "description": "مشكوة -> مشكاة (mishkah short-alef spelling)",
    "pattern": "مشكوة",
    "flags": "g",
    "replacement": "مشكاة"
  }
]
```

## reflectionCategories.json

```json
[
  {
    "id": "tadabbur",
    "name": "تدبر",
    "organizationMode": "unified",
    "headingText": "تدبرات",
    "headingLevel": "###",
    "parentCategoryId": null,
    "folder": "",
    "isBuiltin": true
  },
  {
    "id": "athar",
    "name": "أثر",
    "organizationMode": "unified",
    "headingText": "آثار",
    "headingLevel": "###",
    "parentCategoryId": null,
    "folder": "",
    "isBuiltin": true
  }
]

```

## tafsirBooks.json

```json
[
  {
    "id": "tabari",
    "name": "تفسير الطبري (جامع البيان)",
    "aliases": [
      "الطبري",
      "جامع البيان",
      "ابن جرير"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "ibn-katheer",
    "name": "تفسير ابن كثير (القرآن العظيم)",
    "aliases": [
      "ابن كثير",
      "كثير",
      "تفسير القرآن العظيم"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "qurtubi",
    "name": "تفسير القرطبي (الجامع لأحكام القرآن)",
    "aliases": [
      "القرطبي",
      "الجامع لأحكام القرآن"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "baghawi",
    "name": "تفسير البغوي (معالم التنزيل)",
    "aliases": [
      "البغوي",
      "معالم التنزيل"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "zad-almaseer",
    "name": "تفسير ابن الجوزي (زاد المسير)",
    "aliases": [
      "ابن الجوزي",
      "الجوزي",
      "زاد المسير"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "almawirdee",
    "name": "تفسير الماوردي (النكت والعيون)",
    "aliases": [
      "الماوردي",
      "النكت والعيون"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "ibn-alqayyim",
    "name": "تفسير ابن القيم",
    "aliases": [
      "ابن القيم",
      "ابن قيم الجوزية",
      "القيم"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "ibn-taymiyyah",
    "name": "تفسير ابن تيمية",
    "aliases": [
      "ابن تيمية",
      "تيمية",
      "شيخ الإسلام"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "samaani",
    "name": "تفسير السمعاني",
    "aliases": [
      "السمعاني"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "makki",
    "name": "تفسير مكي بن أبي طالب",
    "aliases": [
      "مكي",
      "مكي بن أبي طالب",
      "الهداية إلى بلوغ النهاية"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "mahasin-altaweel",
    "name": "محاسن التأويل للقاسمي",
    "aliases": [
      "القاسمي",
      "محاسن التأويل"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "althaalabi",
    "name": "تفسير الثعالبي (الجواهر الحسان)",
    "aliases": [
      "الثعالبي",
      "الجواهر الحسان"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "samarqandi",
    "name": "تفسير السمرقندي (بحر العلوم)",
    "aliases": [
      "السممرقندي",
      "بحر العلوم"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "althalabi",
    "name": "تفسير الثعلبي (الكشف والبيان)",
    "aliases": [
      "الثعلبي",
      "الكشف والبيان"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "fath-albayan",
    "name": "فتح البيان للقنوجي",
    "aliases": [
      "القنوجي",
      "فتح البيان"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "fath-alqadeer",
    "name": "فتح القدير للشوكاني",
    "aliases": [
      "الشوكاني",
      "فتح القدير"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "altasheel",
    "name": "تفسير ابن جزي (التسهيل)",
    "aliases": [
      "ابن جزي",
      "التسهيل",
      "التسهيل لعلوم التنزيل"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "alaloosi",
    "name": "تفسير الآلوسي (روح المعاني)",
    "aliases": [
      "الآلوسي",
      "روح المعاني"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "alrazi",
    "name": "تفسير الرازي (مفاتيح الغيب)",
    "aliases": [
      "الرازي",
      "فخر الدين الرازي",
      "مفاتيح الغيب"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "adwaa-albayan",
    "name": "أضواء البيان للشنقيطي",
    "aliases": [
      "الشنقيطي",
      "أضواء البيان",
      "محمد الأمين الشنقيطي"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "nathm-aldurar",
    "name": "نظم الدرر للبقاعي",
    "aliases": [
      "البقاعي",
      "نظم الدرر"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "ibn-aashoor",
    "name": "تفسير ابن عاشور (التحرير والتنوير)",
    "aliases": [
      "ابن عاشور",
      "عاشور",
      "التحرير والتنوير",
      "التحرير"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "ibn-atiyah",
    "name": "المحرر الوجيز لابن عطية",
    "aliases": [
      "ابن عطية",
      "عطية",
      "المحرر الوجيز"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "albahr-almuheet",
    "name": "البحر المحيط لأبي حيان",
    "aliases": [
      "أبي حيان",
      "أبو حيان",
      "البحر المحيط"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "albaseet",
    "name": "التفسير البسيط للواحدي",
    "aliases": [
      "الواحدي",
      "التفسير البسيط",
      "البسيط"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "abu-alsuod",
    "name": "تفسير أبي السعود",
    "aliases": [
      "أبي السعود",
      "أبو السعود",
      "إرشاد العقل السليم"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "kashaf",
    "name": "الكشاف للزمخشري",
    "aliases": [
      "الزمخشري",
      "الكشاف"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "muyassar",
    "name": "التفسير الميسر",
    "aliases": [
      "الميسر",
      "التفسير الميسر",
      "مجمع الملك فهد"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "mukhtasar",
    "name": "المختصر في التفسير",
    "aliases": [
      "المختصر",
      "المختصر في التفسير",
      "مركز تفسير"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "saadi",
    "name": "تفسير السعدي (تيسير الكريم الرحمن)",
    "aliases": [
      "السعدي",
      "تيسير الكريم الرحمن",
      "تيسير الكريم"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "aysar-altafasir",
    "name": "أيسر التفاسير للجزائري",
    "aliases": [
      "الجزائري",
      "أبو بكر الجزائري",
      "أيسر التفاسير"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "tadabbur-wa-amal",
    "name": "القرآن – تدبر وعمل",
    "aliases": [
      "تدبر وعمل",
      "شركة الخبرات الذكية",
      "القرآن تدبر وعمل"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "ibn-uthaymeen",
    "name": "تفسير ابن عثيمين",
    "aliases": [
      "ابن عثيمين",
      "عثيمين"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "jalalayn",
    "name": "تفسير الجلالين",
    "aliases": [
      "الجلالين",
      "المحلي والسيوطي",
      "جلال الدين"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "iejee",
    "name": "جامع البيان للإيجي",
    "aliases": [
      "الإيجي",
      "جامع البيان للإيجي"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "albaydawee",
    "name": "تفسير البيضاوي (أنوار التنزيل)",
    "aliases": [
      "البيضاوي",
      "أنوار التنزيل"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "alnasafi",
    "name": "تفسير النسفي (مدارك التنزيل)",
    "aliases": [
      "النسفي",
      "مدارك التنزيل"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "alwajeez",
    "name": "الوجيز للواحدي",
    "aliases": [
      "الوجيز",
      "الوجيز للواحدي"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "zimneen",
    "name": "تفسير ابن أبي زمنين",
    "aliases": [
      "ابن أبي زمنين",
      "زمنين"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "mathoor",
    "name": "موسوعة التفسير المأثور",
    "aliases": [
      "المأثور",
      "التفسير المأثور",
      "معهد الشاطبي",
      "موسوعة التفسير المأثور"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "aldur-almanthoor",
    "name": "الدر المنثور للسيوطي",
    "aliases": [
      "الدر المنثور",
      "السيوطي"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  },
  {
    "id": "ibn-abi-hatim",
    "name": "تفسير ابن أبي حاتم",
    "aliases": [
      "ابن أبي حاتم",
      "أبي حاتم"
    ],
    "urlTemplate": "https://tafsir.app/get.php?src={bookId}&s={surahId}&a={ayahId}&ver=1",
    "isBuiltin": true
  }
]
```
