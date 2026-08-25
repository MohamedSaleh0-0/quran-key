import type { Locale } from "./types";

/**
 * Transient UI strings (modal placeholders, dashboard labels, notices).
 * Setting names/descriptions live next to their field in
 * presentation/settings/SettingsSchema.ts instead, since those are
 * inherently 1:1 with a field and duplicating a key here would just be
 * indirection without benefit.
 *
 * v1 had these hardcoded inline as Arabic string literals inside DOM
 * builders. This table is the seam NFR-nothing-specific but §5.3/§7 in the
 * docs rely on: adding a locale is "add a key to this object", not "hunt
 * every component for a literal".
 */
export const STRINGS: Record<Locale, Record<string, string>> = {
	ar: {
		"search.placeholder": "اكتب كلمات البحث بدقة لدراسة المواضيع القرآنيّة...",
		"analytics.total": "إجمالي المواضع",
		"analytics.mostQuoted": "الأكثر تكراراً",
		"analytics.densest": "الأعلى كثافة نصية",
		"analytics.empty": "-",
		"rangeEnd.placeholderPrefix": "اختر آية نهاية النطاق لسورة",
		"rangeEnd.placeholderSuffix": "تبدأ من الآية",
		"tafsir.pickerTitle": "تخصيص كُتُب التفسير المطلوبة",
		"tafsir.pickerPlaceholder": "ابحث في كتب التفسير (اكتب اسم المفسر أو جزءاً منه)...",
		"tafsir.pickerEmpty": "لم يتم العثور على كتب تطابق بحثك الحالي.",
		"tafsir.noBookFound": "لم يتم العثور على تفسير لهذا الموضع.",
		"tafsir.fetchFailed": "فشل الاتصال بالشبكة. تم الاحتفاظ بالأمر الحالي دون تغيير.",
		"tafsir.rangeHeading": "تفسير سورة {surah} ({start} - {end})",
		"tafsir.ayahHeadingLabel": "[تفسير آية {ayah}]:",
		"tafsir.emptyBook": "لم يتم العثور على التفسير لهذا الموضوع.",
		"tafsir.pickerConfirm": "إدراج المحدد",
		"tafsir.pickerHint": "اختر كتاباً أو أكثر ثم اضغط «إدراج المحدد» (أو Shift+Enter).",
		"tafsir.addSourceTitle": "+ إضافة مصدر تفسير مخصص",
		"tafsir.addSourceNamePlaceholder": "الاسم",
		"tafsir.addSourceAliasesPlaceholder": "أسماء بديلة، مفصولة بفواصل",
		"tafsir.addSourceUrlPlaceholder": "رابط يحوي {bookId} و{surahId} و{ayahId}",
		"tafsir.addSourceButton": "إضافة",
	},
	en: {
		"search.placeholder": "Type search words to look up Qur'anic verses...",
		"analytics.total": "Total matches",
		"analytics.mostQuoted": "Most quoted",
		"analytics.densest": "Highest density",
		"analytics.empty": "-",
		"rangeEnd.placeholderPrefix": "Choose the range's ending ayah for",
		"rangeEnd.placeholderSuffix": "starting from ayah",
		"tafsir.pickerTitle": "Choose tafsir books",
		"tafsir.pickerPlaceholder": "Search across all tafsir books (author or part of the name)...",
		"tafsir.pickerEmpty": "No books match your current search.",
		"tafsir.noBookFound": "No tafsir found for this position.",
		"tafsir.fetchFailed": "Network request failed. The line was left unchanged.",
		"tafsir.rangeHeading": "Tafsir of Surah {surah} ({start}-{end})",
		"tafsir.ayahHeadingLabel": "[Tafsir of ayah {ayah}]:",
		"tafsir.emptyBook": "No commentary found for this ayah.",
		"tafsir.pickerConfirm": "Insert selected",
		"tafsir.pickerHint": "Select one or more books, then click \"Insert selected\" (or Shift+Enter).",
		"tafsir.addSourceTitle": "+ Add a custom tafsir source",
		"tafsir.addSourceNamePlaceholder": "Name",
		"tafsir.addSourceAliasesPlaceholder": "aliases, comma-separated",
		"tafsir.addSourceUrlPlaceholder": "URL containing {bookId}, {surahId}, {ayahId}",
		"tafsir.addSourceButton": "Add",
	},
};

export function t(locale: Locale, key: string, vars?: Record<string, string | number>): string {
	const table = STRINGS[locale] ?? STRINGS.ar;
	let value = table[key] ?? STRINGS.ar[key] ?? key;
	if (vars) {
		for (const [k, v] of Object.entries(vars)) {
			value = value.replace(`{${k}}`, String(v));
		}
	}
	return value;
}
