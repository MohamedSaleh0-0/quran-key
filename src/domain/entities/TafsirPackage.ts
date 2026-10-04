/** A reusable selection of tafsir books. Packages are a presentation-level
 * convenience; fetching still happens book by book. */
export interface TafsirPackage {
	readonly id: string;
	readonly name: string;
	readonly bookIds: readonly string[];
	readonly isBuiltin: boolean;
}
