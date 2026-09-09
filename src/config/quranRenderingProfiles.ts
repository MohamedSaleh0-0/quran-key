import type { AyahMarkerStyle } from "../domain/services/AyahMarkerFormatter";

export type QuranTextProfile = "tanzil-canonical" | "tanzil-sequential";

export type QuranRenderingProfileId =
	| "tanzil-sequential-me-quran"
	| "tanzil-uthmani-me-quran"
	| "tanzil-uthmani-kfgqpc"
	| "tanzil-uthmani-qpc-v18";

export interface QuranRenderingProfile {
	id: QuranRenderingProfileId;
	textProfile: QuranTextProfile;
	fontFamily: string;
	suggestedAyahMarkerStyle: AyahMarkerStyle;
	label: { ar: string; en: string };
	description: { ar: string; en: string };
}

export const DEFAULT_QURAN_RENDERING_PROFILE: QuranRenderingProfileId = "tanzil-sequential-me-quran";

export const QURAN_RENDERING_PROFILES: readonly QuranRenderingProfile[] = [
	{
		id: "tanzil-sequential-me-quran",
		textProfile: "tanzil-sequential",
		fontFamily: "'me_quran', 'KFGQPC Uthmanic Script HAFS', serif",
		suggestedAyahMarkerStyle: "parenthesized",
		label: { ar: "Tanzil الممتد + me_quran", en: "Tanzil extended + me_quran" },
		description: {
			ar: "يعرض تنوين الإدغام والإخفاء المتتابع؛ الخط المطابق له هو me_quran.",
			en: "Shows sequential Idgham/Ikhfa tanween with its matching me_quran font.",
		},
	},
	{
		id: "tanzil-uthmani-me-quran",
		textProfile: "tanzil-canonical",
		fontFamily: "'me_quran', 'KFGQPC Uthmanic Script HAFS', serif",
		suggestedAyahMarkerStyle: "parenthesized",
		label: { ar: "Tanzil القياسي + me_quran", en: "Tanzil canonical + me_quran" },
		description: {
			ar: "يعزل أثر الخط: نص Tanzil القياسي نفسه لكن مع خط me_quran.",
			en: "Isolates the font effect: canonical Tanzil text rendered with me_quran.",
		},
	},
	{
		id: "tanzil-uthmani-kfgqpc",
		textProfile: "tanzil-canonical",
		fontFamily: "'KFGQPC Uthmanic Script HAFS', 'me_quran', serif",
		suggestedAyahMarkerStyle: "end-symbol",
		label: { ar: "Tanzil القياسي + KFGQPC المضمّن", en: "Tanzil canonical + bundled KFGQPC" },
		description: {
			ar: "خط المقارنة القديم المضمّن في الإضافة، مع علامة نهاية آية قرآنية.",
			en: "The plugin's original bundled comparison font with a Quranic end marker.",
		},
	},
	{
		id: "tanzil-uthmani-qpc-v18",
		textProfile: "tanzil-canonical",
		fontFamily: "'QPC Hafs v18', 'KFGQPC Uthmanic Script HAFS', serif",
		suggestedAyahMarkerStyle: "end-symbol",
		label: { ar: "Tanzil القياسي + QPC Hafs v18", en: "Tanzil canonical + QPC Hafs v18" },
		description: {
			ar: "خط QPC Hafs حديث من Quran Foundation لاختبار مواضع الحركات وعلامة الآية.",
			en: "A current Quran Foundation QPC Hafs candidate for testing marks and ayah endings.",
		},
	},
];

export function getQuranRenderingProfile(id: string | undefined): QuranRenderingProfile {
	return QURAN_RENDERING_PROFILES.find((profile) => profile.id === id) ?? QURAN_RENDERING_PROFILES[0];
}
