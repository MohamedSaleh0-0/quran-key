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
		id: "advancedFeatures",
		heading: { ar: "مزايا المستخدم المتقدم", en: "Power-user features" },
		fields: [
			{
				key: "enableAtSectionTrigger",
				type: "toggle",
				label: { ar: "مُشغّل الأقسام @", en: "Enable @ section trigger" },
				description: {
					ar: "عند كتابة @ داخل نافذة تسجيل الملاحظة، افتح اختيار الأقسام. هذا الخيار معطل افتراضياً.",
					en: "Typing @ in the log-entry modal opens section selection. Disabled by default.",
				},
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
				key: "quranColor",
				type: "color",
				label: { ar: "لون الآيات", en: "Verse color" },
				description: { ar: "اللون المميز للآيات القرآنية.", en: "Accent color for Qur'anic verses." },
			},
			{
				key: "styleOrnateNumbers",
				type: "toggle",
				label: { ar: "تنسيق الأرقام المزخرفة", en: "Style ornate numbers" },
				description: {
					ar: "إعطاء رقم الآية لوناً مميزاً في المعاينة والقراءة.",
					en: "Gives the ayah number its own accent color in preview and reading view.",
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
				key: "includeAyahTextInReflectionNote",
				type: "toggle",
				label: { ar: "تضمين نص الآية في أول الملاحظة", en: "Include ayah text at the top" },
				description: {
					ar: "كتابة نص الآية مرة واحدة عند إنشاء الملف لأول مرة.",
					en: "Write verse text once when creating the note.",
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
				key: "reflectionEntrySeparator",
				type: "textarea",
				label: { ar: "الفاصل بين المُدخلات", en: "Entry separator" },
				description: {
					ar: "نص يُدرج بين التدوينات المتتالية (يدعم أسطر فارغة).",
					en: "Text inserted between consecutive entries.",
				},
			},
			{
				key: "deleteSelectionAfterLinkingReflection",
				type: "toggle",
				label: { ar: "استبدال النص المحدد برابط للآية", en: "Replace selection with link" },
				description: {
					ar: "استبدال النص المختار برابط لملاحظة الآية بدلاً من تركه كنسخة مكررة.",
					en: "Replace selected text with a backlink to the ayah note.",
				},
			},
			{
				key: "reflectionBacklinkAliasTemplate",
				type: "text",
				label: { ar: "صيغة الاسم المستعار للرابط (alias)", en: "Link alias template" },
				description: {
					ar: "المتغيرات المتاحة: {surah} و {verse} و {ayahText}. اتركه فارغاً لرابط صريح.",
					en: "Available placeholders: {surah}, {verse}, {ayahText}. Leave empty for plain link.",
				},
			},
			{
				key: "reflectionBacklinkWrapTemplate",
				type: "text",
				label: { ar: "صيغة إحاطة الرابط", en: "Link wrap template" },
				description: {
					ar: "المتغير الوحيد: {link}. مثال: «↳ نُقل إلى {link}».",
					en: "Only {link} placeholder is available.",
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
				key: "reflectionEntryPrefixTemplate",
				type: "text",
				label: { ar: "صيغة بداية كل مُدخل", en: "Entry prefix template" },
				description: {
					ar: "المتغير المتاح: {date}. مثال: «### {date}».",
					en: "Available placeholder: {date}. e.g. '### {date}'.",
				},
			},
			{
				key: "includeReflectionEntryDate",
				type: "toggle",
				label: { ar: "إضافة تاريخ الإدخال", en: "Add entry date" },
				description: {
					ar: "يُدرج التاريخ عند احتواء صيغة الإدخال على {date}.",
					en: "Insert the date when the entry prefix contains {date}.",
				},
			},
		],
	},
];
