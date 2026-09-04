import { describe, expect, it } from "vitest";
import { HeadingSectionInserter } from "../../src/domain/services/HeadingSectionInserter";

const baseOptions = {
	headingLevel: "###",
	headingText: "تدبرات",
	parentHeadingLevel: null,
	parentHeadingText: null,
	separator: "\n\n---\n\n",
} as const;

describe("HeadingSectionInserter", () => {
	it("creates the heading at end of file when it doesn't exist, and inserts under it", () => {
		const out = HeadingSectionInserter.insertEntry("", { ...baseOptions, insertionMode: "afterHeading" }, "أول تدبر");
		expect(out).toContain("### تدبرات");
		expect(out.indexOf("### تدبرات")).toBeLessThan(out.indexOf("أول تدبر"));
	});

	it("afterHeading mode puts the newest entry directly under the heading, above older ones", () => {
		let content = "";
		content = HeadingSectionInserter.insertEntry(content, { ...baseOptions, insertionMode: "afterHeading" }, "تدبر قديم");
		content = HeadingSectionInserter.insertEntry(content, { ...baseOptions, insertionMode: "afterHeading" }, "تدبر جديد");
		expect(content.indexOf("تدبر جديد")).toBeLessThan(content.indexOf("تدبر قديم"));
		expect(content).toContain("---"); // separator inserted between the two
	});

	it("endOfSection mode keeps chronological order (oldest stays on top)", () => {
		let content = "";
		content = HeadingSectionInserter.insertEntry(content, { ...baseOptions, insertionMode: "endOfSection" }, "تدبر أول");
		content = HeadingSectionInserter.insertEntry(content, { ...baseOptions, insertionMode: "endOfSection" }, "تدبر ثاني");
		expect(content.indexOf("تدبر أول")).toBeLessThan(content.indexOf("تدبر ثاني"));
	});

	it("does not insert a stray separator when the section was empty", () => {
		const out = HeadingSectionInserter.insertEntry("", { ...baseOptions, insertionMode: "afterHeading" }, "أول تدبر");
		expect(out).not.toContain("---");
	});

	it("respects section boundaries: inserting under one heading never leaks into another section", () => {
		const existing = ["## آثار", "", "أثر موجود", "", "### تدبرات", "", "تدبر قديم", ""].join("\n");
		const out = HeadingSectionInserter.insertEntry(existing, { ...baseOptions, insertionMode: "afterHeading" }, "تدبر جديد");
		const lines = out.split("\n");
		expect(lines.indexOf("تدبر جديد")).toBeGreaterThan(lines.indexOf("### تدبرات"));
		expect(lines.indexOf("تدبر جديد")).toBeLessThan(lines.indexOf("تدبر قديم"));
	});

	it("nests a new heading under its parent's section instead of at file end", () => {
		const existing = ["## فوائد", "", "### فوائد بلاغية", "", "فايدة بلاغية", "", "## آثار", "", "أثر"].join("\n");
		const out = HeadingSectionInserter.insertEntry(
			existing,
			{
				headingLevel: "###",
				headingText: "فوائد لغوية",
				parentHeadingLevel: "##",
				parentHeadingText: "فوائد",
				insertionMode: "afterHeading",
				separator: "\n\n---\n\n",
			},
			"فايدة لغوية"
		);
		const lines = out.split("\n");
		const parentIdx = lines.indexOf("## فوائد");
		const newHeadingIdx = lines.indexOf("### فوائد لغوية");
		const athaarIdx = lines.indexOf("## آثار");
		expect(newHeadingIdx).toBeGreaterThan(parentIdx);
		expect(newHeadingIdx).toBeLessThan(athaarIdx); // stayed nested under فوائد, didn't spill into آثار
	});

	it("falls back to end-of-file when the named parent heading doesn't exist yet", () => {
		const out = HeadingSectionInserter.insertEntry(
			"## آثار\n\nأثر",
			{
				headingLevel: "###",
				headingText: "فوائد لغوية",
				parentHeadingLevel: "##",
				parentHeadingText: "فوائد", // not present
				insertionMode: "afterHeading",
				separator: "",
			},
			"فايدة"
		);
		expect(out).toContain("### فوائد لغوية");
	});

	it("ensureLinkLine is idempotent — running it twice doesn't duplicate the line", () => {
		let content = "";
		const linkLine = "[[الفوائد العملية لهذه الآية]]";
		content = HeadingSectionInserter.ensureLinkLine(content, { ...baseOptions, insertionMode: "afterHeading" }, linkLine);
		content = HeadingSectionInserter.ensureLinkLine(content, { ...baseOptions, insertionMode: "afterHeading" }, linkLine);
		const occurrences = content.split(linkLine).length - 1;
		expect(occurrences).toBe(1);
	});

	it("ensureHeadingExists is a no-op when the heading is already there", () => {
		const existing = "### تدبرات\n\nموجود بالفعل\n";
		const out = HeadingSectionInserter.ensureHeadingExists(existing, "###", "تدبرات", null, null);
		expect(out).toBe(existing);
	});
});
