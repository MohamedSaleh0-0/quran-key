/**
 * Arabic text normalization for matching/search. v1 had this as a single
 * fixed function (`QuranText.normalizeForSearch`) with a hardcoded
 * substitution table baked in. Here the substitution table is injected
 * (NFR-2) — see data/normalizationRules.json for the shipped defaults and
 * settings.normalizationRules for the user-editable copy.
 *
 * Note on rule ordering: v1 applied its "يا أيها" rules before stripping
 * tashkeel and its short-alef rules after. None of the shipped rules'
 * patterns contain tashkeel marks, so applying the whole configured rule
 * list in one pass before stripping tashkeel is behaviorally identical for
 * the default ruleset while being far simpler to reason about for
 * user-added rules.
 */

export interface TextSubstitutionRule {
	pattern: string;
	flags: string;
	replacement: string;
	enabled: boolean;
}

const TASHKEEL_CLASS = "\\u0670\\u0610-\\u061A\\u064B-\\u065F\\u06D6-\\u06DC\\u06DF-\\u06E8\\u06EA-\\u06ED";
const TASHKEEL_REGEX = new RegExp(`[${TASHKEEL_CLASS}]`, "g");

export class ArabicNormalizer {
	private readonly compiledRules: Array<{ regex: RegExp; replacement: string }>;

	constructor(rules: readonly TextSubstitutionRule[]) {
		this.compiledRules = rules
			.filter((r) => r.enabled)
			.map((r) => ({ regex: new RegExp(r.pattern, r.flags || "g"), replacement: r.replacement }));
	}

	stripTashkeel(text: string): string {
		if (!text) return "";
		return text.replace(TASHKEEL_REGEX, "");
	}

	/** Normalize text for tolerant matching: applies configured
	 *  substitution rules, strips tashkeel, unifies letter-shape variants
	 *  (hamza forms, ya forms, waw-hamza, ta marbuta), then strips anything
	 *  outside the Arabic block/digits/whitespace. */
	normalizeForSearch(text: string): string {
		if (!text) return "";
		let out = text.trim();

		for (const rule of this.compiledRules) {
			out = out.replace(rule.regex, rule.replacement);
		}

		out = this.stripTashkeel(out);

		out = out
			.replace(/[\u0623\u0625\u0622\u0671\u0621\u0649]/g, "\u0627") // أ إ آ ٱ ء ى -> ا
			.replace(/[\u064A\u0626]/g, "\u064A") // ئ -> ي
			.replace(/\u0624/g, "\u0648") // ؤ -> و
			.replace(/\u0629/g, "\u0647") // ة -> ه
			.replace(/\u0640/g, ""); // strip tatweel (ـ)

		out = out.replace(/\u064A\u0627\u0627/g, "\u064A\u0627"); // ياا -> يا artifact cleanup

		out = out
			.replace(/[^\u0621-\u064A\s0-9\u0660-\u0669]/g, "")
			.replace(/\u0627+/g, "\u0627") // collapse repeated alefs
			.replace(/\s+/g, " ")
			.trim();

		return out;
	}

	/** Arabic-Indic (٠-٩) and Extended Arabic-Indic/Persian (۰-۹) digits -> Western digits. */
	static normalizeNumbers(text: string): string {
		if (!text) return "";
		return text
			.replace(/[\u0660-\u0669]/g, (d) => "\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669".indexOf(d).toString())
			.replace(/[\u06F0-\u06F9]/g, (d) => "\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9".indexOf(d).toString());
	}
}
