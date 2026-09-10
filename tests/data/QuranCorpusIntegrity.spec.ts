import { describe, expect, it } from "vitest";
import canonicalCorpus from "../../data/ayahs-canonical.json";

interface RawCorpus {
	source: {
		provider: string;
		displayProfile: string;
		runtimeRole: string;
	};
	ayahs: Array<{ surah_id: number; ayah_id: number; text: string; surah_name: string }>;
}

function assertCorpusShape(corpus: RawCorpus): void {
	expect(corpus.ayahs).toHaveLength(6236);
	expect(new Set(corpus.ayahs.map((ayah) => ayah.surah_id)).size).toBe(114);
	for (let index = 0; index < corpus.ayahs.length; index += 1) {
		const ayah = corpus.ayahs[index];
		expect(ayah.surah_id).toBeGreaterThanOrEqual(1);
		expect(ayah.surah_id).toBeLessThanOrEqual(114);
		expect(ayah.ayah_id).toBeGreaterThan(0);
		expect(ayah.text.length).toBeGreaterThan(0);
		expect(ayah.surah_name.length).toBeGreaterThan(0);
		if (index > 0) {
			const previous = corpus.ayahs[index - 1];
			if (ayah.surah_id === previous.surah_id) expect(ayah.ayah_id).toBe(previous.ayah_id + 1);
			else expect(ayah.surah_id).toBe(previous.surah_id + 1);
		}
	}
}

describe("bundled Quran corpus integrity", () => {
	it("keeps the canonical corpus as the production source", () => {
		const corpus = canonicalCorpus as unknown as RawCorpus;
		assertCorpusShape(corpus);
		expect(corpus.source.provider).toBe("Tanzil Project");
		expect(corpus.source.displayProfile).toBe("canonical-uthmani");
		expect(corpus.source.runtimeRole).toBe("production");
	});

	it("omits the unsupported U+06DF mark from production text", () => {
		const corpus = canonicalCorpus as unknown as RawCorpus;
		expect(corpus.ayahs.some((ayah) => ayah.text.includes("\u06DF"))).toBe(false);
	});
});
