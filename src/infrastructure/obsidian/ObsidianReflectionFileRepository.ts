import { TFile, TFolder, normalizePath } from "obsidian";
import type { App } from "obsidian";
import type { ReflectionCategory } from "../../domain/entities/ReflectionCategory";
import type { ReflectionFileEntry, ReflectionFileRepository } from "../../domain/ports/ReflectionFileRepository";

function sanitizeFileNameSegment(segment: string): string {
	return segment.replace(/[\\/:*?"<>|]/g, "").trim();
}

export class ObsidianReflectionFileRepository implements ReflectionFileRepository {
	constructor(private readonly app: App) {}

	async appendEntry(category: ReflectionCategory, entry: ReflectionFileEntry): Promise<void> {
		await this.ensureFolder(category.folder);

		const existing = this.findExistingFile(category.folder, entry.surahId, entry.ayahId);
		if (existing) {
			await this.app.vault.process(existing, (current) => {
				return `${current.trim()}\n\n---\n\n${entry.entryMarkdown}\n`;
			});
			return;
		}

		const path = this.uniquePath(category.folder, entry.fileTitle);
		const frontmatter = [
			"---",
			`surah: "${entry.surahName}"`,
			`surahId: ${entry.surahId}`,
			`ayah: ${entry.ayahId}`,
			`category: ${category.id}`,
			"---",
			"",
			"",
		].join("\n");
		await this.app.vault.create(path, `${frontmatter}${entry.entryMarkdown}\n`);
	}

	private findExistingFile(folderPath: string, surahId: number, ayahId: number): TFile | null {
		const folder = this.app.vault.getAbstractFileByPath(normalizePath(folderPath));
		if (!(folder instanceof TFolder)) return null;
		for (const child of folder.children) {
			if (!(child instanceof TFile) || child.extension !== "md") continue;
			const frontmatter = this.app.metadataCache.getFileCache(child)?.frontmatter;
			if (frontmatter?.surahId === surahId && frontmatter?.ayah === ayahId) return child;
		}
		return null;
	}

	private uniquePath(folderPath: string, title: string): string {
		const base = sanitizeFileNameSegment(title) || "تدبر";
		let candidate = normalizePath(`${folderPath}/${base}.md`);
		let suffix = 2;
		while (this.app.vault.getAbstractFileByPath(candidate)) {
			candidate = normalizePath(`${folderPath}/${base} (${suffix}).md`);
			suffix++;
		}
		return candidate;
	}

	private async ensureFolder(folderPath: string): Promise<void> {
		const normalized = normalizePath(folderPath);
		if (this.app.vault.getAbstractFileByPath(normalized)) return;

		const segments = normalized.split("/").filter(Boolean);
		let current = "";
		for (const segment of segments) {
			current = current ? `${current}/${segment}` : segment;
			if (!this.app.vault.getAbstractFileByPath(current)) {
				try {
					await this.app.vault.createFolder(current);
				} catch {
					// Benign race
				}
			}
		}
	}
}