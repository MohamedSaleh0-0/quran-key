import { describe, expect, it } from "vitest";
import { createReflectionBlockId, formatArabicDate, parseReflectionInput, renderAyahNoteTemplate, renderReflectionEntry } from "../../src/domain/services/ReflectionEntrySyntax";

describe("ReflectionEntrySyntax", () => {
	it("parses content and the category after the configured delimiter", () => {
		expect(parseReflectionInput("ملاحظة مهمة -- تدبرات", "--")).toEqual({
			content: "ملاحظة مهمة",
			categoryName: "تدبرات",
		});
	});

	it("keeps content-only input without opening a category shorthand", () => {
		expect(parseReflectionInput("ملاحظة فيها -- شرطة داخلية", "::")).toEqual({
			content: "ملاحظة فيها -- شرطة داخلية",
			categoryName: null,
		});
	});

	it("renders a user template and appends a block id", () => {
		expect(renderReflectionEntry("تدبر", "- {content} — {date}", true, "١٣ سبتمبر ٢٠٢٦", "qk-reflection-test")).toBe(
			"- تدبر — ١٣ سبتمبر ٢٠٢٦ ^qk-reflection-test"
		);
	});

	it("can render an entry without a block id", () => {
		expect(renderReflectionEntry("تدبر", "- {content}", false, "", undefined)).toBe("- تدبر");
	});

	it("preserves line breaks configured in the log template", () => {
		expect(renderReflectionEntry("تدبر", "- {content} — {date}\n", true, "١٣ سبتمبر ٢٠٢٦", "qk-reflection-test")).toBe(
			"- تدبر — ١٣ سبتمبر ٢٠٢٦ ^qk-reflection-test\n"
		);
	});

	it("renders the ayah note body template", () => {
		expect(renderAyahNoteTemplate("# الآية\n{ayah}\n", "﴿ نص الآية ﴾")).toBe("# الآية\n﴿ نص الآية ﴾\n");
	});

	it("creates Arabic dates and non-empty generated ids", () => {
		expect(formatArabicDate(new Date(2026, 8, 13))).toContain("سبتمبر");
		expect(createReflectionBlockId()).toMatch(/^qk-reflection-/);
	});
});
