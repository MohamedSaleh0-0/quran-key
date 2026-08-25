/**
 * v1 declared a `referenceFormat` setting ("[Surah:Verse]") but every
 * regex and every formatted output string hardcoded literal `[`, `:`,
 * `]` — the setting was pure decoration. This value object is the fix:
 * `compile()` turns a template containing the `{surah}` and `{verse}`
 * placeholders into BOTH a parser and a formatter, so changing the
 * template in Settings changes what the plugin recognizes on a line and
 * what it writes, everywhere, from one source of truth.
 */

const SURAH_PLACEHOLDER = "{surah}";
const VERSE_PLACEHOLDER = "{verse}";

export interface VerseReferenceMatch {
	surahName: string;
	startAyah: number;
	endAyah: number;
	/** The full matched substring, e.g. "[البقرة:255]". */
	matchText: string;
	/** Character offset of the match within the searched text. */
	index: number;
}

export interface CompiledVerseReference {
	/** First match anywhere in `text`, or null. */
	find(text: string): VerseReferenceMatch | null;
	/** Every non-overlapping match in `text`. */
	findAll(text: string): VerseReferenceMatch[];
	/** True if `text` contains at least one reference. */
	test(text: string): boolean;
	/** Build the reference string for a surah name + ayah (or ayah range). */
	format(surahName: string, startAyah: number, endAyah: number): string;
	/** Remove every reference in `text` (and one preceding whitespace
	 *  character per match, matching v1's "remove reference" behavior). */
	strip(text: string): string;
}

function escapeRegex(literal: string): string {
	return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class VerseReference {
	static compile(template: string): CompiledVerseReference {
		const surahIdx = template.indexOf(SURAH_PLACEHOLDER);
		const verseIdx = template.indexOf(VERSE_PLACEHOLDER);
		if (surahIdx === -1 || verseIdx === -1) {
			throw new Error(
				`referenceFormat "${template}" must contain both ${SURAH_PLACEHOLDER} and ${VERSE_PLACEHOLDER}`
			);
		}
		const surahFirst = surahIdx < verseIdx;

		const before = template.slice(0, Math.min(surahIdx, verseIdx));
		const between = surahFirst
			? template.slice(surahIdx + SURAH_PLACEHOLDER.length, verseIdx)
			: template.slice(verseIdx + VERSE_PLACEHOLDER.length, surahIdx);
		const after = template.slice(
			Math.max(surahIdx, verseIdx) + (surahFirst ? VERSE_PLACEHOLDER.length : SURAH_PLACEHOLDER.length)
		);

		// Arabic-letter run for the surah name, digit(s) + optional "-digit(s)" for the ayah/range.
		const surahGroup = "([\\u0600-\\u06FF\\s]+)";
		const verseGroup = "(\\d+)(?:-(\\d+))?";

		const source = surahFirst
			? `${escapeRegex(before)}${surahGroup}${escapeRegex(between)}${verseGroup}${escapeRegex(after)}`
			: `${escapeRegex(before)}${verseGroup}${escapeRegex(between)}${surahGroup}${escapeRegex(after)}`;

		function toMatch(m: RegExpExecArray): VerseReferenceMatch {
			const surahName = (surahFirst ? m[1] : m[3]).trim();
			const startAyah = parseInt(surahFirst ? m[2] : m[1], 10);
			const endAyahRaw = surahFirst ? m[3] : m[2];
			return {
				surahName,
				startAyah,
				endAyah: endAyahRaw ? parseInt(endAyahRaw, 10) : startAyah,
				matchText: m[0],
				index: m.index,
			};
		}

		return {
			find(text: string): VerseReferenceMatch | null {
				const m = new RegExp(source).exec(text);
				return m ? toMatch(m) : null;
			},
			findAll(text: string): VerseReferenceMatch[] {
				const rx = new RegExp(source, "g");
				const out: VerseReferenceMatch[] = [];
				let m: RegExpExecArray | null;
				while ((m = rx.exec(text)) !== null) {
					out.push(toMatch(m));
					if (m[0].length === 0) rx.lastIndex++; // guard against zero-width loops
				}
				return out;
			},
			test(text: string): boolean {
				return new RegExp(source).test(text);
			},
			format(surahName: string, startAyah: number, endAyah: number): string {
				const verseStr = startAyah === endAyah ? `${startAyah}` : `${startAyah}-${endAyah}`;
				return template.replace(SURAH_PLACEHOLDER, surahName).replace(VERSE_PLACEHOLDER, verseStr);
			},
			strip(text: string): string {
				const rx = new RegExp(`\\s*(?:${source})`, "g");
				return text.replace(rx, "");
			},
		};
	}
}
