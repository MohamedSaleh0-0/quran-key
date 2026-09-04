import { TFile, TFolder, normalizePath } from "obsidian";
import type { App } from "obsidian";
import type { ReflectionCategory } from "../../domain/entities/ReflectionCategory";
import type {
	AyahIdentity,
	AyahNoteRef,
	AyahNoteRepository,
	ReflectionEntryFormatting,
} from "../../domain/ports/AyahNoteRepository";
import { HeadingSectionInserter } from "../../domain/services/HeadingSectionInserter";
import { ReflectionFileNameBuilder } from "../../domain/services/ReflectionFileNameBuilder";

function sanitizeFileNameSegment(segment: string): string {
	return segment.replace(/[\\/:*?"<>|]/g, "").trim();
}

/** Everything this adapter needs from settings, read live (not captured
 *  at construction) so a Settings-tab change takes effect on the very
 *  next write without a full services rebuild. */
export interface AyahNoteSettingsSource {
	ayahNotesFolder: string;
	reflectionFileNameAyahTextMaxLength: number;
}

export class ObsidianAyahNoteRepository implements AyahNoteRepository {
	constructor(private readonly app: App, private readonly getSettings: () => AyahNoteSettingsSource) {}

	async appendEntry(
		identity: AyahIdentity,
		ancestorChain: readonly ReflectionCategory[],
		entryMarkdown: string,
		formatting: ReflectionEntryFormatting
	): Promise<AyahNoteRef> {
		const leaf = ancestorChain[ancestorChain.length - 1];
		if (leaf.organizationMode === "ownFolder") {
			return this.appendToOwnFolderNote(identity, ancestorChain, entryMarkdown, formatting);
		}
		return this.appendToUnifiedNote(identity, ancestorChain, entryMarkdown, formatting);
	}

	async linkRelatedAyat(
		identity: AyahIdentity,
		fileNameTemplate: string,
		includeAyahText: boolean,
		relatedNoteTitles: readonly string[]
	): Promise<AyahNoteRef> {
		const file = await this.findOrCreateUnifiedNote(identity, fileNameTemplate, includeAyahText);
		await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			const existing = Array.isArray(fm.relatedAyat) ? (fm.relatedAyat as string[]) : [];
			const merged = new Set(existing);
			for (const title of relatedNoteTitles) merged.add(`[[${title}]]`);
			fm.relatedAyat = Array.from(merged);
		});
		return { title: file.basename };
	}

	async resolveUnifiedNoteTitle(
		identity: AyahIdentity,
		fileNameTemplate: string,
		includeAyahText: boolean,
		createIfMissing: boolean
	): Promise<string | null> {
		if (!createIfMissing) {
			return this.findExistingUnifiedFile(identity.surahId, identity.ayahId)?.basename ?? null;
		}
		const file = await this.findOrCreateUnifiedNote(identity, fileNameTemplate, includeAyahText);
		return file.basename;
	}

	// --- unified note ---

	private async appendToUnifiedNote(
		identity: AyahIdentity,
		ancestorChain: readonly ReflectionCategory[],
		entryMarkdown: string,
		formatting: ReflectionEntryFormatting
	): Promise<AyahNoteRef> {
		const file = await this.findOrCreateUnifiedNote(identity, formatting.fileNameTemplate, formatting.includeAyahText);
		await this.ensureAncestorHeadings(file, ancestorChain);
		const leaf = ancestorChain[ancestorChain.length - 1];
		const parent = ancestorChain.length > 1 ? ancestorChain[ancestorChain.length - 2] : null;
		await this.app.vault.process(file, (current) =>
			HeadingSectionInserter.insertEntry(
				current,
				{
					headingLevel: leaf.headingLevel,
					headingText: leaf.headingText,
					parentHeadingLevel: parent?.headingLevel ?? null,
					parentHeadingText: parent?.headingText ?? null,
					insertionMode: formatting.insertionMode,
					separator: formatting.entrySeparator,
				},
				entryMarkdown
			)
		);
		return { title: file.basename };
	}

	private async ensureAncestorHeadings(file: TFile, chain: readonly ReflectionCategory[]): Promise<void> {
		for (let i = 0; i < chain.length; i++) {
			const node = chain[i];
			const parent = i > 0 ? chain[i - 1] : null;
			await this.app.vault.process(file, (current) =>
				HeadingSectionInserter.ensureHeadingExists(
					current,
					node.headingLevel,
					node.headingText,
					parent?.headingLevel ?? null,
					parent?.headingText ?? null
				)
			);
		}
	}

	private findExistingUnifiedFile(surahId: number, ayahId: number): TFile | null {
		const folder = this.app.vault.getAbstractFileByPath(normalizePath(this.getSettings().ayahNotesFolder));
		if (!(folder instanceof TFolder)) return null;
		for (const child of folder.children) {
			if (!(child instanceof TFile) || child.extension !== "md") continue;
			const fm = this.app.metadataCache.getFileCache(child)?.frontmatter;
			if (fm?.surahId === surahId && fm?.ayah === ayahId) return child;
		}
		return null;
	}

	private async findOrCreateUnifiedNote(identity: AyahIdentity, fileNameTemplate: string, includeAyahText: boolean): Promise<TFile> {
		const existing = this.findExistingUnifiedFile(identity.surahId, identity.ayahId);
		if (existing) return existing;

		const settings = this.getSettings();
		await this.ensureFolder(settings.ayahNotesFolder);
		const title = new ReflectionFileNameBuilder(fileNameTemplate, settings.reflectionFileNameAyahTextMaxLength).build(
			identity.surahName,
			identity.ayahId,
			identity.ayahTextRaw
		);
		const path = this.uniquePath(settings.ayahNotesFolder, title);
		const frontmatter = [
			"---",
			`surah: "${identity.surahName}"`,
			`surahId: ${identity.surahId}`,
			`ayah: ${identity.ayahId}`,
			"relatedAyat: []",
			"---",
			"",
			"",
		].join("\n");
		const body = includeAyahText ? `${identity.ayahTextBodyFormatted}\n\n` : "";
		return this.app.vault.create(path, `${frontmatter}${body}`);
	}

	// --- own-folder note (opt-in per category) ---

	private async appendToOwnFolderNote(
		identity: AyahIdentity,
		ancestorChain: readonly ReflectionCategory[],
		entryMarkdown: string,
		formatting: ReflectionEntryFormatting
	): Promise<AyahNoteRef> {
		const category = ancestorChain[ancestorChain.length - 1];
		const unified = await this.findOrCreateUnifiedNote(identity, formatting.fileNameTemplate, formatting.includeAyahText);
		const ownFile = await this.findOrCreateOwnFolderNote(category, identity, formatting.fileNameTemplate, unified.basename);

		await this.app.vault.process(ownFile, (current) => {
			const trimmed = current.replace(/\s+$/, "");
			return trimmed.length > 0 ? `${trimmed}${formatting.entrySeparator}${entryMarkdown}\n` : `${entryMarkdown}\n`;
		});

		// Keep the unified note as "the reference": ensure a single link
		// line to the own-folder note sits under this category's heading
		// there too (idempotent — safe to call on every entry).
		await this.ensureAncestorHeadings(unified, ancestorChain);
		const parent = ancestorChain.length > 1 ? ancestorChain[ancestorChain.length - 2] : null;
		await this.app.vault.process(unified, (current) =>
			HeadingSectionInserter.ensureLinkLine(
				current,
				{
					headingLevel: category.headingLevel,
					headingText: category.headingText,
					parentHeadingLevel: parent?.headingLevel ?? null,
					parentHeadingText: parent?.headingText ?? null,
					insertionMode: "afterHeading",
					separator: formatting.entrySeparator,
				},
				`[[${ownFile.basename}]]`
			)
		);

		return { title: ownFile.basename };
	}

	private findExistingOwnFolderFile(category: ReflectionCategory, surahId: number, ayahId: number): TFile | null {
		const folder = this.app.vault.getAbstractFileByPath(normalizePath(category.folder));
		if (!(folder instanceof TFolder)) return null;
		for (const child of folder.children) {
			if (!(child instanceof TFile) || child.extension !== "md") continue;
			const fm = this.app.metadataCache.getFileCache(child)?.frontmatter;
			if (fm?.surahId === surahId && fm?.ayah === ayahId && fm?.category === category.id) return child;
		}
		return null;
	}

	private async findOrCreateOwnFolderNote(
		category: ReflectionCategory,
		identity: AyahIdentity,
		fileNameTemplate: string,
		unifiedTitle: string
	): Promise<TFile> {
		const existing = this.findExistingOwnFolderFile(category, identity.surahId, identity.ayahId);
		if (existing) return existing;

		const settings = this.getSettings();
		await this.ensureFolder(category.folder);
		const title = new ReflectionFileNameBuilder(fileNameTemplate, settings.reflectionFileNameAyahTextMaxLength).build(
			identity.surahName,
			identity.ayahId,
			identity.ayahTextRaw
		);
		const path = this.uniquePath(category.folder, title);
		const frontmatter = [
			"---",
			`surah: "${identity.surahName}"`,
			`surahId: ${identity.surahId}`,
			`ayah: ${identity.ayahId}`,
			`category: ${category.id}`,
			`ayahNote: "[[${unifiedTitle}]]"`,
			"---",
			"",
			"",
		].join("\n");
		return this.app.vault.create(path, frontmatter);
	}

	// --- shared file helpers (same as v1's ObsidianReflectionFileRepository) ---

	private uniquePath(folderPath: string, title: string): string {
		const base = sanitizeFileNameSegment(title) || "آية";
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
