import { describe, expect, it } from "vitest";
import { VerseReference } from "../../src/domain/value-objects/VerseReference";

describe("VerseReference (NFR-3: referenceFormat drives parsing AND formatting)", () => {
	it("formats using the configured template", () => {
		const ref = VerseReference.compile("[{surah}:{verse}]");
		expect(ref.format("\u0627\u0644\u0628\u0642\u0631\u0629", 255, 255)).toBe("[\u0627\u0644\u0628\u0642\u0631\u0629:255]");
		expect(ref.format("\u0627\u0644\u0628\u0642\u0631\u0629", 1, 5)).toBe("[\u0627\u0644\u0628\u0642\u0631\u0629:1-5]");
	});

	it("parses a reference matching the same template", () => {
		const ref = VerseReference.compile("[{surah}:{verse}]");
		const match = ref.find("\u0627\u0646\u0638\u0631 [\u0627\u0644\u0628\u0642\u0631\u0629:255] \u0641\u064A \u0627\u0644\u0645\u0648\u0636\u0648\u0639");
		expect(match).not.toBeNull();
		expect(match?.surahName).toBe("\u0627\u0644\u0628\u0642\u0631\u0629");
		expect(match?.startAyah).toBe(255);
		expect(match?.endAyah).toBe(255);
	});

	it("supports an entirely different template, including reversed placeholder order", () => {
		const ref = VerseReference.compile("(\u0633\u0648\u0631\u0629 {surah}\u060C \u0622\u064A\u0629 {verse})");
		const text = ref.format("\u0627\u0644\u0625\u062E\u0644\u0627\u0635", 1, 4);
		expect(text).toBe("(\u0633\u0648\u0631\u0629 \u0627\u0644\u0625\u062E\u0644\u0627\u0635\u060C \u0622\u064A\u0629 1-4)");
		const match = ref.find(`\u0631\u0627\u062C\u0639 ${text} \u0645\u0646 \u0641\u0636\u0644\u0643`);
		expect(match?.surahName).toBe("\u0627\u0644\u0625\u062E\u0644\u0627\u0635");
		expect(match?.startAyah).toBe(1);
		expect(match?.endAyah).toBe(4);
	});

	it("strips every reference occurrence from a line", () => {
		const ref = VerseReference.compile("[{surah}:{verse}]");
		const stripped = ref.strip(
			"\u0642\u0627\u0644 \u062A\u0639\u0627\u0644\u0649 [\u0627\u0644\u0628\u0642\u0631\u0629:255] \u0648\u0642\u0627\u0644 \u0623\u064A\u0636\u0627 [\u0622\u0644 \u0639\u0645\u0631\u0627\u0646:8]"
		);
		expect(stripped).toBe("\u0642\u0627\u0644 \u062A\u0639\u0627\u0644\u0649 \u0648\u0642\u0627\u0644 \u0623\u064A\u0636\u0627");
	});

	it("rejects a template missing a required placeholder", () => {
		expect(() => VerseReference.compile("[{surah}]")).toThrow();
	});
});
