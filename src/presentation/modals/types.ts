import type { Ayah } from "../../domain/entities/Ayah";

/** Callback used when a search/range-end modal is opened in "pick a verse
 *  for tafsir" mode instead of its default "insert a verse" mode — see
 *  QuranSearchModal's doc comment. */
export type VerseSelectHandler = (ayahs: Ayah[]) => void | Promise<void>;
