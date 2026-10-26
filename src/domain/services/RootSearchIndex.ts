import type { Ayah } from "../entities/Ayah";
import type { ArabicNormalizer } from "./ArabicNormalizer";

export interface RootIndexWord {
	form: string;
	roots: string[];
	lemmas: string[];
}

export interface RootIndexData {
	version: string;
	source: string;
	license: string;
	wordIndexBase: number;
	ayahWords: Record<string, RootIndexWord[]>;
	termRoots: Record<string, string[]>;
}

/**
 * Resolves Arabic query words to Quranic Arabic Corpus roots and searches by
 * those roots. A query containing several words uses AND semantics: every
 * query term must occur in the same ayah, while each term may resolve to one
 * or more roots supplied by the corpus index.
 */
export class RootSearchIndex {
	private readonly termRoots = new Map<string, Set<string>>();
	private readonly rootToAyahKeys = new Map<string, Set<string>>();
	private readonly ayahWords = new Map<string, RootIndexWord[]>();

	constructor(
		data: RootIndexData,
		private readonly normalizer: ArabicNormalizer
	) {
		for (const [term, roots] of Object.entries(data.termRoots)) {
			const normalizedTerm = this.normalize(term);
			if (!normalizedTerm) continue;
			const target = this.termRoots.get(normalizedTerm) ?? new Set<string>();
			for (const root of roots) {
				const normalizedRoot = this.normalize(root);
				if (normalizedRoot) target.add(normalizedRoot);
			}
			if (target.size > 0) this.termRoots.set(normalizedTerm, target);
		}

		for (const [ayahKey, words] of Object.entries(data.ayahWords)) {
			this.ayahWords.set(ayahKey, words);
			for (const word of words) {
				for (const root of word.roots) {
					const normalizedRoot = this.normalize(root);
					if (!normalizedRoot) continue;
					const ayahKeys = this.rootToAyahKeys.get(normalizedRoot) ?? new Set<string>();
					ayahKeys.add(ayahKey);
					this.rootToAyahKeys.set(normalizedRoot, ayahKeys);
				}
			}
		}
	}

	/** Returns the possible roots for each normalized query term. */
	resolveQueryRoots(query: string): string[][] {
		const terms = this.normalize(query).split(/\s+/).filter(Boolean);
		return terms.map((term) => {
			const indexedRoots = this.termRoots.get(term);
			if (indexedRoots && indexedRoots.size > 0) return Array.from(indexedRoots);
			return this.rootToAyahKeys.has(term) ? [term] : [];
		});
	}

	findMatches(query: string, corpus: readonly Ayah[]): Ayah[] {
		const queryRoots = this.resolveQueryRoots(query);
		if (queryRoots.length === 0 || queryRoots.some((roots) => roots.length === 0)) return [];

		let matchingAyahKeys: Set<string> | null = null;
		for (const roots of queryRoots) {
			const keysForTerm = new Set<string>();
			for (const root of roots) {
				for (const key of this.rootToAyahKeys.get(root) ?? []) keysForTerm.add(key);
			}
			if (matchingAyahKeys === null) {
				matchingAyahKeys = keysForTerm;
				continue;
			}
			for (const key of matchingAyahKeys) {
				if (!keysForTerm.has(key)) matchingAyahKeys.delete(key);
			}
		}

		if (!matchingAyahKeys || matchingAyahKeys.size === 0) return [];
		return corpus.filter((ayah) => matchingAyahKeys.has(this.ayahKey(ayah)));
	}

	/**
	 * Returns the Quranic word forms that belong to the query's roots in an
	 * ayah. The modal uses this to highlight the actual root matches rather
	 * than only highlighting the literal query spelling.
	 */
	getMatchingForms(ayah: Ayah, query: string): Set<string> {
		const queryRoots = this.resolveQueryRoots(query);
		if (queryRoots.length === 0 || queryRoots.some((roots) => roots.length === 0)) return new Set();
		const roots = new Set(queryRoots.flat());
		const words = this.ayahWords.get(this.ayahKey(ayah)) ?? [];
		return new Set(
			words
				.filter((word) => word.roots.some((root) => roots.has(this.normalize(root))))
				.map((word) => this.normalize(word.form))
				.filter(Boolean)
		);
	}

	private normalize(text: string): string {
		return this.normalizer.normalizeForSearch(text);
	}

	private ayahKey(ayah: Ayah): string {
		return `${ayah.surahId}:${ayah.ayahId}`;
	}
}
