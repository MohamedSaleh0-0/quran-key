/** A single Qur'anic verse from the loaded corpus. */
export interface Ayah {
	/** Stable sequential id assigned at load time (position in the corpus). */
	readonly id: number;
	readonly surahId: number;
	readonly ayahId: number;
	readonly surahName: string;
	readonly text: string;
	/** Bismillah rendered before the first ayah in surahs where Tanzil stores it separately. */
	readonly bismillah?: string;
}
