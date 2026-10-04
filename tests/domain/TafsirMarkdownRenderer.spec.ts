import { describe, expect, it } from "vitest";
import { TafsirMarkdownRenderer, type TafsirMarkdownRenderOptions } from "../../src/domain/services/TafsirMarkdownRenderer";

const options: TafsirMarkdownRenderOptions = {
	surahName: "الكهف",
	startAyah: 1,
	endAyah: 2,
	wrapperStart: "﴿",
	wrapperEnd: "﴾",
	includeAyahText: true,
	useHorizontalDivider: true,
	rangeHeadingLevel: "###",
	bookHeadingLevel: "####",
	ayahHeadingLevel: "#####",
	rangeHeadingTemplate: "{surah} ({start}–{end})",
	bookHeadingTemplate: "{book}",
	ayahHeadingTemplate: "آية {ayah}",
};

describe("TafsirMarkdownRenderer", () => {
	it("renders Arabic atomic headings without adding the word tafsir", () => {
		const renderer = new TafsirMarkdownRenderer();
		const output = renderer.render(
			[
				{
					bookName: "السعدي",
					ayahs: [
						{ ayahId: 1, ayahText: "الحمد لله (1)", commentary: "شرح الآية" },
						{ ayahId: 2, ayahText: "الْحَمْدُ (2)", commentary: "شرح الآية الثانية" },
					],
				},
			],
			options
		);

		expect(output).toContain("### الكهف (1–2)");
		expect(output).toContain("#### السعدي");
		expect(output).toContain("##### آية 1");
		expect(output).toContain("> ﴿ الحمد لله 1 ﴾ (1)");
		expect(output).toContain("> شرح الآية");
		expect(output).not.toContain("تفسير آية");
		expect(output).not.toContain("تفسير سورة");
	});

	it("keeps a grouped source response as one block under the requested ayah", () => {
		const renderer = new TafsirMarkdownRenderer();
		const output = renderer.render(
			[
				{
					bookName: "مصدر مجمّع",
					ayahs: [{ ayahId: 10, commentary: "شرح الآية العاشرة\nشرح الآية الحادية عشرة\nشرح الآية الثانية عشرة" }],
				},
			],
			{ ...options, startAyah: 10, endAyah: 10, includeAyahText: false }
		);

		expect(output.match(/##### آية 10/g)).toHaveLength(1);
		expect(output).toContain("> شرح الآية العاشرة\n>\n> شرح الآية الحادية عشرة");
	});

	it("supports direct custom templates", () => {
		const renderer = new TafsirMarkdownRenderer();
		const output = renderer.render(
			[{ bookName: "الطبري", ayahs: [{ ayahId: 5, commentary: "نص" }] }],
			{
				...options,
				rangeHeadingTemplate: "سورة {surah}: من {start} إلى {end}",
				bookHeadingTemplate: "المصدر: {book}",
				ayahHeadingTemplate: "الموضع {ayah}",
			}
		);

		expect(output).toContain("### سورة الكهف: من 1 إلى 2");
		expect(output).toContain("#### المصدر: الطبري");
		expect(output).toContain("##### الموضع 5");
	});
});
