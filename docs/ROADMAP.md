# Quran Key Roadmap

Quran Key is intended to make the vault feel like a connected space for
Qur'an reading, reflection, and research. This roadmap separates shipped
behavior from planned work and records the design decisions that affect
vault data.

## Current baseline

- Contextual ayah extraction and local Quran search.
- Multi-source tafsir retrieval.
- Per-ayah reflection notes with configurable categories.
- Related-ayah linking through note metadata.
- Arabic normalization, Quran typography, and editing utilities.

## Phase 0 — Stabilize the foundation

- [x] Keep the automated test suite green.
- [x] Document generated vault-note formats and ownership boundaries.
- [x] Align the README, requirements, architecture notes, and release checklist
  with the implementation.
- [x] Remove stale implementation instructions and documentation artifacts.
- [x] Define acceptance behavior for lazy surah and ayah note creation.

## Surah and ayah note direction

The target experience is a complete surah note that reads like a normal
mushaf. The Quran text remains continuous; the number at the end of each
ayah is the interaction point for that ayah's note.

Ayah notes are lazy resources:

- A surah note may exist without any ayah-note files.
- An ayah note is created only when the user reaches or requests it.
- Creating an ayah note always creates or locates its parent surah note first.
- Uncreated ayah notes are not written as unresolved wikilinks, so they do not
  add unwanted nodes or edges to the graph.
- Once an ayah note exists, the plugin may materialize a real Obsidian link
  around its ayah number while preserving normal Quran styling.

## Later phases

### Phase 1 — Surah-note foundation

- [x] Create/open a surah note.
- [x] Render the complete surah as continuous Quran text.
- [x] Add lazy clickable ayah markers.
- [x] Create an ayah note on demand and connect it to its parent surah.

The surah command is available as “Open or create Quran surah note”. A newly
created surah note contains only lightweight marker spans for ayat that do not
yet have notes. Activating a marker creates the ayah note, replaces that
marker with a basename-only wikilink (no parent folder as a prefix), and opens
the note.

### Phase 1.5 — User tags and authoritative surah metadata

- [x] Add an empty `tags: []` YAML variable to generated ayah and surah notes.
- [x] Preserve user-defined tags without adding automatic taxonomy tags.
- [ ] Add an authoritative surah metadata source for Makki/Madani status.
- [ ] Add authoritative surah-group metadata such as Mufassal, Mi'in, Mathani,
  and Sab' al-Tiwal.
- [ ] Add metadata migration/repair for future optional classification fields.

The plugin provides the YAML variable only. Users own the values and may tag
ayat with concepts such as `وعيد`, `رجاء`, `نعيم*الجنة`, or `قصة*نبي`.
Makki/Madani and surah-group classifications will be added only when an
authoritative metadata source has been selected.

### Phase 2 — Research workflows

- Open the parent surah from an ayah note.
- Link reflections, tafsir, and related ayat into the relevant ayah note.
- Add safe repair and reconciliation commands for moved or renamed notes.
- [x] Build a unified “log ayah entry” modal where the user can choose an ayah,
  choose a section, and write the entry without navigating between notes.
- [x] Allow the same modal to apply an entry to an optional ayah range within
  the selected surah.
- Make the section catalog user-editable while keeping the default UI small
  and focused (for example Tadabbur, Benefits, Tafsir, and Questions).
- [x] Keep entry dates available through an optional setting; the current dated
  entry behavior already exists through the `{date}` prefix template.

When entry dates are disabled, a prefix containing `{date}` is omitted as a
whole so the default `### {date}` template cannot leave an empty heading.

The unified modal should be the main guided workflow, while direct editing of
ayah notes remains fully supported.

### Phase 3 — Quran Pedia extraction engine

The Quran Pedia is the growing, structured research layer formed by ayah
notes, their sections, surah metadata, tafsir, and links between notes. The
engine should be able to:

- Extract one named section, such as Tadabbur or Benefits, from selected ayat.
- Extract a named section from every ayah in a surah into a destination note.
- Extract all matching sections from a selected ayah range, surah, or group of
  surahs.
- Filter sources by stable tags and surah metadata such as Makki/Madani or
  Mufassal/Mathani classifications.
- Preserve the source ayah/surah link beside every extracted passage so the
  result remains navigable back to the Quran Pedia source.
- Support a deliberate choice between a snapshot export and a refreshable
  generated collection, without overwriting user prose.
- [x] Offer an optional quick section trigger using `@` while writing, which
  opens section selection without forcing a large modal workflow.
- Explore NLP-assisted suggestions for likely sections or ayat, always with
  explicit user confirmation before writing or moving content.

Before implementation, define section identity, source boundaries, duplicate
handling, destination-note ownership, refresh behavior, and how renamed or
moved notes are reconciled.

### Phase 3.5 — Optional ayah groups and topic notes

This is an advanced feature and must be disabled by default. It should only
appear in the normal command palette and guided workflows after the user
enables it from an Advanced or Power-user settings area.

Users may optionally group connected ayat inside a surah under a topic or
event note. For example, ayat 17–33 of Surah al-Qalam could be grouped under
the topic “The أصحاب الجنة story”. This grouping must be user-created; the
plugin must not infer or create topic groups automatically.

The planned group workflow should support:

- Selecting a contiguous range or a custom set of ayat within a surah.
- Creating a topic/group note with the selected Quran content displayed in
  continuous mushaf-style text.
- Linking the group note to every member ayah note, while keeping the ayah
  number as the visible interaction point.
- Showing the group/topic relationship from each member ayah note.
- Allowing a group to be organized under a broader ayah topic when the user
  wants a parent/child topic structure.
- Using the same section and extraction engine to collect Tadabbur, Benefits,
  Tafsir, or other selected sections for the grouped ayat.
- Keeping the feature optional, with no automatic group files, links, or
  graph nodes unless the user explicitly creates the group.
- Providing one clear feature toggle, defaulting to off, rather than exposing
  many group-related controls to ordinary users.

The group schema must define membership, parent topic, source surah, source
ayat, generated Quran content, user-owned content, and refresh behavior. It
must also support groups whose ayat are later split, merged, or reordered.

### Phase 4 — Research expansion

- Surah-level themes and study notes: curated concepts or headings attached to
  a surah and optionally linked to the ayat that support them.
- Thematic collections across surahs.
- Optional Quran metadata such as juz', hizb, page, and revelation context.
- Offline/local tafsir sources.

### Phase 4.5 — Settings and interaction quality

- Keep settings grouped by user goal instead of exposing every internal
  implementation detail.
- Provide concise descriptions, sensible defaults, and progressive disclosure
  for advanced options.
- Keep the existing reset-to-defaults action discoverable and safe, with a
  clear confirmation before custom settings, categories, or books are removed.
- Add validation and previews where a setting changes generated note output.
- Use progressive disclosure: basic users see the focused reflection and
  reading workflows, while scholars and power users can unlock extraction,
  grouping, metadata, and automation tools from an Advanced area.
- Keep advanced features independently toggleable, with safe defaults and no
  effect on existing notes when disabled.

### Phase 5 — Quality and distribution

- Mobile verification.
- Vault-scale performance testing.
- End-to-end Obsidian integration tests.
- User-facing migration and release documentation.
