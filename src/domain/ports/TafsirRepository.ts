import type { TafsirBook } from "../entities/TafsirBook";

/** Fetches commentary text for one (book, surah, ayah). The HTTP
 *  implementation is one adapter among possibly several — see
 *  docs/ARCHITECTURE.md §8 "Add a tafsir source". */
export interface TafsirRepository {
	fetchTafsir(book: TafsirBook, surahId: number, ayahId: number): Promise<string>;
}
