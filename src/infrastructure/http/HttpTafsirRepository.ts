import { requestUrl } from "obsidian";
import type { TafsirBook } from "../../domain/entities/TafsirBook";
import type { TafsirRepository } from "../../domain/ports/TafsirRepository";

/**
 * Fetches tafsir over HTTP via Obsidian's `requestUrl` (works on mobile,
 * unlike a raw `fetch` to arbitrary origins). Each book carries its own
 * `urlTemplate` (see TafsirBook / NFR-1), so this class has no knowledge
 * of any specific tafsir provider — a user-added custom source needs no
 * code change here. In-memory cache avoids re-fetching the same
 * (book, surah, ayah) within a session (FR-22).
 */
export class HttpTafsirRepository implements TafsirRepository {
	private readonly cache = new Map<string, string>();

	async fetchTafsir(book: TafsirBook, surahId: number, ayahId: number): Promise<string> {
		const key = `${book.id}_${surahId}_${ayahId}`;
		const cached = this.cache.get(key);
		if (cached !== undefined) return cached;

		const url = book.urlTemplate
			.replace("{bookId}", encodeURIComponent(book.id))
			.replace("{surahId}", String(surahId))
			.replace("{ayahId}", String(ayahId));

		const response = await requestUrl({ url });
		if (response.status === 200 && response.json && response.json.data) {
			const text = String(response.json.data);
			this.cache.set(key, text);
			return text;
		}
		return "";
	}
}
