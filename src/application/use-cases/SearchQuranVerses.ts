import type { Ayah } from "../../domain/entities/Ayah";
import type { QuranRepository } from "../../domain/ports/QuranRepository";
import type { SearchStrategy } from "../../config/types";
import { FuzzyMatcher } from "../../domain/services/FuzzyMatcher";
import { PhraseMatcher } from "../../domain/services/PhraseMatcher";
import type { RootSearchIndex } from "../../domain/services/RootSearchIndex";

export type SearchMode = SearchStrategy | "root";

export interface QuranSearchResult {
	/** The capped list used to populate the suggestion modal. */
	matches: Ayah[];
	/** The complete match set used by analytics. */
	allMatches: Ayah[];
	totalMatches: number;
}

/**
 * Backs the global/live search modal (FR-16/17). `pool`, when given, lets
 * the modal search within a previously-narrowed set instead of the full
 * corpus (e.g. refining a context-parsed ambiguity).
 *
 * Which matcher runs is a setting (settings.searchStrategy), not a
 * hardcoded choice — v2 fix for the "search returns anything containing
 * the words in any order" complaint. "literal" delegates to PhraseMatcher
 * (contiguous, order-preserving — the same engine ExtractAndInsertVerse's
 * direct-query path uses), but — unlike that direct-query path — with
 * `allowPrefixOnLastWord` on: this is a live, as-you-type search box, so
 * the word currently being typed shouldn't have to be finished before
 * anything shows up. "fuzzy" delegates to FuzzyMatcher (any
 * order/position), preserved as the looser opt-in mode.
 */
export class SearchQuranVerses {
	constructor(
		private readonly repository: QuranRepository,
		private readonly phraseMatcher: PhraseMatcher,
		private readonly fuzzyMatcher: FuzzyMatcher,
		private readonly maxResults: number,
		private readonly strategy: SearchStrategy,
		private readonly rootSearchIndex?: RootSearchIndex
	) {}

	execute(query: string, pool?: readonly Ayah[], mode?: SearchMode): Ayah[] {
		return this.executeWithCount(query, pool, mode).matches;
	}

	executeWithCount(query: string, pool?: readonly Ayah[], mode?: SearchMode): QuranSearchResult {
		const corpus = pool ?? this.repository.getAllAyahs();
		const selectedMode = mode ?? this.strategy;
		const allMatches = selectedMode === "root"
			? this.rootSearchIndex?.findMatches(query, corpus) ?? []
			: selectedMode === "literal"
				? this.phraseMatcher.findMatches(query, corpus, true)
				: this.fuzzyMatcher.findMatches(query, corpus);

		return {
			matches: allMatches.slice(0, this.maxResults),
			allMatches,
			totalMatches: allMatches.length,
		};
	}

	getRootMatchingForms(ayah: Ayah, query: string): Set<string> {
		return this.rootSearchIndex?.getMatchingForms(ayah, query) ?? new Set();
	}
}

