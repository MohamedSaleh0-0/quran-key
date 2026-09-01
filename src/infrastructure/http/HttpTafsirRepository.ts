import { requestUrl } from "obsidian";
import type { TafsirBook } from "../../domain/entities/TafsirBook";
import type { TafsirRepository } from "../../domain/ports/TafsirRepository";

interface TafsirApiResponse {
	data?: string;
}

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
		if (response.status === 200 && response.json) {
			const json = response.json as TafsirApiResponse;
			if (json.data) {
				const text = String(json.data);
				this.cache.set(key, text);
				return text;
			}
		}
		return "";
	}
}