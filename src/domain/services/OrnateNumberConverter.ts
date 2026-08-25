const ARABIC_INDIC_DIGITS = "\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669";

/** Converts "(N)" ayah-number markers into ring-glyph-wrapped Arabic-Indic
 *  digits, e.g. "(12)" -> " ۝١٢ ". Both the ring glyph and whether this
 *  runs at all are settings (settings.ornateRingGlyph / useOrnateNumbers) —
 *  v1 hardcoded "۝" directly in the formatter. */
export class OrnateNumberConverter {
	constructor(private readonly ringGlyph: string) {}

	applyOrnateNumbers(text: string): string {
		return text.replace(/\((\d+)\)/g, (_match, digits: string) => {
			const arabicDigits = digits
				.split("")
				.map((d) => ARABIC_INDIC_DIGITS[parseInt(d, 10)])
				.join("");
			return ` ${this.ringGlyph}${arabicDigits} `;
		});
	}
}
