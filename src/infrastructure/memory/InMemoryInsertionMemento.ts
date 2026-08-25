import type { InsertionMemento, InsertionMementoStore } from "../../domain/ports/InsertionMemento";

export class InMemoryInsertionMemento implements InsertionMementoStore {
	private current: InsertionMemento | null = null;

	get(): InsertionMemento | null {
		return this.current;
	}

	set(memento: InsertionMemento | null): void {
		this.current = memento;
	}
}
