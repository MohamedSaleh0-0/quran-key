const ARABIC_INDIC_DIGITS = "\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669";

/** Converts "(N)" ayah-number markers into Arabic-Indic digits,
 *  e.g. "(12)" -> "١٢". The ring glyph (۝) that used to prefix this was
 *  removed — the font's own digit glyphs already carry enough visual
 *  distinction on their own, and the separate ring was just duplicating
 *  that ornamentation on top of it. */
export class OrnateNumberConverter {
	applyOrnateNumbers(text: string): string {
		return text.replace(/\((\d+)\)/g, (_match, digits: string) =>
			digits
				.split("")
				.map((d) => ARABIC_INDIC_DIGITS[parseInt(d, 10)])
				.join("")
		);
	}
}