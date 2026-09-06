import type { ReflectionCategory } from "../entities/ReflectionCategory";

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
}