import { SuggestModal } from "obsidian";
import type { App } from "obsidian";
import type { ReflectionCategory } from "../../domain/entities/ReflectionCategory";
import type { AppServices } from "../AppServices";

type PickerItem =
	| { isNew: false; category: ReflectionCategory }
	| { isNew: true; name: string };

export class ReflectionCategoryPickerModal extends SuggestModal<PickerItem> {
	constructor(
		app: App,
		private readonly services: AppServices,
		private readonly onChoose: (category: ReflectionCategory) => void | Promise<void>
	) {
		super(app);
		const isAr = this.services.settings.interfaceLanguage === "ar";
		this.setPlaceholder(isAr ? "اختر تصنيفاً أو اكتب لإنشاء تصنيف جديد..." : "Choose a category or type to create new...");
	}

	getSuggestions(query: string): PickerItem[] {
		const clean = query.trim().toLowerCase();
		const all = this.services.reflectionCatalog.all();
		const matches: PickerItem[] = all
			.filter((c) => c.name.toLowerCase().includes(clean) || c.id.toLowerCase().includes(clean))
			.map((category) => ({ isNew: false, category }));

		if (clean.length > 0 && !all.some((c) => c.name.toLowerCase() === clean)) {
			matches.push({ isNew: true, name: query.trim() });
		}

		return matches;
	}

	renderSuggestion(item: PickerItem, el: HTMLElement): void {
		const isAr = this.services.settings.interfaceLanguage === "ar";
		if (item.isNew) {
			el.createDiv({
				text: isAr ? `+ إنشاء تصنيف جديد: "${item.name}"` : `+ Create new category: "${item.name}"`,
				cls: "quran-key-picker-new-category",
			});
		} else {
			const row = el.createDiv({ cls: "quran-key-picker-item-row" });
			row.createSpan({ text: item.category.name, cls: "quran-key-picker-item-name" });
			if (item.category.isBuiltin) {
				row.createSpan({ text: isAr ? "" : " (builtin)", cls: "quran-key-modal-alias" });
			}
		}
	}

	onChooseSuggestion(item: PickerItem): void {
		if (item.isNew) {
			void this.createCategory(item.name).then((category) => {
				void this.onChoose(category);
			});
		} else {
			void this.onChoose(item.category);
		}
	}

	async createCategory(name: string): Promise<ReflectionCategory> {
		const id = `custom-${Date.now().toString(36)}`;
		const descriptor = {
			id,
			name: name.trim(),
			organizationMode: "unified" as const,
			headingText: name.trim(),
			headingLevel: "###",
			parentCategoryId: null,
			folder: "",
			isBuiltin: false,
		};

		this.services.settings.customReflectionCategories = [
			...this.services.settings.customReflectionCategories,
			descriptor,
		];
		await this.services.saveSettings();
		this.services.registerReflectionCategoryCommand(id);
		return this.services.reflectionCatalog.byId(id)!;
	}
}