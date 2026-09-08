# Quran Key

> Toolkit for Islamic studies and Quran research with verse lookup, multi-source tafsir, and reflection notes.

See the [roadmap](docs/ROADMAP.md) and [vault-note schema](docs/VAULT_NOTE_SCHEMA.md)
for planned surah/ayah note workflows and the structure of plugin-generated notes.

![Quran Key Overview Demo](docs/assets/hero-demo.gif)

---

## Features

- Contextual Verse Extraction: Auto-detects quotes, braces {query}, selections, and shorthand citations (e.g., [البقرة:255] or البقرة 255-257) directly from the cursor line.
- Snippet Trimming & View Toggle: Extract exact word-ranges (من-إلى) or invoke extraction consecutively to toggle between full ayah and snippet views.
- Multi-Source Tafsir Engine: Fetch commentary across 40+ classical and contemporary tafsir books with custom source support.
- Unified Ayah Journaling: Record reflections, benefits, and notes under dedicated headings inside a single unified note per ayah, or configure separate category folders.
- Surah & Ayah Notes: Open a complete surah as continuous mushaf-style text, then click an ayah marker to lazily create and open its note.
- Related Verse Linking: Group and cross-link semantically related ayahs together via frontmatter metadata.
- Typography & Ornate Numbering: Integrated Uthmanic font stack (King Fahd Complex & Amiri Quran) with styled Arabic-Indic numerals in both Live Preview and Reading View.
- Footnote & Utility Commands: Convert inline citations into markdown footnotes, strip tashkeel, or clean references with single hotkeys.

### Quran text source

The bundled Quran corpus retains `quran-uthmani.xml` unchanged as the canonical
reference: Tanzil Quran Text (Uthmani, Version 1.1). The generated
`data/ayahs.json` uses Tanzil's extended `quran-uthmani-sequential.xml` display
profile, which adds sequential tanween marks while preserving the same Quranic
letters and Uthmani signs. The importer validates both files against each other
before generating the application corpus, and records both source hashes. The
importer preserves Uthmani text, pause marks, sajdah signs, rubʿ al-ḥizb signs,
and separately stored Bismillah text. The matching embedded `me_quran` font is
used first for Quran text. Tanzil documents that this font is required for
correctly rendering sequential tanween data; it also keeps Quranic annotation
marks such as U+06DF aligned inside the plugin's ornate verse wrapper. The
canonical source remains available for audit, while the runtime display text is
never silently normalized or rewritten.

Run `npm run quran:import` after replacing the source file. The importer
validates the 114 surahs and 6,236 ayahs in both source files before generating
the JSON corpus. Tanzil attribution, display options, and usage terms are
available at
<https://tanzil.net/download/>.

---

## Demos & Workflows

### 1. Contextual Verse Extraction & Auto-Detection
Type a search query, select text, or write a chapter/verse mention, then execute Extract Quran verse from context.

![Verse Extraction Demo](docs/assets/extraction-demo.gif)

### 2. Snippet Trimming & Toggle View
Crop specific phrases using (word1-word2) shorthand next to a reference, or repeat the extract command to toggle between the snippet and the full verse.

![Snippet Trimming Demo](docs/assets/snippet-demo.gif)

### 3. Multi-Source Tafsir Retrieval
Fetch commentary for single ayahs or multi-ayah ranges using your preferred books or auto-detected authors mentioned on the line.

![Tafsir Retrieval Demo](docs/assets/tafsir-demo.gif)

### 4. Ayah Reflection Journaling
Select your reflection text and choose a category to create or append directly to the unified verse note.

### Video Walkthrough
[▶ Click here to watch the full walkthrough demo](https://github.com/user-attachments/assets/050b9c1e-5144-429e-b5c0-3a14a89bd6a9)

---

## Command Reference

| Command | Description |
| :--- | :--- |
| `Extract Quran verse from context` | Primary extraction: resolves queries, ranges, or selections on the current line. |
| `Open global Quran search modal` | Opens the full-corpus search modal with live analytics. |
| `Fetch contextual tafsir for current line` | Retrieves tafsir commentary for the verse/range at the cursor. |
| `Open global tafsir selection modal` | Interactive picker to choose commentary sources first, then select verse range. |
| `Log selection to reflection (choose category)` | Interactive modal to pick or create a reflection category for selected text. |
| `Link related ayahs` | Multi-select modal to cross-link two or more related verses in frontmatter. |
| `Open or create Quran surah note` | Choose a surah and open its complete mushaf-style note; ayah notes are created only when reached. |
| `Log note on Quran ayah` | Search for an ayah, optionally choose a range, select a reflection section, and write directly into the notes from one modal. |
| `Convert Quran reference to footnote` | Converts inline `[Surah:Ayah]` to a numbered markdown footnote `[^quran1]`. |
| `Remove Quran reference from line` | Strips matched Qur'anic citations from the current line. |
| `Strip tashkeel from selection or line` | Removes diacritics/tashkeel from selection or active line. |

---

## Custom Styling & CSS Reference

You can target plugin elements using Obsidian snippets or via the Custom CSS field in plugin settings:

| CSS Selector | Description |
| :--- | :--- |
| `.cm-quran-key-text` | The Qur'anic verse body inside wrapper glyphs (Editor & Live Preview). |
| `.quran-key-ornate-number` | The Arabic-Indic verse number decoration. |
| `.quran-key-ayah-note-link`, `.quran-key-lazy-ayah` | The ayah marker that opens an existing or lazily created ayah note. |
| `.quran-key-highlight` | Highlighted matching words inside search modals. |
| `.quran-key-analytics-dashboard` | The live analytics stat bar in the search modal. |
| `.quran-key-picker-modal` | Modals for tafsir sources, category selection, and ayah linking. |

Power-user options, including the optional `@` section trigger in the ayah
entry modal, are available under Settings → Advanced and are disabled by
default.

### Styling Examples

```css
/* Add a decorative side border to inserted verses */
.cm-quran-key-text {
    border-right: 3px solid var(--quran-key-color, #dfc56b);
    padding-right: 8px;
}

/* Style ayah numbers with a badge background */
.quran-key-ornate-number {
    background: rgba(223, 197, 107, 0.15);
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 0.9em;
}
```

---

## Network & Privacy Disclosures

In compliance with Obsidian Developer Policies:

- Network Access: This plugin makes outgoing HTTPS requests to tafsir.app (or custom API endpoints configured by the user in Settings) only when a tafsir retrieval command is explicitly executed.
- No Telemetry / Tracking: This plugin does not collect, log, or transmit any analytics, telemetry, or user vault data.
- Offline First: All Qur'an text extraction, local search, normalization, and note-taking features function completely offline without internet connectivity.

---

## Installation

### From Obsidian Community Plugins
1. Open Settings > Community plugins.
2. Search for Quran Key.
3. Click Install, then Enable.

### Manual Installation
1. Download main.js, manifest.json, and styles.css from the latest [GitHub Release](https://github.com/MohamedSaleh0-0/quran-key/releases).
2. Create a folder named quran-key under your vault's .obsidian/plugins/ directory.
3. Copy the downloaded files into .obsidian/plugins/quran-key/.
4. Reload Obsidian and enable Quran Key in Community Plugins settings.

---

## License

This project is open source and licensed under the [MIT License](LICENSE).
