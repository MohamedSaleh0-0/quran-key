import type { ReflectionCategory } from "../entities/ReflectionCategory";

/**
 * Same builtin+custom merge convention as TafsirCatalog (NFR-1): the
 * shipped تدبر/أثر categories live in data/reflectionCategories.json,
 * merged with settings.customReflectionCategories at runtime so adding a
 * third category (e.g. فائدة) needs no code change — just a Settings
 * entry (its own link command still needs a line in registerCommands.ts,
 * see createLinkReflectionCommand's doc comment).
 */
export class ReflectionCategoryCatalog {
	private readonly categories: readonly ReflectionCategory[];

	constructor(builtin: readonly ReflectionCategory[], custom: readonly ReflectionCategory[]) {
		const byId = new Map<string, ReflectionCategory>();
		for (const c of builtin) byId.set(c.id, c);
		for (const c of custom) byId.set(c.id, c);
		this.categories = Array.from(byId.values());
	}

	all(): readonly ReflectionCategory[] {
		return this.categories;
	}

	byId(id: string): ReflectionCategory | null {
		return this.categories.find((c) => c.id === id) ?? null;
	}

	/** Root-to-leaf ancestor chain for `categoryId` (the category itself
	 *  is the last element), walked via `parentCategoryId`. Cycle-safe:
	 *  if a chain of parents loops back on itself, the walk stops at the
	 *  point of the cycle rather than hanging or throwing — heading
	 *  creation must never fail because of a settings mistake, it should
	 *  just degrade to treating the category as top-level from there. */
	ancestorChain(categoryId: string): ReflectionCategory[] {
		const chain: ReflectionCategory[] = [];
		const visited = new Set<string>();
		let current = this.byId(categoryId);
		while (current && !visited.has(current.id)) {
			visited.add(current.id);
			chain.unshift(current);
			current = current.parentCategoryId ? this.byId(current.parentCategoryId) : null;
		}
		return chain;
	}
}
