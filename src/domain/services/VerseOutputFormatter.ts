import type { Ayah } from "../entities/Ayah";
import type { CompiledVerseReference } from "../value-objects/VerseReference";
import type { OrnateNumberConverter } from "./OrnateNumberConverter";

export interface FormattingOptions {
	wrapperStart: string;
	wrapperEnd: string;
	useOrnateNumbers: boolean;
	stripTashkeelOnOutput: boolean;
}

/** Builds the final `﴿ ayah text (n) ﴾ [Surah:n-m]` string. Every glyph is
 *  a parameter (from settings), and the reference suffix is delegated to
 *  the compiled VerseReference so the template is respected end-to-end. */
export class VerseOutputFormatter {
	constructor(
		private readonly ornateConverter: OrnateNumberConverter,
		private readonly reference: CompiledVerseReference,
		private readonly stripTashkeelFn: (text: string) => string
	) {}

	format(ayahs: readonly Ayah[], options: FormattingOptions): string {
		if (ayahs.length === 0) return "";
		const formatted = ayahs.map((a) => {
			const text = options.stripTashkeelOnOutput ? this.stripTashkeelFn(a.text) : a.text;
			return `${text} (${a.ayahId})`;
		});
		const core = `${options.wrapperStart} ${formatted.join(" ")} ${options.wrapperEnd}`;
		const finalCore = options.useOrnateNumbers ? this.ornateConverter.applyOrnateNumbers(core) : core;

		const first = ayahs[0];
		const last = ayahs[ayahs.length - 1];
		const reference = ` ${this.reference.format(first.surahName, first.ayahId, last.ayahId)}`;
		return finalCore + reference;
	}
}
