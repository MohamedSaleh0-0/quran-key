# Quran Key

> Toolkit for Islamic studies and Quran research with verse lookup, multi-source tafsir, and reflection notes.

![Quran Key Overview Demo](docs/assets/hero-demo.gif)[cite: 3]

---

## Features

- Contextual Verse Extraction: Auto-detects quotes, braces {query}, selections, and shorthand citations (e.g., [البقرة:255] or البقرة 255-257) directly from the cursor line[cite: 3].
- Snippet Trimming & View Toggle: Extract exact word-ranges (من-إلى) or invoke extraction consecutively to toggle between full ayah and snippet views[cite: 3].
- Multi-Source Tafsir Engine: Fetch commentary across 40+ classical and contemporary tafsir books with custom source support[cite: 3].
- Unified Ayah Journaling: Record reflections, benefits, and notes under dedicated headings inside a single unified note per ayah, or configure separate category folders[cite: 1, 2].
- Related Verse Linking: Group and cross-link semantically related ayahs together via frontmatter metadata[cite: 1].
- Typography & Ornate Numbering: Integrated Uthmanic font stack (King Fahd Complex & Amiri Quran) with styled Arabic-Indic numerals in both Live Preview and Reading View[cite: 1, 2].
- Footnote & Utility Commands: Convert inline citations into markdown footnotes, strip tashkeel, or clean references with single hotkeys[cite: 3].

---

## Demos & Workflows

### 1. Contextual Verse Extraction & Auto-Detection
Type a search query, select text, or write a chapter/verse mention, then execute Extract Quran verse from context[cite: 3].

![Verse Extraction Demo](docs/assets/extraction-demo.gif)[cite: 3]

### 2. Snippet Trimming & Toggle View
Crop specific phrases using (word1-word2) shorthand next to a reference, or repeat the extract command to toggle between the snippet and the full verse[cite: 3].

![Snippet Trimming Demo](docs/assets/snippet-demo.gif)[cite: 3]

### 3. Multi-Source Tafsir Retrieval
Fetch commentary for single ayahs or multi-ayah ranges using your preferred books or auto-detected authors mentioned on the line[cite: 3].

![Tafsir Retrieval Demo](docs/assets/tafsir-demo.gif)[cite: 3]

### 4. Ayah Reflection Journaling
Select your reflection text and choose a category to create or append directly to the unified verse note[cite: 1, 2].

### Video Walkthrough
[▶ Click here to watch the full walkthrough demo](https://github.com/user-attachments/assets/050b9c1e-5144-429e-b5c0-3a14a89bd6a9)[cite: 3]

---

## Command Reference

| Command | Description |
| :--- | :--- |
| `Extract Quran verse from context` | Primary extraction: resolves queries, ranges, or selections on the current line[cite: 3]. |
| `Open global Quran search modal` | Opens the full-corpus search modal with live analytics[cite: 3]. |
| `Fetch contextual tafsir for current line` | Retrieves tafsir commentary for the verse/range at the cursor[cite: 3]. |
| `Open global tafsir selection modal` | Interactive picker to choose commentary sources first, then select verse range[cite: 3]. |
| `Log selection to reflection (choose category)` | Interactive modal to pick or create a reflection category for selected text[cite: 1, 2]. |
| `Link related ayahs` | Multi-select modal to cross-link two or more related verses in frontmatter[cite: 1]. |
| `Convert Quran reference to footnote` | Converts inline `[Surah:Ayah]` to a numbered markdown footnote `[^quran1]`[cite: 3]. |
| `Remove Quran reference from line` | Strips matched Qur'anic citations from the current line[cite: 3]. |
| `Strip tashkeel from selection or line` | Removes diacritics/tashkeel from selection or active line[cite: 3]. |

---

## Custom Styling & CSS Reference

You can target plugin elements using Obsidian snippets or via the Custom CSS field in plugin settings[cite: 1, 2]:

| CSS Selector | Description |
| :--- | :--- |
| `.cm-quran-key-text` | The Qur'anic verse body inside wrapper glyphs (Editor & Live Preview)[cite: 1]. |
| `.quran-key-ornate-number` | The Arabic-Indic verse number decoration[cite: 1, 2]. |
| `.quran-key-highlight` | Highlighted matching words inside search modals[cite: 1]. |
| `.quran-key-analytics-dashboard` | The live analytics stat bar in the search modal[cite: 1]. |
| `.quran-key-picker-modal` | Modals for tafsir sources, category selection, and ayah linking[cite: 1]. |

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

In compliance with Obsidian Developer Policies[cite: 3]:

- Network Access: This plugin makes outgoing HTTPS requests to tafsir.app (or custom API endpoints configured by the user in Settings) only when a tafsir retrieval command is explicitly executed[cite: 3].
- No Telemetry / Tracking: This plugin does not collect, log, or transmit any analytics, telemetry, or user vault data[cite: 3].
- Offline First: All Qur'an text extraction, local search, normalization, and note-taking features function completely offline without internet connectivity[cite: 3].

---

## Installation

### From Obsidian Community Plugins
1. Open Settings > Community plugins[cite: 3].
2. Search for Quran Key[cite: 3].
3. Click Install, then Enable[cite: 3].

### Manual Installation
1. Download main.js, manifest.json, and styles.css from the latest [GitHub Release](https://github.com/MohamedSaleh0-0/quran-key/releases)[cite: 3].
2. Create a folder named quran-key under your vault's .obsidian/plugins/ directory[cite: 3].
3. Copy the downloaded files into .obsidian/plugins/quran-key/[cite: 3].
4. Reload Obsidian and enable Quran Key in Community Plugins settings[cite: 3].

---

## License

This project is open source and licensed under the [MIT License](LICENSE)[cite: 3].