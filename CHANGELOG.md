# Changelog

## 2.1.1

### Improved

- Compress the bundled Quran and root search data so `main.js` stays below Obsidian Sync's 5 MB per-file limit while remaining available offline.
- Expose plugin settings to Obsidian's settings search and replace the browser confirmation prompt with an Obsidian modal.
- Restore type-aware linting for modern JavaScript APIs.

## 2.1.0

### Added

- Root-based Quran search, with Quranic morphology and matching word highlights.
- Paginated global search results with a “Show more” control.

### Improved

- Arabic matching handles attached proclitics, Uthmani spelling variants, and live prefixes more consistently.
- Verse range suggestions use the configured Quran search strategy.
- Failed snippet ranges no longer silently insert the full ayah, and snippet/full-ayah replacements have separate undo steps.

### Data attribution

- Root search includes morphology data from the Quranic Arabic Corpus, version 0.4, copyright © 2011 Kais Dukes. The upstream annotation source and its copyright notice are preserved in `data/vendor`; see <https://corpus.quran.com/download/>.
