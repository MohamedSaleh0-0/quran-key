import type { TafsirPackage } from "../entities/TafsirPackage";

export class TafsirPackageCatalog {
	private readonly packages: readonly TafsirPackage[];

	constructor(custom: readonly TafsirPackage[]) {
		const byId = new Map<string, TafsirPackage>();
		for (const item of custom) byId.set(item.id, item);
		this.packages = Array.from(byId.values());
	}

	all(): readonly TafsirPackage[] {
		return this.packages;
	}

	search(query: string): TafsirPackage[] {
		const normalized = query.trim().toLowerCase();
		if (!normalized) return [...this.packages];
		return this.packages.filter((item) => item.name.toLowerCase().includes(normalized));
	}
}
