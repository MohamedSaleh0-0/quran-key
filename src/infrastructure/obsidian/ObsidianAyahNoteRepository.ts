import { TFile, TFolder, normalizePath } from "obsidian";
import type { App } from "obsidian";
import type { Ayah } from "../../domain/entities/Ayah";
import type { ReflectionCategory } from "../../domain/entities/ReflectionCategory";
import type {
	AyahIdentity,
	AyahNoteRef,
	AyahNoteRepository,
	AyahSectionExtraction,
	ReflectionEntryFormatting,
} from "../../domain/ports/AyahNoteRepository";
import { HeadingSectionInserter } from "../../domain/services/HeadingSectionInserter";
import { MarkdownSectionExtractor, type MarkdownSectionTarget } from "../../domain/services/MarkdownSectionExtractor";
import { ReflectionFileNameBuilder } from "../../domain/services/ReflectionFileNameBuilder";

function sanitizeFileNameSegment(segment: string): string {
	return segment.replace(/[\\/:*?"<>|]/g, "").trim();
}

export interface AyahNoteSettingsSource {
	ayahNotesFolder: string;
	reflectionFileNameAyahTextMaxLength: number;
	surahNotesFolder: string;
	surahNoteFileNameTemplate: string;
	referenceFormat: string;
	wrapperStart: string;
	wrapperEnd: string;
	getSurahAyahs: (surahId: number) => readonly Ayah[];
}

const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

function arabicIndicNumber(value: number): string {
	return String(value)
		.split("")
		.map((digit) => ARABIC_INDIC_DIGITS[Number(digit)])
		.join("");
}

function basenameWithoutExtension(path: string): string {
	const basename = path.split("/").pop() ?? path;
	return basename.endsWith(".md") ? basename.slice(0, -3) : basename;
}

export class ObsidianAyahNoteRepository implements AyahNoteRepository {
	private readonly surahFilesById = new Map<number, TFile>();

	constructor(private readonly app: App, private readonly getSettings: () => AyahNoteSettingsSource) {}

	async ensureSurahNote(surahId: number, surahName: string): Promise<AyahNoteRef> {
		const file = await this.findOrCreateSurahNote(surahId, surahName, null, null);
		await this.ensureTagsField(file);
		return { title: file.basename };
	}

	async extractSection(
		surahId: number,
		ayahId: number,
		target: MarkdownSectionTarget
	): Promise<AyahSectionExtraction | null> {
		const file = this.findExistingUnifiedFile(surahId, ayahId);
		if (!file) return null;
		const content = await this.app.vault.read(file);
		const section = MarkdownSectionExtractor.extract(content, target);
		if (!section) return null;
		return { title: file.basename, surahId, ayahId, content: section };
	}

	async appendEntry(
		identity: AyahIdentity,
		category: ReflectionCategory,
		entryMarkdown: string,
		formatting: ReflectionEntryFormatting
	): Promise<AyahNoteRef> {
		if (category.organizationMode === "ownFolder") {
			return this.appendToOwnFolderNote(identity, category, entryMarkdown, formatting);
		}
		return this.appendToUnifiedNote(identity, category, entryMarkdown, formatting);
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

	private async appendToUnifiedNote(
		identity: AyahIdentity,
		category: ReflectionCategory,
		entryMarkdown: string,
		formatting: ReflectionEntryFormatting
	): Promise<AyahNoteRef> {
		const file = await this.findOrCreateUnifiedNote(identity, formatting.fileNameTemplate, formatting.includeAyahText);
		await this.app.vault.process(file, (current) =>
			HeadingSectionInserter.insertEntry(
				current,
				{
					headingLevel: category.headingLevel,
					headingText: category.headingText,
					parentHeadingLevel: null,
					parentHeadingText: null,
					insertionMode: formatting.insertionMode,
					separator: formatting.entrySeparator,
				},
				entryMarkdown
			)
		);
		return { title: file.basename };
	}

	private findExistingUnifiedFile(surahId: number, ayahId: number): TFile | null {
		const folder = this.app.vault.getAbstractFileByPath(normalizePath(this.getSettings().ayahNotesFolder));
		if (!(folder instanceof TFolder)) return null;
		for (const child of folder.children) {
			if (!(child instanceof TFile) || child.extension !== "md") continue;
			const fm = this.app.metadataCache.getFileCache(child)?.frontmatter;
			if (fm?.surahId === surahId && (fm?.ayahId === ayahId || fm?.ayah === ayahId)) return child;
		}
		return null;
	}

	private async findOrCreateUnifiedNote(identity: AyahIdentity, fileNameTemplate: string, includeAyahText: boolean): Promise<TFile> {
		const existing = this.findExistingUnifiedFile(identity.surahId, identity.ayahId);
		if (existing) {
			await this.ensureExistingAyahParent(existing, identity);
			return existing;
		}

		const settings = this.getSettings();
		const title = new ReflectionFileNameBuilder(fileNameTemplate, settings.reflectionFileNameAyahTextMaxLength).build(
			identity.surahName,
			identity.ayahId,
			identity.ayahTextRaw
		);
		const path = this.uniquePath(settings.ayahNotesFolder, title);
		const ayahTitle = basenameWithoutExtension(path);
		const surahFile = await this.findOrCreateSurahNote(identity.surahId, identity.surahName, identity.ayahId, ayahTitle);
		await this.ensureFolder(settings.ayahNotesFolder);
		const frontmatter = [
			"---",
			"type: quran-ayah",
			"quranKeySchema: 1",
			"tags: []",
			`surahName: "${identity.surahName}"`,
			`surahId: ${identity.surahId}`,
			`ayahId: ${identity.ayahId}`,
			`surahNote: "[[${surahFile.basename}]]"`,
			"relatedAyat: []",
			"---",
			"",
			"",
		].join("\n");
		const body = includeAyahText ? `${identity.ayahTextBodyFormatted}\n\n` : "";
		return this.app.vault.create(path, `${frontmatter}${body}`);
	}

	private async ensureExistingAyahParent(file: TFile, identity: AyahIdentity): Promise<void> {
		const surahFile = await this.findOrCreateSurahNote(identity.surahId, identity.surahName, identity.ayahId, file.basename);
		await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			if (fm.type === undefined) fm.type = "quran-ayah";
			if (fm.quranKeySchema === undefined) fm.quranKeySchema = 1;
			if (fm.surahName === undefined) fm.surahName = identity.surahName;
			if (fm.ayahId === undefined) fm.ayahId = identity.ayahId;
			if (fm.surahNote === undefined) fm.surahNote = `[[${surahFile.basename}]]`;
		});
		await this.ensureTagsField(file);
	}

	private findExistingSurahFile(surahId: number): TFile | null {
		const cached = this.surahFilesById.get(surahId);
		if (cached) return cached;
		const folder = this.app.vault.getAbstractFileByPath(normalizePath(this.getSettings().surahNotesFolder));
		if (!(folder instanceof TFolder)) return null;
		for (const child of folder.children) {
			if (!(child instanceof TFile) || child.extension !== "md") continue;
			const fm = this.app.metadataCache.getFileCache(child)?.frontmatter;
			if (fm?.type === "quran-surah" && fm?.surahId === surahId) {
				this.surahFilesById.set(surahId, child);
				return child;
			}
		}
		return null;
	}

	private async findOrCreateSurahNote(
		surahId: number,
		surahName: string,
		linkedAyahId: number | null,
		linkedAyahTitle: string | null
	): Promise<TFile> {
		const existing = this.findExistingSurahFile(surahId);
		if (existing) {
			if (linkedAyahId !== null && linkedAyahTitle !== null) {
				await this.materializeAyahLink(existing, surahId, linkedAyahId, linkedAyahTitle);
			}
			await this.ensureTagsField(existing);
			return existing;
		}

		const settings = this.getSettings();
		await this.ensureFolder(settings.surahNotesFolder);
		const title = settings.surahNoteFileNameTemplate
			.split("{surah}")
			.join(surahName)
			.trim();
		const path = this.uniquePath(settings.surahNotesFolder, title);
		const ayahs = settings.getSurahAyahs(surahId);
		const firstAyah = ayahs[0]?.ayahId ?? linkedAyahId ?? 1;
		const lastAyah = ayahs[ayahs.length - 1]?.ayahId ?? linkedAyahId ?? firstAyah;
		const ayahText = ayahs.length
			? ayahs.map((ayah) => this.renderSurahAyah(ayah, ayah.ayahId === linkedAyahId ? linkedAyahTitle : null)).join(" ")
			: "";
		const frontmatter = [
			"---",
			"type: quran-surah",
			"quranKeySchema: 1",
			"tags: []",
			`surahId: ${surahId}`,
			`surahName: "${surahName}"`,
			`ayahCount: ${ayahs.length}`,
			"---",
			"",
		].join("\n");
		const reference = settings.referenceFormat
			.split("{surah}")
			.join(surahName)
			.split("{verse}")
			.join(firstAyah === lastAyah ? String(firstAyah) : `${firstAyah}-${lastAyah}`);
		const created = await this.app.vault.create(
			path,
			`${frontmatter}${settings.wrapperStart} ${ayahText} ${settings.wrapperEnd} ${reference}\n`
		);
		this.surahFilesById.set(surahId, created);
		return created;
	}

	private async ensureTagsField(file: TFile): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			if (fm.tags === undefined) fm.tags = [];
		});
	}

	private renderSurahAyah(ayah: Ayah, linkTitle: string | null): string {
		const digits = arabicIndicNumber(ayah.ayahId);
		const marker = linkTitle
			? `[[${linkTitle}|${digits}]]`
			: `<span class="quran-key-lazy-ayah" data-quran-key-surah="${ayah.surahId}" data-quran-key-ayah="${ayah.ayahId}">${digits}</span>`;
		const text = ayah.bismillah ? `${ayah.bismillah} ${ayah.text}` : ayah.text;
		return `${text} ${marker}`.trim();
	}

	private async materializeAyahLink(file: TFile, surahId: number, ayahId: number, ayahTitle: string): Promise<void> {
		const digits = arabicIndicNumber(ayahId);
		const marker = `<span class="quran-key-lazy-ayah" data-quran-key-surah="${surahId}" data-quran-key-ayah="${ayahId}">${digits}</span>`;
		const link = `[[${ayahTitle}|${digits}]]`;
		await this.app.vault.process(file, (current) => (current.includes(marker) ? current.replace(marker, link) : current));
	}

	private async appendToOwnFolderNote(
		identity: AyahIdentity,
		category: ReflectionCategory,
		entryMarkdown: string,
		formatting: ReflectionEntryFormatting
	): Promise<AyahNoteRef> {
		const unified = await this.findOrCreateUnifiedNote(identity, formatting.fileNameTemplate, formatting.includeAyahText);
		const ownFile = await this.findOrCreateOwnFolderNote(category, identity, formatting.fileNameTemplate, unified.basename);

		await this.app.vault.process(ownFile, (current) => {
			const trimmed = current.replace(/\s+$/, "");
			return trimmed.length > 0 ? `${trimmed}${formatting.entrySeparator}${entryMarkdown}\n` : `${entryMarkdown}\n`;
		});

		await this.app.vault.process(unified, (current) =>
			HeadingSectionInserter.ensureLinkLine(
				current,
				{
					headingLevel: category.headingLevel,
					headingText: category.headingText,
					parentHeadingLevel: null,
					parentHeadingText: null,
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
			if (fm?.surahId === surahId && (fm?.ayahId === ayahId || fm?.ayah === ayahId) && fm?.category === category.id) return child;
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
		if (existing) {
			await this.ensureTagsField(existing);
			return existing;
		}

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
			"type: quran-ayah",
			"quranKeySchema: 1",
			"tags: []",
			`surahName: "${identity.surahName}"`,
			`surahId: ${identity.surahId}`,
			`ayahId: ${identity.ayahId}`,
			`category: ${category.id}`,
			`ayahNote: "[[${unifiedTitle}]]"`,
			"---",
			"",
			"",
		].join("\n");
		return this.app.vault.create(path, frontmatter);
	}

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
