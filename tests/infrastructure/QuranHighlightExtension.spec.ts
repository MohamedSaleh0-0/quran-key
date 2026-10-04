import { describe, expect, it } from "vitest";
import { formatPortableAyahClipboardText } from "../../src/infrastructure/obsidian/QuranHighlightExtension";

describe("portable Quran clipboard text", () => {
	it("removes ayah wikilink syntax and emits a portable marker", () => {
		const source = "﴿ بِسْمِ ٱللَّهِ [[ayah-title|١]] ﴾";

		expect(formatPortableAyahClipboardText(source, "﴿", "﴾")).toBe("﴿ بِسْمِ ٱللَّهِ (1) ﴾");
	});

	it("normalizes an existing visible marker without changing ordinary links", () => {
		const source = "﴿ نص الآية ١ ﴾ [رابط](x)";

		expect(formatPortableAyahClipboardText(source, "﴿", "﴾")).toBe("﴿ نص الآية (1) ﴾ [رابط](x)");
	});
});
