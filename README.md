# Quran Key

> Toolkit for Islamic studies and Quran research with verse lookup, multi-source tafsir, and reflection notes.

![Quran Key Overview Demo](docs/assets/hero-demo.gif)

---

## Features

- **Contextual Verse Extraction**: Auto-detects quotes, braces `{query}`, selections, and shorthand citations (e.g., `[البقرة:255]` or `البقرة 255-257`) directly from the cursor line.
- **Snippet Trimming & View Toggle**: Extract exact word-ranges `(من-إلى)` or invoke extraction consecutively to toggle between full ayah and snippet views.
- **Multi-Source Tafsir Engine**: Fetch commentary across 40+ classical and contemporary tafsir books with custom source support.
- **Unified Ayah Journaling**: Record reflections, benefits, and notes under dedicated headings inside a single unified note per ayah, or configure separate category folders.
- **Related Verse Linking**: Group and cross-link semantically related ayahs together via frontmatter metadata.
- **Typography & Ornate Numbering**: Integrated Uthmanic font stack (King Fahd Complex & Amiri Quran) with styled Arabic-Indic numerals in both Live Preview and Reading View.
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
| `Convert Quran reference to footnote` | Converts inline `[Surah:Ayah]` to a numbered markdown footnote `[^quran1]`. |
| `Remove Quran reference from line` | Strips matched Qur'anic citations from the current line. |
| `Strip tashkeel from selection or line` | Removes diacritics/tashkeel from selection or active line. |

---

## Custom Styling & CSS Reference

You can target plugin elements using Obsidian snippets or via the **Custom CSS** field in plugin settings:

| CSS Selector | Description |
| :--- | :--- |
| `.cm-quran-key-text` | The Qur'anic verse body inside wrapper glyphs (Editor & Live Preview). |
| `.quran-key-ornate-number` | The Arabic-Indic verse number decoration. |
| `.quran-key-highlight` | Highlighted matching words inside search modals. |
| `.quran-key-analytics-dashboard` | The live analytics stat bar in the search modal. |
| `.quran-key-picker-modal` | Modals for tafsir sources, category selection, and ayah linking. |

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