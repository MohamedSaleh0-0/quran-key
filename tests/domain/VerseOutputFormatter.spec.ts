import { describe, expect, it } from "vitest";
import { VerseOutputFormatter } from "../../src/domain/services/VerseOutputFormatter";
import { OrnateNumberConverter } from "../../src/domain/services/OrnateNumberConverter";
import { VerseReference } from "../../src/domain/value-objects/VerseReference";
import type { Ayah } from "../../src/domain/entities/Ayah";

const ayah: Ayah = {
	id: 1,
	surahId: 1,
	ayahId: 1,
	surahName: "\u0627\u0644\u0641\u0627\u062A\u062D\u0629",
	text: "\u0628\u0650\u0633\u0652\u0645\u0650 \u0627\u0644\u0644\u0651\u0647\u0650",
};

describe("VerseOutputFormatter", () => {
	it("wraps text, appends the ayah number, and the compiled reference", () => {
		const reference = VerseReference.compile("[{surah}:{verse}]");
		const formatter = new VerseOutputFormatter(new OrnateNumberConverter("\u06DD"), reference, (t) => t);
		const output = formatter.format([ayah], {
			wrapperStart: "\uFD3F",
			wrapperEnd: "\uFD3E",
			useOrnateNumbers: false,
			stripTashkeelOnOutput: false,
		});
		expect(output.startsWith("\uFD3F ")).toBe(true);
		expect(output).toContain("(1)");
		expect(output).toContain("\uFD3E");
		expect(output.endsWith("[\u0627\u0644\u0641\u0627\u062A\u062D\u0629:1]")).toBe(true);
	});

	it("respects fully custom wrapper glyphs and reference template (NFR-3/NFR-4)", () => {
		const reference = VerseReference.compile("(\u0633\u0648\u0631\u0629 {surah}\u060C \u0622\u064A\u0629 {verse})");
		const formatter = new VerseOutputFormatter(new OrnateNumberConverter("\u06DD"), reference, (t) => t);
		const output = formatter.format([ayah], {
			wrapperStart: "\u00AB",
			wrapperEnd: "\u00BB",
			useOrnateNumbers: false,
			stripTashkeelOnOutput: true,
		});
		expect(output.startsWith("\u00AB")).toBe(true);
		expect(output).toContain("(\u0633\u0648\u0631\u0629 \u0627\u0644\u0641\u0627\u062A\u062D\u0629\u060C \u0622\u064A\u0629 1)");
	});

	it("converts ayah numbers to ornate Arabic-Indic digits when enabled", () => {
		const reference = VerseReference.compile("[{surah}:{verse}]");
		const formatter = new VerseOutputFormatter(new OrnateNumberConverter("\u06DD"), reference, (t) => t);
		const output = formatter.format([{ ...ayah, ayahId: 12 }], {
			wrapperStart: "\uFD3F",
			wrapperEnd: "\uFD3E",
			useOrnateNumbers: true,
			stripTashkeelOnOutput: false,
		});
		expect(output).toContain("\u06DD\u0661\u0662"); // ۝١٢
	});
});
