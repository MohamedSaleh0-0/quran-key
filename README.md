# Quran Key v2

A from-scratch, Clean/Hexagonal-Architecture re-implementation of the
Quran Key Obsidian plugin: contextual Qur'an extraction, snippet
trimming, and multi-source tafsir lookup — built around one goal,
**customizability**: every tunable, catalogue, and formatting rule is
data or a setting, never a literal buried in source.

Read these first:

- **`docs/REQUIREMENTS.md`** — the full functional/non-functional spec,
  reverse-engineered from the original plugin plus the new
  customizability requirements.
- **`docs/ARCHITECTURE.md`** — the chosen methodology (Clean/Hexagonal),
  the layer map, and — most concretely — a table of every hardcoded
  literal in v1 and exactly where it lives now.

## Status

This project was written in a sandboxed environment with **no network
access**, so `npm install` was never run and nothing here has been
compiled or executed against a real Obsidian vault. What *has* been
verified:

- Every relative import across all 54+ source files resolves to a real
  file (scripted check).
- The two trickiest pieces of logic — `VerseReference`'s template
  compiler and `ArabicNormalizer`'s substitution pipeline — were
  hand-verified against the test-suite expectations via a plain-Node
  transliteration (since Vitest itself needs `npm install`).
- The 42-book tafsir catalogue and the 7 normalization rules were
  converted from v1's embedded JS array into real, UTF-8, parse-checked
  JSON (`data/tafsirBooks.json`, `data/normalizationRules.json`).

Before relying on this: run `npm install`, `npm run build` (which runs
`tsc -noEmit` first), and `npm test`, and fix anything a real TypeScript
compiler catches that this review couldn't.

## Quickstart

```bash
npm install
npm run dev     # esbuild in watch mode -> main.js
npm test        # Vitest — domain-layer unit tests, no Obsidian needed
```

Then symlink this folder into a vault's `.obsidian/plugins/quran-key/`
and enable it (see `/mnt/skills/user/obsidian-plugin-dev/references/testing-setup.md`
for the full loop, including the optional Hot Reload plugin).

## Before real use

- **Corpus**: `data/ayahs.sample.json` ships with just Al-Fatiha and
  Al-Ikhlas so the plugin runs out of the box. Replace its `ayahs` array
  with a full corpus (same shape: `surah_id`, `ayah_id`, `surah_name`,
  `text`) before relying on search/extraction across the whole Qur'an.
- **Tafsir sources**: `data/tafsirBooks.json` ships v1's 42-book
  catalogue pointed at `tafsir.app`. Add your own via Settings → Custom
  tafsir sources, or edit the JSON directly for a different default set.

## Project layout

See `docs/ARCHITECTURE.md` §3 for the annotated folder map. Short
version: `src/domain` has zero framework dependencies and is where the
actual Qur'an-text logic lives; `src/application` orchestrates it;
`src/infrastructure` and `src/presentation` are the only layers that
import `obsidian`; `src/main.ts` is the composition root.

## License

MIT (see `package.json`). The Qur'anic text sample in
`data/ayahs.sample.json` is scripture, not subject to conventional
copyright.
