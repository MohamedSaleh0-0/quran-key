import { TFile, Vault, normalizePath } from "obsidian";
import type { TafsirBook } from "../../domain/entities/TafsirBook";
import type { TafsirRepository } from "../../domain/ports/TafsirRepository";
import { sha256Hex } from "./TafsirCacheIntegrity";

interface TafsirCacheRecord {
	schema: 2;
	bookId: string;
	surahId: number;
	ayahId: number;
	sourceFingerprint: string;
	fetchedAt: string;
	content: string;
	contentSha256: string;
}

interface LegacyTafsirCacheRecord {
	schema: 1;
	bookId: string;
	surahId: number;
	ayahId: number;
	sourceFingerprint: string;
	fetchedAt: string;
	content: string;
}

interface TafsirCachePaths {
	current: string;
	legacy: string;
}

export interface TafsirCacheSettings {
	enabled: boolean;
	folder: string;
	books?: readonly TafsirBook[];
	trashFile: (file: TFile) => Promise<void>;
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
		const paths = this.cachePaths(book, surahId, ayahId, settings.folder);
		if (settings.enabled) {
			const cached = await this.readCache(paths.current, book, surahId, ayahId);
			if (cached !== null) return cached.content;

			// Preserve caches created before filenames became descriptive. A legacy
			// hit is moved to the new path so it disappears from Bases after use.
			const legacy = await this.readCache(paths.legacy, book, surahId, ayahId);
			if (legacy !== null) {
				await this.migrateLegacyCache(paths.legacy, paths.current, legacy);
				return legacy.content;
			}
		}

		const content = await this.upstream.fetchTafsir(book, surahId, ayahId);
		if (settings.enabled && content.trim() !== "") {
			await this.writeCache(paths.current, await this.createCacheRecord(book, surahId, ayahId, content));
		}
		return content;
	}

	/** Move valid caches created by the old numeric filename scheme. */
	async migrateLegacyCaches(): Promise<void> {
		const { folder, enabled, books } = this.getSettings();
		if (!enabled) return;

		const root = normalizePath(folder.trim() || "tafsir").replace(/\/+$/, "");
		const prefix = `${root}/`;
		for (const file of this.vault.getFiles()) {
			if (!file.path.startsWith(prefix)) continue;
			const relative = file.path.slice(prefix.length).split("/");
			if (relative.length !== 3 || !/^\d+\.json$/.test(relative[2])) continue;

			try {
				const record = JSON.parse(await this.vault.read(file)) as Partial<LegacyTafsirCacheRecord>;
				const surahId = Number(relative[1]);
				const ayahId = Number(relative[2].slice(0, -5));
				if (
					record.schema !== 1 ||
					typeof record.bookId !== "string" ||
					record.surahId !== surahId ||
					record.ayahId !== ayahId ||
					typeof record.sourceFingerprint !== "string" ||
					typeof record.content !== "string"
				) continue;

				const book = books?.find((candidate) => candidate.id === record.bookId) ?? {
					id: record.bookId,
					name: record.bookId,
					aliases: [],
					urlTemplate: record.sourceFingerprint,
					isBuiltin: false,
				};
				const paths = this.cachePaths(book, surahId, ayahId, folder);
				if (paths.legacy !== file.path || this.vault.getAbstractFileByPath(paths.current)) continue;
				await this.migrateLegacyCache(file.path, paths.current, record as LegacyTafsirCacheRecord);
			} catch {
				// Ignore unrelated or malformed JSON files in the cache folder.
			}
		}
	}

	private async readCache(path: string, book: TafsirBook, surahId: number, ayahId: number): Promise<TafsirCacheRecord | null> {
		const file = this.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return null;
		try {
			const record = JSON.parse(await this.vault.read(file)) as Partial<TafsirCacheRecord>;
			if (
				record.schema !== 2 ||
				record.bookId !== book.id ||
				record.surahId !== surahId ||
				record.ayahId !== ayahId ||
				record.sourceFingerprint !== book.urlTemplate ||
				typeof record.content !== "string" ||
				typeof record.contentSha256 !== "string"
			) {
				return null;
			}
			if (record.contentSha256 !== await sha256Hex(record.content)) return null;
			return record as TafsirCacheRecord;
		} catch {
			return null;
		}
	}

	private async migrateLegacyCache(oldPath: string, newPath: string, record: LegacyTafsirCacheRecord | TafsirCacheRecord): Promise<void> {
		const oldFile = this.vault.getAbstractFileByPath(oldPath);
		if (!(oldFile instanceof TFile)) return;

		const book: TafsirBook = {
			id: record.bookId,
			name: record.bookId,
			aliases: [],
			urlTemplate: record.sourceFingerprint,
			isBuiltin: false,
		};
		const upgraded = await this.createCacheRecord(book, record.surahId, record.ayahId, record.content, record.fetchedAt);
		await this.writeCache(newPath, upgraded);
		try {
			await this.getSettings().trashFile(oldFile);
		} catch {
			// The upgraded cache is already safe to use if trash is unavailable.
		}
	}

	private async createCacheRecord(
		book: TafsirBook,
		surahId: number,
		ayahId: number,
		content: string,
		fetchedAt = new Date().toISOString()
	): Promise<TafsirCacheRecord> {
		return {
			schema: 2,
			bookId: book.id,
			surahId,
			ayahId,
			sourceFingerprint: book.urlTemplate,
			fetchedAt,
			content,
			contentSha256: await sha256Hex(content),
		};
	}

	private async writeCache(path: string, record: TafsirCacheRecord): Promise<void> {
		await this.ensureFolder(path.slice(0, path.lastIndexOf("/")));
		const existing = this.vault.getAbstractFileByPath(path);
		const serialized = JSON.stringify(record, null, 2);
		if (existing instanceof TFile) await this.vault.process(existing, () => serialized);
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

	private cachePaths(book: TafsirBook, surahId: number, ayahId: number, folder: string): TafsirCachePaths {
		const root = normalizePath(folder.trim() || "tafsir").replace(/\/+$/, "");
		const safeBookId = this.safeFilePart(book.id, "book");
		const safeBookName = this.safeFilePart(book.name, safeBookId);
		const directory = `${root}/${safeBookId}/${surahId}`;
		const descriptiveName = `tafsir-cache-${safeBookName}-${safeBookId}-surah-${surahId}-ayah-${ayahId}.json`;
		return {
			current: normalizePath(`${directory}/${descriptiveName}`),
			legacy: normalizePath(`${directory}/${ayahId}.json`),
		};
	}

	private safeFilePart(value: string, fallback: string): string {
		const safe = value
			.trim()
			.replace(/[^a-zA-Z0-9\u0600-\u06ff_-]+/g, "-")
			.replace(/^-+|-+$/g, "");
		return safe || fallback;
	}
}
