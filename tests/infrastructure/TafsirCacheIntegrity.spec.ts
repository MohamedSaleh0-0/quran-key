import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => {
	class FakeTFile {
		constructor(public path: string, public content: string) {}
	}
	return {
		TFile: FakeTFile,
		Vault: class {},
		normalizePath: (path: string) => path.replace(/\\/g, "/"),
	};
});

import { TFile } from "obsidian";
import { VaultTafsirRepository } from "../../src/infrastructure/obsidian/VaultTafsirRepository";
import { sha256Hex } from "../../src/infrastructure/obsidian/TafsirCacheIntegrity";

if (typeof window === "undefined") {
	Object.defineProperty(globalThis, "window", { value: { crypto: globalThis.crypto } });
}

class MemoryVault {
	readonly files = new Map<string, InstanceType<typeof TFile>>();

	getAbstractFileByPath(path: string): InstanceType<typeof TFile> | null {
		return this.files.get(path) ?? null;
	}

	getFiles(): InstanceType<typeof TFile>[] {
		return Array.from(this.files.values());
	}

	async read(file: InstanceType<typeof TFile>): Promise<string> {
		return file.content;
	}

	async create(path: string, content: string): Promise<InstanceType<typeof TFile>> {
		const file = new TFile(path, content);
		this.files.set(path, file);
		return file;
	}

	async createFolder(_path: string): Promise<void> {}

	async process(file: InstanceType<typeof TFile>, transform: (content: string) => string): Promise<void> {
		file.content = transform(file.content);
	}

	async trash(file: InstanceType<typeof TFile>, _system: boolean): Promise<void> {
		this.files.delete(file.path);
	}
}

describe("VaultTafsirRepository cache integrity", () => {
	let vault: MemoryVault;

	beforeEach(() => {
		vault = new MemoryVault();
	});

	it("computes standard SHA-256 hex digests", async () => {
		expect(await sha256Hex("hello")).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
	});

	it("stores a checksum and refetches when cached content is edited", async () => {
		const book = {
			id: "tabari",
			name: "Tabari",
			aliases: [],
			urlTemplate: "https://example.test/{bookId}/{surahId}/{ayahId}",
			isBuiltin: true,
		};
		const upstream = {
			fetchTafsir: vi.fn().mockResolvedValueOnce("original").mockResolvedValueOnce("fresh"),
		};
		const repository = new VaultTafsirRepository(
			vault as never,
			upstream,
			() => ({ enabled: true, folder: "tafsir", books: [book], trashFile: async (file) => vault.trash(file, true) })
		);

		await repository.fetchTafsir(book, 2, 255);
		const path = "tafsir/tabari/2/tafsir-cache-Tabari-tabari-surah-2-ayah-255.json";
		const file = vault.files.get(path);
		expect(file).toBeDefined();
		const record = JSON.parse(file!.content) as { content: string; contentSha256: string };
		expect(record.contentSha256).toBe(await sha256Hex("original"));

		record.content = "edited by mistake";
		file!.content = JSON.stringify(record);
		await expect(repository.fetchTafsir(book, 2, 255)).resolves.toBe("fresh");
		expect(upstream.fetchTafsir).toHaveBeenCalledTimes(2);
		expect(JSON.parse(file!.content).contentSha256).toBe(await sha256Hex("fresh"));
	});
});
