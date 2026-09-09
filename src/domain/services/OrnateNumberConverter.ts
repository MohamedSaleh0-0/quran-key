import { toArabicIndicDigits } from "./AyahMarkerFormatter";

/** Converts "(N)" ayah-number markers into Arabic-Indic digits,
 *  e.g. "(12)" -> "١٢". The ring glyph (۝) that used to prefix this was
 *  removed — the font's own digit glyphs already carry enough visual
 *  distinction on their own, and the separate ring was just duplicating
 *  that ornamentation on top of it. */
export class OrnateNumberConverter {
	applyOrnateNumbers(text: string): string {
		return text.replace(/\((\d+)\)/g, (_match, digits: string) => toArabicIndicDigits(digits));
	}
}
