import type { Locale } from "./types";

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
		"reflection.noSelection": "حدد نصًا أولاً لتسجيله.",
		"reflection.unknownCategory": "تصنيف غير معروف.",
		"reflection.rangeNoticeTitle": "ملحوظة",
		"reflection.rangeNoticeBody": "هذا {category} عام على الآيات من {start} إلى {end}، وليس خاصًا بهذه الآية وحدها.",
		"linkAyat.title": "ربط آيات متشابهة",
		"linkAyat.placeholder": "ابحث عن آية لإضافتها إلى الربط...",
		"linkAyat.empty": "اكتب كلمات بحث لعرض الآيات.",
		"linkAyat.selectedPrefix": "المُختار:",
		"linkAyat.hint": "اختر آيتين على الأقل ثم اضغط «ربط المحدد» (أو Shift+Enter).",
		"linkAyat.confirm": "ربط المحدد",
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
		"reflection.noSelection": "Select some text first to log it.",
		"reflection.unknownCategory": "Unknown reflection category.",
		"reflection.rangeNoticeTitle": "Note",
		"reflection.rangeNoticeBody": "This {category} concerns the range {start}\u2013{end} as a whole, not only this ayah.",
		"linkAyat.title": "Link related ayahs",
		"linkAyat.placeholder": "Search for an ayah to add to the link...",
		"linkAyat.empty": "Type search words to see ayahs.",
		"linkAyat.selectedPrefix": "Selected:",
		"linkAyat.hint": "Select at least two ayahs, then click \"Link selected\" (or Shift+Enter).",
		"linkAyat.confirm": "Link selected",
	},
};

export function t(locale: Locale, key: string, vars?: Record<string, string | number>): string {
	const currentLocale: Locale = locale === "en" ? "en" : "ar";
	const table: Record<string, string> = STRINGS[currentLocale] ?? STRINGS.ar;
	const rawValue: string = table[key] ?? STRINGS.ar[key] ?? key;
	let value: string = rawValue;
	if (vars) {
		for (const k of Object.keys(vars)) {
			const val = String(vars[k]);
			value = value.split(`{${k}}`).join(val);
		}
	}
	return value;
}
