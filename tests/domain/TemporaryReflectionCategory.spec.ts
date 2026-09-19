import { describe, expect, it } from "vitest";
import { createTemporaryReflectionCategory } from "../../src/domain/services/TemporaryReflectionCategory";

describe("TemporaryReflectionCategory", () => {
	it("creates an in-memory unified category without persistence metadata", () => {
		const category = createTemporaryReflectionCategory("  ملاحظات عابرة  ");

		expect(category.name).toBe("ملاحظات عابرة");
		expect(category.headingText).toBe("ملاحظات عابرة");
		expect(category.organizationMode).toBe("unified");
		expect(category.isBuiltin).toBe(false);
		expect(category.dedicatedCommand).toBe(false);
		expect(category.id).toMatch(/^temporary-/);
	});
});
