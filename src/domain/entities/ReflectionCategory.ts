/**
 * A category of personal writing a user links to an ayah — their own
 * reflection (تدبر) vs. something they're just recording that isn't their
 * own composition (أثر), or any use-case-specific category they define
 * themselves (فوائد عملية، فوائد لغوية، ...). Structurally identical to
 * `ReflectionCategoryDescriptor` in src/config/types.ts by design — the
 * domain layer never imports the config layer (see docs/ARCHITECTURE.md
 * §2) — so this is declared independently, same convention as
 * TafsirBook/TafsirBookDescriptor.
 */
export type CategoryOrganizationMode = "unified" | "ownFolder";

export interface ReflectionCategory {
	readonly id: string;
	readonly name: string;
	readonly organizationMode: CategoryOrganizationMode;
	/** Heading text this category's entries live under in the unified
	 *  note, e.g. "تدبرات". Also used (as a link-line anchor) for
	 *  "ownFolder" categories — see AyahNoteRepository. */
	readonly headingText: string;
	/** e.g. "###". */
	readonly headingLevel: string;
	/** Id of the ancestor category this one nests its heading under the
	 *  first time it's created — null for a top-level heading. */
	readonly parentCategoryId: string | null;
	/** Vault-relative folder — meaningful only when organizationMode is
	 *  "ownFolder". */
	readonly folder: string;
	readonly isBuiltin: boolean;
}
