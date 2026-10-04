import { TFile, Vault, normalizePath } from "obsidian";
import type { TafsirBook } from "../../domain/entities/TafsirBook";
import type { TafsirRepository } from "../../domain/ports/TafsirRepository";

interface TafsirCacheRecord {
	schema: 1;
	bookId: string;
	surahId: number;
	ayahId: number;
	sourceFingerprint: string;
	fetchedAt: string;
	content: string;
}

export interface TafsirCacheSettings {
	enabled: boolean;
	folder: string;
}

/** Persistent vault-backed decorator. The upstream repository remains the
 * network source; this adapter only changes where successful responses are
 * read from and written to. */
export class VaultTafsirRepository implements TafsirRepository {
	constructor(
		private readonly vault: Vault,
		private readonly upstream: TafsirRepository,
		private readonly getSettings: () => TafsirCacheSettings
	) {}

	async fetchTafsir(book: TafsirBook, surahId: number, ayahId: number): Promise<string> {
		const settings = this.getSettings();
		const path = this.cachePath(book, surahId, ayahId, settings.folder);
		if (settings.enabled) {
			const cached = await this.readCache(path, book, surahId, ayahId);
			if (cached !== null) return cached;
		}

		const content = await this.upstream.fetchTafsir(book, surahId, ayahId);
		if (settings.enabled && content.trim() !== "") {
			await this.writeCache(path, {
				schema: 1,
				bookId: book.id,
				surahId,
				ayahId,
				sourceFingerprint: book.urlTemplate,
				fetchedAt: new Date().toISOString(),
				content,
			});
		}
		return content;
	}

	private async readCache(path: string, book: TafsirBook, surahId: number, ayahId: number): Promise<string | null> {
		const file = this.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return null;
		try {
			const record = JSON.parse(await this.vault.read(file)) as Partial<TafsirCacheRecord>;
			if (
				record.schema !== 1 ||
				record.bookId !== book.id ||
				record.surahId !== surahId ||
				record.ayahId !== ayahId ||
				record.sourceFingerprint !== book.urlTemplate ||
				typeof record.content !== "string"
			) {
				return null;
			}
			return record.content;
		} catch {
			return null;
		}
	}

	private async writeCache(path: string, record: TafsirCacheRecord): Promise<void> {
		await this.ensureFolder(path.slice(0, path.lastIndexOf("/")));
		const existing = this.vault.getAbstractFileByPath(path);
		const serialized = JSON.stringify(record, null, 2);
		if (existing instanceof TFile) await this.vault.modify(existing, serialized);
		else await this.vault.create(path, serialized);
	}

	private async ensureFolder(folderPath: string): Promise<void> {
		const normalized = normalizePath(folderPath).replace(/\\/g, "/").replace(/\/+$/, "");
		if (!normalized || this.vault.getAbstractFileByPath(normalized)) return;
		let current = "";
		for (const segment of normalized.split("/").filter(Boolean)) {
			current = current ? `${current}/${segment}` : segment;
			if (!this.vault.getAbstractFileByPath(current)) {
				try {
					await this.vault.createFolder(current);
				} catch {
					// Another write may have created the folder concurrently.
				}
			}
		}
	}

	private cachePath(book: TafsirBook, surahId: number, ayahId: number, folder: string): string {
		const root = normalizePath(folder.trim() || "tafsir").replace(/\/+$/, "");
		const safeBookId = book.id.replace(/[^a-zA-Z0-9\u0600-\u06ff_-]/g, "-");
		return normalizePath(`${root}/${safeBookId}/${surahId}/${ayahId}.json`);
	}
}
