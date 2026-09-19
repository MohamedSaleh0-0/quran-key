import type { ReflectionCategory } from "../entities/ReflectionCategory";

/** Creates an in-memory category for a single logging operation. */
export function createTemporaryReflectionCategory(name: string): ReflectionCategory {
	const trimmedName = name.trim();
	return {
		id: `temporary-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
		name: trimmedName,
		organizationMode: "unified",
		headingText: trimmedName,
		headingLevel: "###",
		folder: "",
		isBuiltin: false,
		dedicatedCommand: false,
	};
}
