import { TFile, TFolder, normalizePath } from "obsidian";
import type { App } from "obsidian";
import type { ReflectionCategory } from "../../domain/entities/ReflectionCategory";
import type { ReflectionFileEntry, ReflectionFileRepository } from "../../domain/ports/ReflectionFileRepository";

/** Characters invalid (or awkward) in filenames across Windows/macOS/Linux. */
function sanitizeFileNameSegment(segment: string): string {
	return segment.replace(/[\\/:*?"<>|]/g, "").trim();
}

/**
 * One note per (category, surah, ayah), e.g. "تدبرات/... .md" — first
 * link to an ayah creates the file (with frontmatter identifying which
 * ayah it is), every later one appends a new dated entry to it.
 *
 * File *identity* is the (surahId, ayah) pair in frontmatter, deliberately
 * not the filename — see ReflectionFileNameBuilder's doc comment — so
 * changing settings.reflectionFileNameTemplate later still finds and
 * appends to the same file instead of spawning a duplicate under the new
 * title.
 */
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
		// Extremely unlikely (two different ayahs producing an identical
		// truncated title), but avoid silently overwriting if it happens.
		while (this.app.vault.getAbstractFileByPath(candidate)) {
			candidate = normalizePath(`${folderPath}/${base} (${suffix}).md`);
			suffix++;
		}
		return candidate;
	}

	/** Obsidian's `createFolder` fails if the parent segment doesn't exist
	 *  yet, and has no recursive option — walk the path one segment at a
	 *  time, creating whatever's missing. */
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
				} catch (_error) {
					// Benign race (e.g. another call just created it) — the
					// getAbstractFileByPath check on the next segment (or the
					// caller's own path) is what actually matters.
				}
			}
		}
	}
}