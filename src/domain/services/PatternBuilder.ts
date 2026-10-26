export class PatternBuilder {
	/** Match the one-yeh Uthmani form of "النبيين" alongside its common
	 * two-yeh spelling. The small high yeh in the bundled corpus is removed
	 * by normalization, leaving only one written yeh. */
	static makeArabicWordPattern(word: string): string {
		const withOptionalUthmaniYeh = word.replace(/نب(?:يي|ي)ن/g, "نب(?:ي)?ين");
		return this.makeMedialAlefsOptional(withOptionalUthmaniYeh);
	}

	/** Match a normalized corpus token with attached Arabic proclitics. */
	static tokenMatches(token: string, word: string, allowPartial = false): boolean {
		const suffix = allowPartial ? "[^\\s]*" : "";
		return new RegExp(`^[^\\s]*${this.makeArabicWordPattern(word)}${suffix}$`).test(token);
	}

	/** Turn a normalized word into a regex source where every *interior*
	 *  alef is optional, so both "رحمن" and "رحمان" spellings match the
	 *  same word without a separate normalization rule per variant. */
	static makeMedialAlefsOptional(word: string): string {
		if (!word || word.length <= 2) return word;
		let out = word[0];
		for (let i = 1; i < word.length - 1; i++) {
			out += word[i] === "\u0627" ? "\u0627?" : word[i];
		}
		return out + word[word.length - 1];
	}
}
