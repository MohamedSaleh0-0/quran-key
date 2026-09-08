# Quran Key Vault-Note Schema

This document describes the notes that Quran Key creates and the parts of
those notes that the plugin is allowed to change.

The schema is a contract for plugin-generated metadata and links. Users may
write their own prose, headings, tags, and research underneath the generated
content unless a section is explicitly marked as plugin-managed.

## Note types

### Surah note

One note represents one complete surah.

```yaml
---
type: quran-surah
quranKeySchema: 1
tags: []
surahId: 1
surahName: الفاتحة
ayahCount: 7
---
```

The body contains the complete surah as continuous Quran text. It is not a
list with one paragraph per ayah. Ayah numbers are the interaction points for
opening the corresponding ayah notes.

The user may add notes before or after the Quran text. Quran Key must preserve
that material when refreshing or repairing the generated text.

### Ayah note

One note represents one ayah and is always attached to a surah note.

```yaml
---
type: quran-ayah
quranKeySchema: 1
tags: []
surahId: 1
surahName: الفاتحة
ayahId: 1
surahNote: "[[الفاتحة]]"
---
```

The body may contain the ayah text, reflections, benefits, tafsir, and other
user research. An ayah note must not be created as a standalone note.

The `tags` field is intentionally initialized as an empty YAML list. Quran
Key does not automatically add, remove, or interpret user tags. Users may
add tags such as `وعيد`, `رجاء`, `نعيم*الجنة`, or `قصة*نبي`; future surah
metadata support may provide optional fields or tags for classifications such
as Makki/Madani and Mufassal, Mi'in, Mathani, or Sab' al-Tiwal.

### Future ayah-group/topic note

The planned optional group note represents a user-selected connected passage,
such as ayat 17–33 of Surah al-Qalam. It will contain the selected Quran text
and maintain links to its member ayah notes. Member ayah notes may link back
to the group, and the group may optionally sit under a broader topic. Group
creation is always explicit; no groups or group links are generated merely
because ayat appear related. The feature is intended for advanced users and
must be disabled by default so it does not complicate the basic workflow.

## Lazy creation and graph behavior

Creating a surah note does not create all ayah-note files. It also does not
write unresolved wikilinks for ayahs that the user has not reached.

Before an ayah note exists, Quran Key uses a plugin-rendered lazy marker at
the ayah number. Clicking it creates the ayah note, ensures the parent surah
note exists, and opens the ayah note. After creation, the plugin can write a
real Obsidian link using only the note basename around the ayah number. The
configured folders are used for locating and creating files, but are not
included in generated links. This provides the desired graph relationship
only after the user has created or used that ayah note.

The exact internal marker is an implementation detail and must not be relied
on by users or other plugins. Generated wikilinks intentionally use note
basenames rather than folder-qualified paths.

## Ownership rules

Quran Key owns:

- The identifying frontmatter fields shown above.
- The generated Quran text in a surah note.
- The parent relationship between an ayah note and its surah note.
- Any explicitly marked generated link or index section.

The user owns:

- Personal prose and study notes.
- Custom headings outside marked generated sections.
- Tags and other unrelated frontmatter.

The plugin must never silently delete user content during a refresh,
migration, rename, or repair operation.

## What `quranKeySchema` means

`quranKeySchema` is an internal format version. It is not a Quran property
and it does not change how the note is displayed. If the note format changes
in a future release, the plugin can use this number to recognize older notes
and migrate them safely instead of guessing from filenames or prose.

It should only be incremented when the generated note structure changes and a
migration path has been defined.
