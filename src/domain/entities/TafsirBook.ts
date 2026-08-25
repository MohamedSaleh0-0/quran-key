/**
 * A tafsir (commentary) source — builtin or user-added.
 *
 * Structurally identical to `TafsirBookDescriptor` in
 * src/config/types.ts by design: the domain layer never imports the
 * config layer (see docs/ARCHITECTURE.md §2), so this is declared
 * independently rather than reused across the boundary. Small, deliberate
 * duplication at a hexagonal-architecture seam.
 */
export interface TafsirBook {
	readonly id: string;
	readonly name: string;
	readonly aliases: readonly string[];
	/** {bookId}, {surahId}, {ayahId} placeholders, substituted at fetch time. */
	readonly urlTemplate: string;
	readonly isBuiltin: boolean;
}
