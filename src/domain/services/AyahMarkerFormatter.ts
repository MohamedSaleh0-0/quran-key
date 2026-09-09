export type AyahMarkerStyle = "plain" | "parenthesized" | "end-symbol";

const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function toArabicIndicDigits(value: number | string): string {
	return String(value)
		.split("")
		.map((digit) => ARABIC_INDIC_DIGITS[Number(digit)] ?? digit)
		.join("");
}

export function formatAyahMarker(ayahId: number, style: AyahMarkerStyle): string {
	const digits = toArabicIndicDigits(ayahId);
	switch (style) {
		case "parenthesized":
			return `(${digits})`;
		case "end-symbol":
			return `۝${digits}`;
		case "plain":
			return digits;
	}
}
