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

![Reflection Linking Demo](docs/assets/reflection-demo.gif)

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