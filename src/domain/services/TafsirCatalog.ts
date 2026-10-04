import type { TafsirBook } from "../entities/TafsirBook";
import type { TafsirBookSortOrder } from "../../config/types";

/**
 * v1's `TAFSIR_BOOKS_LIST` was a hardcoded 42-entry array baked into the
 * bundle — a user could not add a source without editing source and
 * rebuilding. Here the builtin list is bundled *data*
 * (data/tafsirBooks.json) and this class merges it with
 * `settings.customTafsirBooks` (NFR-1); a custom entry with an id that
 * matches a builtin one overrides it (e.g. to re-point its URL), anything
 * else is additive.
 */
export class TafsirCatalog {
	private readonly books: readonly TafsirBook[];

	constructor(builtin: readonly TafsirBook[], custom: readonly TafsirBook[], sortOrder: TafsirBookSortOrder = "name") {
		const byId = new Map<string, TafsirBook>();
		for (const b of builtin) byId.set(b.id, b);
		for (const b of custom) byId.set(b.id, b);
		const entries = Array.from(byId.values());
		this.books = entries.sort((a, b) => {
			if (sortOrder === "created") {
				const createdA = a.createdAt ?? 0;
				const createdB = b.createdAt ?? 0;
				if (createdA !== createdB) return createdA - createdB;
			}
			return a.name.localeCompare(b.name, "ar", { sensitivity: "base" });
		});
	}

	all(): readonly TafsirBook[] {
		return this.books;
	}

	byId(id: string): TafsirBook | null {
		return this.books.find((b) => b.id === id) ?? null;
	}

	byIds(ids: readonly string[]): TafsirBook[] {
		return this.books.filter((b) => ids.includes(b.id));
	}

	/** Books whose name or an alias literally appears in `lineText`
	 *  (used to auto-detect intent, e.g. a line mentioning "ابن كثير"). */
	findMentionedIn(lineText: string): TafsirBook[] {
		if (!lineText) return [];
		return this.books.filter((b) => b.aliases.some((alias) => lineText.indexOf(alias) !== -1));
	}

	/** Case-insensitive substring search across name + aliases, for the
	 *  book-picker modal. */
	search(query: string): TafsirBook[] {
		const q = query.toLowerCase().trim();
		if (!q) return [...this.books];
		return this.books.filter(
			(b) => b.name.toLowerCase().includes(q) || b.aliases.some((a) => a.toLowerCase().includes(q))
		);
	}
}
