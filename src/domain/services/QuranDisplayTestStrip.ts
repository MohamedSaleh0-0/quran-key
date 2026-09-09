import type { QuranTextProfile } from "../../config/quranRenderingProfiles";
import type { AyahMarkerStyle } from "./AyahMarkerFormatter";
import { formatAyahMarker } from "./AyahMarkerFormatter";

/**
 * A deliberately compact visual regression strip. It is not a Quran ayah and
 * must never be inserted into a vault; it only combines glyph contexts that
 * are easy to compare when testing text/font/marker candidates side by side.
 */
export function buildQuranDisplayTestStrip(
	textProfile: QuranTextProfile,
	markerStyle: AyahMarkerStyle
): string {
	const tanween =
		textProfile === "tanzil-sequential"
			? "مَثَلًۭا كَافِرٍۭ أَلِيمٌۢ"
			: "مَثَلًا كَافِرٍ أَلِيمٌ";
	return `﴿ بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ۞ يَـٰٓأَيُّهَا رَٰعِنَا ءَامَنُوا۟ نُورٌ عَلَىٰ ${tanween} ۚ ۖ ۛ ۘ ۩ ${formatAyahMarker(104, markerStyle)} ﴾`;
}
