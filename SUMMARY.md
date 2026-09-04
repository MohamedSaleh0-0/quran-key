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
