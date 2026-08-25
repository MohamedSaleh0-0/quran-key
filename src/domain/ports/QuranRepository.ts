import type { Ayah } from "../entities/Ayah";

/** How the domain/application layers access the Qur'an corpus. Implemented
 *  once against Obsidian's bundled data today (ObsidianQuranRepository);
 *  could equally be backed by a vault file or a remote source later
 *  without any use case changing. */
export interface QuranRepository {
	loadAll(): Promise<void>;
	getAllAyahs(): readonly Ayah[];
	/** Normalized, space-joined text of the whole corpus (in the same
	 *  order as getAllAyahs()) for sliding-window substring search. */
	getSearchCorpusText(): string;
	findSurahByName(normalizedSurahName: string): { id: number; name: string } | null;
	findAyah(surahId: number, ayahId: number): Ayah | null;
}
