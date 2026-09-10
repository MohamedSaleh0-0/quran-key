# Quran text source decision

## Decision

Quran Key uses Tanzil Uthmani canonical text as its bundled production corpus.
It is loaded from `data/ayahs-canonical.json` whenever the production QPC Hafs
v18 rendering profile is selected.

The bundled QPC Hafs v18 font is the rendering choice; it does not imply that
the text must be fetched from the font publisher at runtime. Keeping the
canonical text local preserves offline search, insertion, and note creation.

## Alternatives considered

Quran Foundation documents an authenticated API field named `text_qpc_hafs`,
and the Quranic Universal Library provides downloadable QPC Hafs snapshots.
Those sources were not adopted as the bundled corpus because the API adds an
authentication/network dependency and the downloadable QUL resource does not
provide sufficiently clear per-resource redistribution terms for this plugin's
offline bundle. QUL is also community-curated rather than a single Quran
Foundation canonical export.

The existing Tanzil corpus is already versioned, validated, bundled, and
licensed for redistribution under Creative Commons Attribution 3.0. Its source
identity and hashes are recorded in the generated corpus metadata.

## Deliberate boundaries

- `data/ayahs-canonical.json` is the production source.
- The canonical corpus is the only runtime text source.
- Sequential-tanween text is never used by the production profile.
- QPC V1/V2/V4 page-glyph fonts remain out of scope.
- A future source change requires a full code-point comparison, source/license
  review, importer update, and rendering regression pass.
