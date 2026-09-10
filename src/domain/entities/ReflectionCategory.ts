export type CategoryOrganizationMode = "unified" | "ownFolder";

export interface ReflectionCategory {
	readonly id: string;
	readonly name: string;
	readonly organizationMode: CategoryOrganizationMode;
	readonly headingText: string;
	readonly headingLevel: string;
	readonly folder: string;
	readonly isBuiltin: boolean;
	readonly dedicatedCommand?: boolean;
}
