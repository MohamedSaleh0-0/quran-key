import { describe, expect, it } from "vitest";
import { formatAyahMarker } from "../../src/domain/services/AyahMarkerFormatter";

describe("AyahMarkerFormatter", () => {
	it("renders each display-laboratory marker style with Arabic-Indic digits", () => {
		expect(formatAyahMarker(104, "plain")).toBe("١٠٤");
		expect(formatAyahMarker(104, "parenthesized")).toBe("(١٠٤)");
		expect(formatAyahMarker(104, "end-symbol")).toBe("۝١٠٤");
	});
});
