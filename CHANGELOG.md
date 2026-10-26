# Changelog

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
