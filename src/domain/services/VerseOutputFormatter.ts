import type { Ayah } from "../entities/Ayah";
import type { CompiledVerseReference } from "../value-objects/VerseReference";
import type { OrnateNumberConverter } from "./OrnateNumberConverter";
import { formatAyahMarker, type AyahMarkerStyle } from "./AyahMarkerFormatter";

export interface FormattingOptions {
	wrapperStart: string;
	wrapperEnd: string;
	useOrnateNumbers: boolean;
	stripTashkeelOnOutput: boolean;
	/** Explicit marker style used by generated Quran text. */
	ayahMarkerStyle?: AyahMarkerStyle;
	/** Optional note titles keyed as `${surahId}:${ayahId}`. Only the ayah
	 * marker is linked; the Quran text remains plain text. */
	ayahNoteLinks?: ReadonlyMap<string, string>;
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
			const key = `${a.surahId}:${a.ayahId}`;
			const target = options.ayahNoteLinks?.get(key);
			const rawMarker = options.ayahMarkerStyle
				? formatAyahMarker(a.ayahId, options.ayahMarkerStyle)
				: `(${a.ayahId})`;
			const marker = target ? `[[${target}|${rawMarker}]]` : rawMarker;
			return `${text} ${marker}`;
		});
		const core = `${options.wrapperStart} ${formatted.join(" ")} ${options.wrapperEnd}`;
		const finalCore = options.ayahMarkerStyle || !options.useOrnateNumbers ? core : this.ornateConverter.applyOrnateNumbers(core);

		const first = ayahs[0];
		const last = ayahs[ayahs.length - 1];
		const reference = ` ${this.reference.format(first.surahName, first.ayahId, last.ayahId)}`;
		return finalCore + reference;
	}
}
