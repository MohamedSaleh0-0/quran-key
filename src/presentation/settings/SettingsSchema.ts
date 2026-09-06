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
		id: "text",
		heading: { ar: "التحكم في النصوص والتخريج", en: "Text handling & output" },
		fields: [
			{
				key: "stripTashkeel",
				type: "toggle",
				label: { ar: "إدراج النص مجرداً من التشكيل", en: "Strip tashkeel on insert" },
				description: {
					ar: "عند التفعيل، تُدرَج الآيات بلا علامات ضبط وتشكيل كحالة افتراضية.",
					en: "When enabled, inserted ayahs have tashkeel/diacritics stripped by default.",
				},
			},
			{
				key: "useOrnateNumbers",
				type: "toggle",
				label: { ar: "استخدام الأرقام المزخرفة", en: "Use ornate numbers" },
				description: {
					ar: "تحويل رقم الآية العادي بين قوسين إلى الرمز المصحفي المزخرف بالأرقام العربية.",
					en: "Converts plain \"(n)\" ayah markers into the ring-glyph ornate style.",
				},
			},
			{
				key: "referenceFormat",
				type: "text",
				label: { ar: "صيغة الإحالة المرجعية", en: "Reference format" },
				description: {
					ar: "يجب أن تحوي {surah} و{verse}، مثل [{surah}:{verse}]. تتحكم فعلياً في التعرف على المرجع وكتابته (راجع ARCHITECTURE.md NFR-3).",
					en: "Must contain {surah} and {verse}, e.g. [{surah}:{verse}]. Actually drives parsing AND output (see docs/ARCHITECTURE.md NFR-3).",
				},
			},
			{
				key: "wrapperStart",
				type: "text",
				label: { ar: "بداية إطار الآية", en: "Verse wrapper — start glyph" },
				description: { ar: "الرمز الذي يفتتح به نص الآية المدرجة.", en: "Glyph that opens an inserted ayah." },
			},
			{
				key: "wrapperEnd",
				type: "text",
				label: { ar: "نهاية إطار الآية", en: "Verse wrapper — end glyph" },
				description: { ar: "الرمز الذي يختتم به نص الآية المدرجة.", en: "Glyph that closes an inserted ayah." },
			},
			{
				key: "ornateRingGlyph",
				type: "text",
				label: { ar: "رمز الرقم المزخرف", en: "Ornate number ring glyph" },
				description: { ar: "الرمز المستخدم مع الأرقام المزخرفة (الافتراضي: ۝).", en: "Glyph used to ring ornate ayah numbers (default: ۝)." },
			},
		],
	},
	{
		id: "search",
		heading: { ar: "البحث والواجهة", en: "Search & interface" },
		fields: [
			{
				key: "showAnalytics",
				type: "toggle",
				label: { ar: "إظهار لوحة التحليلات", en: "Show analytics dashboard" },
				description: {
					ar: "عرض إحصاءات فورية (الإجمالي، الأكثر تكراراً، الأعلى كثافة) أسفل شريط البحث.",
					en: "Live match statistics under the search modal's input.",
				},
			},
			{
				key: "interfaceLanguage",
				type: "dropdown",
				label: { ar: "لغة الواجهة", en: "Interface language" },
				description: {
					ar: "لغة النصوص التفاعلية (البحث، لوحة التحليلات، منتقي التفسير).",
					en: "Language for the plugin's interactive UI text.",
				},
				dropdownOptions: [
					{ value: "ar", label: "العربية" },
					{ value: "en", label: "English" },
				],
			},
			{
				key: "searchStrategy",
				type: "dropdown",
				label: { ar: "آلية البحث عن الآيات", en: "Verse search mechanism" },
				description: {
					ar: "حرفي: يجب أن تظهر كلمات البحث متتالية وبنفس ترتيبها داخل الآية. تقريبي: يكفي أن تظهر كل كلمة في أي مكان بالآية.",
					en: "Literal: search words must appear contiguously and in order within the ayah. Fuzzy: each word just needs to appear anywhere in the ayah.",
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
		heading: { ar: "إعدادات محرك التفسير السياقي", en: "Tafsir engine" },
		fields: [
			{
				key: "rangeHeadingLevel",
				type: "text",
				label: { ar: "حجم عنوان نطاق الآيات", en: "Range heading level" },
				description: {
					ar: "مثل ### أو ## أو أي مستوى تريده — نص حر بلا سقف أو حد أدنى.",
					en: "e.g. ### or ## or any level you like — free text, no fixed ceiling or floor.",
				},
			},
			{
				key: "bookHeadingLevel",
				type: "text",
				label: { ar: "حجم عنوان كتاب التفسير", en: "Book heading level" },
				description: {
					ar: "مستوى الـ Heading لعنوان كل كتاب تفسير على حدة — نص حر.",
					en: "Heading level for each book's own heading — free text.",
				},
			},
			{
				key: "includeAyahTextInTafsir",
				type: "toggle",
				label: { ar: "تضمين نص الآية القرآنية", en: "Include ayah text" },
				description: { ar: "طباعة نص الآية داخل الأقواس قبل متن تفسيرها.", en: "Print the ayah's own text before its commentary." },
			},
			{
				key: "useHorizontalDivider",
				type: "toggle",
				label: { ar: "استخدام فاصل أفقي", en: "Use horizontal divider" },
				description: { ar: "إدراج فاصل (---) بين كتب تفسير متعددة لنفس النطاق.", en: "Insert a '---' divider between multiple books' output." },
			},
		],
	},
	{
		id: "style",
		heading: { ar: "تنسيق مظهر الأقواس القرآنية", en: "Qur'anic text style" },
		fields: [
			{
				key: "quranFontFamily",
				type: "text",
				label: { ar: "نوع الخط المصحفي", en: "Font family" },
				description: {
					ar: "الخط المدمج الافتراضي هو خط مجمع الملك فهد (KFGQPC Uthmanic Script HAFS) مطابق لتطبيق آية، مع خط Amiri Quran كبديل.",
					en: "Default bundled font is King Fahd Complex (KFGQPC Uthmanic Script HAFS), with Amiri Quran as fallback.",
				},
			},
			{
				key: "quranFontSize",
				type: "slider",
				label: { ar: "حجم الخط", en: "Font size" },
				description: { ar: "حجم خط الآية بوحدة (em) نسبةً لمتن النص.", en: "Ayah font size in em, relative to body text." },
				slider: { min: 0.8, max: 2.5, step: 0.05 },
			},
			{
				key: "quranLineHeight",
				type: "slider",
				label: { ar: "ارتفاع السطر", en: "Line height" },
				description: { ar: "تباعد الأسطر لمنع تداخل الحركات وعلامات الوقف (الافتراضي 2.4).", en: "Line spacing to prevent tashkeel/waqf marks overlapping (default 2.4)." },
				slider: { min: 1.5, max: 3.5, step: 0.1 },
			},
			{
				key: "quranColor",
				type: "color",
				label: { ar: "لون الآيات", en: "Qur'anic text color" },
				description: { ar: "اللون المميز للشواهد القرآنية داخل الأقواس.", en: "Accent color for Qur'anic quotes inside the wrapper glyphs." },
			},
			{
				key: "styleOrnateNumbers",
				type: "toggle",
				label: { ar: "تنسيق الأرقام المزخرفة", en: "Style ornate numbers" },
				description: {
					ar: "عند التفعيل، يُميَّز الرقم المزخرف بصرياً في المعاينة المباشرة وعرض القراءة عبر الصنف .quran-key-ornate-number.",
					en: "When enabled, ornate ayah numbers get their own visual highlight in Live Preview and Reading view.",
				},
			},
			{
				key: "customCss",
				type: "textarea",
				label: { ar: "CSS مخصص", en: "Custom CSS" },
				description: {
					ar: "يُلحق حرفياً بعد المتغيرات المولّدة تلقائياً.",
					en: "Appended verbatim after the auto-generated CSS variables.",
				},
			},
		],
	},
	{
		id: "reflections",
		heading: { ar: "ملاحظات الآيات (التدبرات والآثار)", en: "Ayah notes (تدبر / أثر)" },
		fields: [
			{
				key: "ayahNotesFolder",
				type: "text",
				label: { ar: "مجلد ملاحظات الآيات الموحّدة", en: "Unified ayah notes folder" },
				description: {
					ar: "المجلد الذي تُحفظ فيه ملاحظة الآية الموحّدة.",
					en: "Folder holding each ayah's unified note.",
				},
			},
			{
				key: "includeAyahTextInReflectionNote",
				type: "toggle",
				label: { ar: "تضمين نص الآية في أول الملاحظة", en: "Include ayah text at the top of the note" },
				description: {
					ar: "يُكتب مرة واحدة فقط عند إنشاء الملاحظة لأول مرة.",
					en: "Written once, when the note is first created.",
				},
			},
			{
				key: "reflectionInsertionMode",
				type: "dropdown",
				label: { ar: "ترتيب المُدخلات الجديدة", en: "New-entry placement" },
				description: {
					ar: "مباشرة أسفل العنوان: الأحدث يظهر أولاً. نهاية القسم: ترتيب زمني.",
					en: "Directly under the heading: newest first. End of section: chronological.",
				},
				dropdownOptions: [
					{ value: "afterHeading", label: "afterHeading" },
					{ value: "endOfSection", label: "endOfSection" },
				],
			},
			{
				key: "reflectionEntrySeparator",
				type: "textarea",
				label: { ar: "الفاصل بين المُدخلات", en: "Separator between entries" },
				description: {
					ar: "يُدرج بين كل مُدخل والذي يليه. يدعم أسطر Enter أو \\n. اتركه فارغاً تماماً للقوائم النقطية.",
					en: "Inserted between entries. Supports newlines or \\n. Leave empty for continuous lists.",
				},
			},
			{
				key: "deleteSelectionAfterLinkingReflection",
				type: "toggle",
				label: { ar: "استبدال النص المحدد برابط للآية", en: "Replace selection with a backlink" },
				description: {
					ar: "عند التفعيل، يُستبدل النص المحدد برابط لملاحظة الآية بدل حذفه. عند التعطيل يبقى النص كما هو.",
					en: "When enabled, the selected text is replaced with a backlink to the ayah note.",
				},
			},
			{
				key: "reflectionBacklinkAliasTemplate",
				type: "text",
				label: { ar: "صيغة نص الرابط (alias)", en: "Backlink alias template" },
				description: {
					ar: "{surah} و{verse} و{ayahText} متاحة. اتركه فارغاً لرابط بلا alias.",
					en: "{surah}, {verse}, {ayahText} available. Leave empty for no alias.",
				},
			},
			{
				key: "reflectionBacklinkWrapTemplate",
				type: "text",
				label: { ar: "صيغة إحاطة الرابط", en: "Backlink wrap template" },
				description: {
					ar: "{link} هو المتغيّر الوحيد. مثال: \"↳ نُقل إلى {link}\".",
					en: 'Only {link} is available as a placeholder.',
				},
			},
			{
				key: "reflectionFileNameTemplate",
				type: "text",
				label: { ar: "صيغة عنوان ملف الآية", en: "Ayah note title format" },
				description: {
					ar: "يجب أن تحوي {ayahText}؛ يمكن أيضاً استخدام {surah} و{verse}.",
					en: 'Must contain {ayahText}; {surah} and {verse} are also available.',
				},
			},
			{
				key: "reflectionEntryPrefixTemplate",
				type: "text",
				label: { ar: "صيغة بداية كل مُدخل", en: "Entry prefix format" },
				description: {
					ar: "{date} هو المتغيّر الوحيد المتاح. أمثلة: \"### {date}\" أو \"- {date}\".",
					en: 'Only {date} is available as a placeholder.',
				},
			},
		],
	},
];