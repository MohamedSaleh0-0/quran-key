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

	/** Remove only the parentheses around ayah numbers that are already inside
	 * an ornate Quran wrapper. Parentheses elsewhere (citations, prose, etc.)
	 * must remain untouched. */
	removeInnerMarkerParentheses(text: string, wrapperStart: string, wrapperEnd: string): string {
		const escapedStart = escapeRegExp(wrapperStart);
		const escapedEnd = escapeRegExp(wrapperEnd);
		const wrapped = new RegExp(`${escapedStart}([\\s\\S]*?)${escapedEnd}`, "g");
		return text.replace(wrapped, (_match, body: string) => {
			const cleanBody = body.replace(/[（(]([٠-٩0-9]+)[）)]/g, "$1");
			return `${wrapperStart}${cleanBody}${wrapperEnd}`;
		});
	}
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
