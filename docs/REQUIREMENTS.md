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
