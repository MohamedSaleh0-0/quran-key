import type { Ayah } from "../entities/Ayah";

/** State needed to implement the "toggle full ayah <-> last-typed
 *  snippet on repeat invoke" behavior (FR-9), kept out of the editor
 *  adapter so it's independently testable. */
export interface InsertionMemento {
	line: number;
	query: string;
	ayahs: readonly Ayah[];
	isSnippet: boolean;
}

export interface InsertionMementoStore {
	get(): InsertionMemento | null;
	set(memento: InsertionMemento | null): void;
}
