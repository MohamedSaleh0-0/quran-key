import type { Locale } from "../../config/types";

export type SettingFieldType = "toggle" | "text" | "textarea" | "dropdown" | "slider" | "color";

export interface SettingFieldDefinition {
	key: string;
	type: SettingFieldType;
	label: Record<Locale, string>;
	description: Record<Locale, string>;
	dropdownOptions?: Array<{ value: string; label: string }>;
	slider?: { min: number; max: number; step: number };
}

export interface SettingsSectionDefinition {
	id: string;
	heading: Record<Locale, string>;
	fields: SettingFieldDefinition[];
}

export const SETTINGS_SCHEMA: SettingsSectionDefinition[] = [
	{
		id: "general",
		heading: { ar: "عام", en: "General" },
		fields: [
			{
				key: "interfaceLanguage",
				type: "dropdown",
				label: { ar: "لغة الواجهة", en: "Interface language" },
				description: {
					ar: "لغة كل نصوص الواجهة، بما فيها صفحة الإعدادات هذه.",
					en: "Language for the entire interface, including this settings page.",
				},
				dropdownOptions: [
					{ value: "ar", label: "العربية" },
					{ value: "en", label: "English" },
				],
			},
		],
	},
	{
		id: "text",
		heading: { ar: "التحكم في النصوص والتخريج", en: "Text & Output" },
		fields: [
			{
				key: "stripTashkeel",
				type: "toggle",
				label: { ar: "إدراج النص مجرداً من التشكيل", en: "Strip tashkeel on insert" },
				description: {
					ar: "إدراج الآيات بدون علامات الضبط والتشكيل.",
					en: "Insert verses without diacritics.",
				},
			},
			{
				key: "referenceFormat",
				type: "text",
				label: { ar: "صيغة الإحالة المرجعية", en: "Reference format" },
				description: {
					ar: "يجب أن تحوي {surah} و{verse}، مثل [{surah}:{verse}].",
					en: "Must contain {surah} and {verse}, e.g. [{surah}:{verse}].",
				},
			},
			{
				key: "wrapperStart",
				type: "text",
				label: { ar: "بداية إطار الآية", en: "Verse wrapper — start" },
				description: { ar: "الرمز الذي يفتتح به نص الآية المدرجة.", en: "Glyph that opens an inserted verse." },
			},
			{
				key: "wrapperEnd",
				type: "text",
				label: { ar: "نهاية إطار الآية", en: "Verse wrapper — end" },
				description: { ar: "الرمز الذي يختتم به نص الآية المدرجة.", en: "Glyph that closes an inserted verse." },
			},
		],
	},
	{
		id: "search",
		heading: { ar: "البحث", en: "Search" },
		fields: [
			{
				key: "showAnalytics",
				type: "toggle",
				label: { ar: "إظهار لوحة التحليلات", en: "Show analytics dashboard" },
				description: {
					ar: "عرض إحصاءات فورية لنتائج البحث (الإجمالي، الأكثر تكراراً، الأعلى كثافة).",
					en: "Show live match statistics under the search input.",
				},
			},
			{
				key: "searchStrategy",
				type: "dropdown",
				label: { ar: "آلية البحث عن الآيات", en: "Verse search mechanism" },
				description: {
					ar: "حرفي: مطابقة الكلمات بنفس ترتيبها. تقريبي: ظهور الكلمات بأي ترتيب في الآية.",
					en: "Literal: search words in exact order. Fuzzy: search words in any order.",
				},
				dropdownOptions: [
					{ value: "literal", label: "Literal" },
					{ value: "fuzzy", label: "Fuzzy" },
				],
			},
		],
	},
	{
		id: "tafsir",
		heading: { ar: "إعدادات محرك التفسير السياقي", en: "Tafsir Engine" },
		fields: [
			{
				key: "tafsirBookSortOrder",
				type: "dropdown",
				label: { ar: "ترتيب كتب التفسير", en: "Tafsir book order" },
				description: { ar: "رتّب الكتب بالاسم أو بوقت إنشاء المصدر المخصص.", en: "Sort books alphabetically or by the time a custom source was created." },
				dropdownOptions: [
					{ value: "name", label: "الاسم / Name" },
					{ value: "created", label: "وقت الإنشاء / Created" },
				],
			},
			{
				key: "rangeHeadingLevel",
				type: "text",
				label: { ar: "مستوى عنوان نطاق الآيات", en: "Range heading level" },
				description: {
					ar: "المستوى المستخدم لعنوان النطاق (مثل ###).",
					en: "Markdown heading marker for the range (e.g. ###).",
				},
			},
			{
				key: "bookHeadingLevel",
				type: "text",
				label: { ar: "مستوى عنوان كتاب التفسير", en: "Book heading level" },
				description: {
					ar: "المستوى المستخدم لعنوان المفسر (مثل ####).",
					en: "Markdown heading marker for each book (e.g. ####).",
				},
			},
			{
				key: "ayahHeadingLevel",
				type: "text",
				label: { ar: "مستوى عنوان الآية", en: "Ayah heading level" },
				description: {
					ar: "المستوى المستخدم لعنوان كل آية (مثل #####).",
					en: "Markdown heading marker for each ayah (e.g. #####).",
				},
			},
			{
				key: "tafsirRangeHeadingTemplate",
				type: "text",
				label: { ar: "قالب عنوان النطاق", en: "Range heading template" },
				description: {
					ar: "المتاح: {surah} و{start} و{end}. لا تُضاف كلمة «تفسير» تلقائياً.",
					en: "Available placeholders: {surah}, {start}, and {end}. No tafsir label is added automatically.",
				},
			},
			{
				key: "tafsirBookHeadingTemplate",
				type: "text",
				label: { ar: "قالب عنوان الكتاب", en: "Book heading template" },
				description: {
					ar: "المتاح: {book}.",
					en: "Available placeholder: {book}.",
				},
			},
			{
				key: "tafsirAyahHeadingTemplate",
				type: "text",
				label: { ar: "قالب عنوان الآية", en: "Ayah heading template" },
				description: {
					ar: "المتاح: {ayah}. يُستخدم لكل استجابة كما أعادها المصدر، حتى لو احتوت على آيات إضافية.",
					en: "Available placeholder: {ayah}. It is used once per source response, even if that response contains extra ayahs.",
				},
			},
			{
				key: "includeAyahTextInTafsir",
				type: "toggle",
				label: { ar: "تضمين نص الآية القرآنية", en: "Include ayah text" },
				description: { ar: "إدراج نص الآية قبل تفسيرها.", en: "Insert the verse text before its commentary." },
			},
			{
				key: "useHorizontalDivider",
				type: "toggle",
				label: { ar: "استخدام فاصل أفقي", en: "Use horizontal divider" },
				description: { ar: "إدراج فاصل (---) بين كتب التفسير المختلفة لنفس الآيات.", en: "Insert a '---' divider between multiple commentaries." },
			},
		],
	},
	{
		id: "style",
		heading: { ar: "تنسيق مظهر الآيات", en: "Verse Style" },
		fields: [
			{
				key: "quranFontSize",
				type: "slider",
				label: { ar: "حجم الخط", en: "Font size" },
				description: { ar: "حجم خط الآيات القرآنية (em).", en: "Verse font size in em." },
				slider: { min: 0.8, max: 2.5, step: 0.05 },
			},
			{
				key: "quranLineHeight",
				type: "slider",
				label: { ar: "ارتفاع السطر", en: "Line height" },
				description: { ar: "تباعد الأسطر لمنع تداخل الحركات وعلامات الوقف.", en: "Line spacing for Qur'anic text." },
				slider: { min: 1.5, max: 3.5, step: 0.1 },
			},
			{
				key: "quranColorDark",
				type: "color",
				label: { ar: "لون الآيات في الوضع الداكن", en: "Verse color in dark mode" },
				description: { ar: "لون متن الآيات عند استخدام سمة Obsidian الداكنة.", en: "Color used for Qur'anic text in Obsidian's dark theme." },
			},
			{
				key: "quranColorLight",
				type: "color",
				label: { ar: "لون الآيات في الوضع الفاتح", en: "Verse color in light mode" },
				description: { ar: "لون متن الآيات عند استخدام سمة Obsidian الفاتحة.", en: "Color used for Qur'anic text in Obsidian's light theme." },
			},
			{
				key: "styleOrnateNumbers",
				type: "toggle",
				label: { ar: "تمييز أرقام الآيات", en: "Highlight ayah numbers" },
				description: {
					ar: "يضيف تنسيقًا مميزًا للأرقام العربية داخل الشاهد في المعاينة ووضع القراءة.",
					en: "Applies distinct styling to Arabic-Indic numbers inside Quran passages in Live Preview and Reading View.",
				},
			},
			{
				key: "customCss",
				type: "textarea",
				label: { ar: "CSS مخصص", en: "Custom CSS" },
				description: {
					ar: "أضف قواعد CSS مخصصة لتعديل عناصر الإضافة. الفئات المتاحة للاستهداف: .cm-quran-key-text (متن الآية)، .quran-key-ornate-number (رقم الآية المزخرف)، .quran-key-highlight (تمييز البحث).",
					en: "Add custom CSS rules targeting plugin elements: .cm-quran-key-text (verse text), .quran-key-ornate-number (ornate ayah number), .quran-key-highlight (search match).",
				},
			},
		],
	},
	{
		id: "reflections",
		heading: { ar: "ملاحظات الآيات", en: "Ayah Notes" },
		fields: [
			{
				key: "ayahNotesFolder",
				type: "text",
				label: { ar: "مجلد ملاحظات الآيات الموحدة", en: "Unified notes folder" },
				description: {
					ar: "المجلد الذي تُحفظ فيه ملاحظات الآيات.",
					en: "Folder where unified ayah notes are saved.",
				},
			},
			{
				key: "surahNotesFolder",
				type: "text",
				label: { ar: "مجلد ملاحظات السور", en: "Surah notes folder" },
				description: {
					ar: "المجلد الذي تُحفظ فيه ملاحظة كل سورة.",
					en: "Folder where one complete note is saved for each surah.",
				},
			},
			{
				key: "surahNoteFileNameTemplate",
				type: "text",
				label: { ar: "صيغة عنوان ملف السورة", en: "Surah note filename template" },
				description: {
					ar: "المتغير المتاح: {surah}.",
					en: "Available placeholder: {surah}.",
				},
			},
			{
				key: "linkAyahMarkersOnInsert",
				type: "toggle",
				label: { ar: "ربط أرقام الآيات بالملاحظات", en: "Link ayah markers to notes" },
				description: {
					ar: "عند إدراج آية من الاستخراج أو البحث، ينشئ ملاحظتها ويربط رقمها فقط، دون ربط نص الآية.",
					en: "When inserting an ayah from extraction or search, create its note and link only the ayah marker, not the Quran text.",
				},
			},
			{
				key: "showOrphanAyahConversionPreview",
				type: "toggle",
				label: { ar: "إظهار معاينة تحويل الآيات", en: "Show ayah conversion preview" },
				description: {
					ar: "يعرض الآيات التي سيجري ربطها قبل التنفيذ، مع إتاحة التراجع بعده.",
					en: "Show the ayahs that will be linked before conversion, with rollback available afterward.",
				},
			},
			{
				key: "ayahNoteTemplate",
				type: "textarea",
				label: { ar: "قالب ملاحظة الآية", en: "Ayah note template" },
				description: {
					ar: "قالب جسم الملف عند إنشائه. المتغير {ayah} يدرج نص الآية المنسق؛ اتركه فارغًا لإنشاء ملف بلا نص آية.",
					en: "Template for a newly-created ayah note body. {ayah} inserts the formatted ayah; leave empty for no ayah text.",
				},
			},
			{
				key: "reflectionInsertionMode",
				type: "dropdown",
				label: { ar: "ترتيب المُدخلات الجديدة", en: "New entries placement" },
				description: {
					ar: "مباشرة أسفل العنوان: الأحدث أولاً. نهاية القسم: ترتيب زمني تصاعدي.",
					en: "After heading: newest first. End of section: chronological order.",
				},
				dropdownOptions: [
					{ value: "afterHeading", label: "afterHeading" },
					{ value: "endOfSection", label: "endOfSection" },
				],
			},
			{
				key: "showReflectionSuccessNotice",
				type: "toggle",
				label: { ar: "إظهار إشعار نجاح التسجيل", en: "Show reflection success notice" },
				description: {
					ar: "يعرض إشعارًا صغيرًا بعد تسجيل الملاحظة بنجاح.",
					en: "Show a small notice after a reflection is logged successfully.",
				},
			},
			{
				key: "reflectionCategoryDelimiter",
				type: "text",
				label: { ar: "فاصل التصنيف السريع", en: "Quick category delimiter" },
				description: {
					ar: "مثال: content -- تدبرات. ما بعد الفاصل يُعامل كاسم التصنيف.",
					en: "Example: content -- Reflections. Text after the delimiter is treated as the category.",
				},
			},
			{
				key: "reflectionFileNameTemplate",
				type: "text",
				label: { ar: "صيغة عنوان ملف الآية", en: "Ayah file name template" },
				description: {
					ar: "يجب أن تحوي {ayahText}. متاح أيضاً: {surah} و {verse}.",
					en: "Must contain {ayahText}; {surah} and {verse} are available.",
				},
			},
			{
				key: "reflectionEntryTemplate",
				type: "textarea",
				label: { ar: "صيغة كل تدوينة", en: "Reflection entry template" },
				description: {
					ar: "المتغيرات المتاحة: {content} و {date}. مثال: «- {content} — {date}».",
					en: "Available placeholders: {content} and {date}. Example: '- {content} — {date}'.",
				},
			},
		],
	},
];
