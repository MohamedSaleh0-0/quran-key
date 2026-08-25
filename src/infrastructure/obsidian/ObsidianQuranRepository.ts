import type { Vault } from "obsidian";
import type { Ayah } from "../../domain/entities/Ayah";
import type { QuranRepository } from "../../domain/ports/QuranRepository";
import type { ArabicNormalizer } from "../../domain/services/ArabicNormalizer";
import sampleCorpus from "../../../data/ayahs.json";
// src/infrastructure/obsidian/ObsidianQuranRepository.ts

interface RawAyah {
	surah_id: number;
	ayah_id: number;
	surah_name: string;
	text: string;
	page?: number;
}

export class ObsidianQuranRepository implements QuranRepository {
	private ayahs: Ayah[] = [];
	private searchCorpusText = "";

	constructor(private readonly vault: Vault, private readonly normalizer: ArabicNormalizer) {
		void this.vault;
	}

	async loadAll(): Promise<void> {
		if (this.ayahs.length > 0) return;

		// Supports both top-level array [...] and wrapped { ayahs: [...] }
		const raw: RawAyah[] = Array.isArray(sampleCorpus)
			? (sampleCorpus as unknown as RawAyah[])
			: (sampleCorpus as unknown as { ayahs: RawAyah[] }).ayahs;

		this.ayahs = raw.map((a, index) => ({
			id: index + 1,
			surahId: a.surah_id,
			ayahId: a.ayah_id,
			surahName: a.surah_name,
			text: a.text,
		}));

		this.searchCorpusText = this.ayahs
			.map((a) => this.normalizer.normalizeForSearch(a.text))
			.join(" @@@ ");
	}

	getAllAyahs(): readonly Ayah[] {
		return this.ayahs;
	}

	getSearchCorpusText(): string {
		return this.searchCorpusText;
	}

	findSurahByName(normalizedSurahName: string): { id: number; name: string } | null {
		const sample = this.ayahs.find((a) => this.normalizer.normalizeForSearch(a.surahName) === normalizedSurahName);
		return sample ? { id: sample.surahId, name: sample.surahName } : null;
	}

	findAyah(surahId: number, ayahId: number): Ayah | null {
		return this.ayahs.find((a) => a.surahId === surahId && a.ayahId === ayahId) ?? null;
	}
}