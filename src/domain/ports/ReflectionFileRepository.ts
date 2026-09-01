import type { ReflectionCategory } from "../entities/ReflectionCategory";

export interface ReflectionFileEntry {
	surahId: number;
	surahName: string;
	ayahId: number;
	/** Precomputed file title (no ".md", no folder) — see
	 *  ReflectionFileNameBuilder. Purely cosmetic: the repository never
	 *  uses this to *find* a file, only to *name* a new one — see its
	 *  own doc comment. */
	fileTitle: string;
	/** Fully-formatted Markdown for one dated entry (heading, optional
	 *  range notice, optional quoted passage, the reflection text) —
	 *  built entirely by the application layer; this port only decides
	 *  *where* it's persisted and whether to create vs. append. */
	entryMarkdown: string;
}

/** Persists one تدبر/أثر entry into its per-ayah note file (one file per
 *  ayah under category.folder, e.g. "تدبرات/... .md") — creating the file
 *  (with frontmatter identifying which ayah it belongs to) the first time
 *  an ayah is linked, appending a new dated entry to it on every later
 *  occasion. */
export interface ReflectionFileRepository {
	appendEntry(category: ReflectionCategory, entry: ReflectionFileEntry): Promise<void>;
}
