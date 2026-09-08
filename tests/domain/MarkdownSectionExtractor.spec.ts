import { describe, expect, it } from "vitest";
import { MarkdownSectionExtractor } from "../../src/domain/services/MarkdownSectionExtractor";

describe("MarkdownSectionExtractor", () => {
	it("extracts a section while preserving nested headings", () => {
		const content = [
			"# Ayah note",
			"",
			"### تدبرات",
			"Reflection one",
			"",
			"#### سؤال",
			"A follow-up question",
			"",
			"### آثار",
			"Another section",
		].join("\n");

		expect(
			MarkdownSectionExtractor.extract(content, { headingLevel: "###", headingText: "تدبرات" })
		).toBe("Reflection one\n\n#### سؤال\nA follow-up question");
	});

	it("does not include a sibling section", () => {
		const content = "### تدبرات\nReflection\n### آثار\nBenefit";
		expect(MarkdownSectionExtractor.extract(content, { headingLevel: "###", headingText: "تدبرات" })).toBe("Reflection");
	});

	it("returns null for a missing section", () => {
		expect(MarkdownSectionExtractor.extract("# Note\nText", { headingLevel: "###", headingText: "تدبرات" })).toBeNull();
	});

	it("collects non-empty sections across multiple notes", () => {
		const sections = MarkdownSectionExtractor.extractMany(
			["### تدبرات\nFirst", "### آثار\nOnly another section", "### تدبرات\nSecond"],
			{ headingLevel: "###", headingText: "تدبرات" }
		);
		expect(sections).toEqual(["First", "Second"]);
	});
});
