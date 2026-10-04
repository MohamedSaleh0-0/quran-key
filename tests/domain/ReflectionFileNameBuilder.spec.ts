import { describe, expect, it } from "vitest";
import { ReflectionFileNameBuilder } from "../../src/domain/services/ReflectionFileNameBuilder";

describe("ReflectionFileNameBuilder", () => {
	it("removes tashkeel from ayah text used in a note title", () => {
		const builder = new ReflectionFileNameBuilder("{ayahText} ({surah} {verse})", 120, (text) =>
			text.replace(/[\u064B-\u065F\u0670]/g, "")
		);

		expect(builder.build("الفاتحة", 1, "بِسْمِ ٱللَّهِ")).toBe("بسم ٱلله (الفاتحة 1)");
	});

	it("can limit the ayah title by word count before the character limit", () => {
		const builder = new ReflectionFileNameBuilder("{ayahText}", 120, (text) => text, 3);

		expect(builder.build("الفاتحة", 1, "كلمة أولى ثانية ثالثة رابعة")).toBe("كلمة أولى ثانية…");
	});
});
