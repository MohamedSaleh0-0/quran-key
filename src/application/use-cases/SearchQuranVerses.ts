import type { Ayah } from "../../domain/entities/Ayah";
import type { QuranRepository } from "../../domain/ports/QuranRepository";
import type { SearchStrategy } from "../../config/types";
import { FuzzyMatcher } from "../../domain/services/FuzzyMatcher";
import { PhraseMatcher } from "../../domain/services/PhraseMatcher";

/**
 * Backs the global/live search modal (FR-16/17). `pool`, when given, lets
 * the modal search within a previously-narrowed set instead of the full
 * corpus (e.g. refining a context-parsed ambiguity).
 *
 * Which matcher runs is a setting (settings.searchStrategy), not a
 * hardcoded choice — v2 fix for the "search returns anything containing
 * the words in any order" complaint. "literal" delegates to PhraseMatcher
 * (contiguous, order-preserving — the same engine ExtractAndInsertVerse's
 * direct-query path uses); "fuzzy" delegates to FuzzyMatcher (any
 * order/position), preserved as the looser opt-in mode.
 */
export class SearchQuranVerses {
	constructor(
		private readonly repository: QuranRepository,
		private readonly phraseMatcher: PhraseMatcher,
		private readonly fuzzyMatcher: FuzzyMatcher,
		private readonly maxResults: number,
		private readonly strategy: SearchStrategy
	) {}

	execute(query: string, pool?: readonly Ayah[]): Ayah[] {
		const corpus = pool ?? this.repository.getAllAyahs();
		if (this.strategy === "literal") {
			return this.phraseMatcher.findMatches(query, corpus).slice(0, this.maxResults);
		}
		return this.fuzzyMatcher.findMatches(query, corpus, this.maxResults);
	}
}
