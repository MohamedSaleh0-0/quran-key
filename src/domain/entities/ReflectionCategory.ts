/**
 * A category of personal writing a user links to an ayah or ayah range —
 * their own reflection (تدبر) vs. something they're just recording that
 * isn't their own composition (أثر, a quotation, etc.). Builtin
 * (data/reflectionCategories.json) and user-added (settings) categories
 * share this exact shape, same convention as TafsirBook/TafsirBookDescriptor.
 */
export interface ReflectionCategory {
	readonly id: string;
	readonly name: string;
	/** Vault-relative folder this category's per-ayah files live under,
	 *  e.g. "تدبرات". Created automatically the first time something is
	 *  linked into it. */
	readonly folder: string;
	readonly isBuiltin: boolean;
}
