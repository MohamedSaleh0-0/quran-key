export class PatternBuilder {
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
