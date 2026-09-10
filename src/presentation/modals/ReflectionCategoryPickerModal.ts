import { Notice, SuggestModal } from "obsidian";
import type { App, Editor } from "obsidian";
import type { ReflectionCategory } from "../../domain/entities/ReflectionCategory";
import type { AppServices } from "../AppServices";
import { QuranSearchModal } from "./QuranSearchModal";

type PickerItem =
	| { isNew: false; category: ReflectionCategory }
	| { isNew: true; name: string };

export interface ReflectionDestination {
	surahId: number;
	surahName: string;
	startAyah: number;
	endAyah: number;
}

interface PickerOptions {
	destination?: ReflectionDestination | null;
	editor?: Editor;
	requireDestination?: boolean;
}

export class ReflectionCategoryPickerModal extends SuggestModal<PickerItem> {
	private destination: ReflectionDestination | null;

	constructor(
		app: App,
		private readonly services: AppServices,
		private readonly onChoose: (category: ReflectionCategory, destination?: ReflectionDestination) => void | Promise<void>,
		private readonly options: PickerOptions = {}
	) {
		super(app);
		this.destination = options.destination ?? null;
		const isAr = this.services.settings.interfaceLanguage === "ar";
		this.setPlaceholder(isAr ? "اختر تصنيفاً أو اكتب لإنشاء تصنيف جديد..." : "Choose a category or type to create new...");
	}

	onOpen(): void {
		// SuggestModal owns the input/list construction. The extra controls below
		// are layered on top of that base UI; skipping super.onOpen() leaves the
		// picker empty until Obsidian happens to refresh it after typing.
		void super.onOpen();
		if (!this.options.requireDestination) return;
		this.renderDestinationControl();
		this.inputEl.addEventListener("keydown", (event) => {
			if (event.key !== "Enter" || !event.shiftKey) return;
			const name = this.inputEl.value.trim();
			if (!name) return;
			event.preventDefault();
			event.stopPropagation();
			void this.chooseTemporary(name);
		}, true);
	}

	private renderDestinationControl(): void {
		this.contentEl.querySelector(".quran-key-reflection-destination")?.remove();
		const isAr = this.services.settings.interfaceLanguage === "ar";
		const host = this.contentEl.createDiv({ cls: "quran-key-reflection-destination" });
		host.createSpan({ text: isAr ? "الآية المستهدفة" : "Destination ayah", cls: "quran-key-reflection-destination-label" });
		host.createSpan({
			text: this.destination
				? `${this.destination.surahName} ${this.destination.startAyah === this.destination.endAyah ? this.destination.startAyah : `${this.destination.startAyah}-${this.destination.endAyah}`}`
				: isAr
					? "لم تُحدد بعد"
					: "Not selected yet",
			cls: "quran-key-reflection-destination-value",
		});
		const button = host.createEl("button", { text: isAr ? "تغيير" : "Change", cls: "quran-key-reflection-destination-change" });
		button.addEventListener("click", () => {
			if (!this.options.editor) return;
			new QuranSearchModal(this.services, this.options.editor, "", null, null, null, async (ayahs) => {
				const first = ayahs[0];
				if (!first) return;
				this.destination = {
					surahId: first.surahId,
					surahName: first.surahName,
					startAyah: first.ayahId,
					endAyah: ayahs[ayahs.length - 1]?.ayahId ?? first.ayahId,
				};
				this.renderDestinationControl();
			}).open();
		});
	}

	getSuggestions(query: string): PickerItem[] {
		const clean = query.trim().toLowerCase();
		const all = this.services.reflectionCatalog.all();
		const matches: PickerItem[] = all
			.filter((c) => c.name.toLowerCase().includes(clean) || c.id.toLowerCase().includes(clean))
			.map((category) => ({ isNew: false, category }));
		if (clean.length > 0 && !all.some((c) => c.name.toLowerCase() === clean)) matches.push({ isNew: true, name: query.trim() });
		return matches;
	}

	renderSuggestion(item: PickerItem, el: HTMLElement): void {
		const isAr = this.services.settings.interfaceLanguage === "ar";
		if (item.isNew) {
			el.createDiv({ text: isAr ? `+ إنشاء تصنيف دائم: "${item.name}" (Enter)` : `+ Create permanent category: "${item.name}" (Enter)`, cls: "quran-key-picker-new-category" });
			el.createDiv({ text: isAr ? "Shift+Enter: تصنيف مؤقت لهذه الآية فقط" : "Shift+Enter: temporary category for this ayah only", cls: "quran-key-picker-hint" });
		} else {
			el.createDiv({ text: item.category.name, cls: "quran-key-picker-item-name" });
		}
	}

	onChooseSuggestion(item: PickerItem): void {
		if (this.options.requireDestination && !this.destination) {
			new Notice(this.services.settings.interfaceLanguage === "ar" ? "اختر الآية المستهدفة أولاً" : "Choose a destination ayah first");
			return;
		}
		if (item.isNew) {
			void this.createCategory(item.name).then((category) => void this.onChoose(category, this.destination ?? undefined));
		} else {
			void this.onChoose(item.category, this.destination ?? undefined);
		}
	}

	private async chooseTemporary(name: string): Promise<void> {
		if (!this.destination) {
			new Notice(this.services.settings.interfaceLanguage === "ar" ? "اختر الآية المستهدفة أولاً" : "Choose a destination ayah first");
			return;
		}
		await this.onChoose(
			{
				id: `temporary-${Date.now().toString(36)}`,
				name,
				organizationMode: "unified",
				headingText: name,
				headingLevel: "###",
				folder: "",
				isBuiltin: false,
				dedicatedCommand: false,
			},
			this.destination
		);
		this.close();
	}

	private async createCategory(name: string): Promise<ReflectionCategory> {
		const id = `custom-${Date.now().toString(36)}`;
		const descriptor = {
			id,
			name: name.trim(),
			organizationMode: "unified" as const,
			headingText: name.trim(),
			headingLevel: "###",
			folder: "",
			isBuiltin: false,
			dedicatedCommand: false,
		};
		this.services.settings.customReflectionCategories = [...this.services.settings.customReflectionCategories, descriptor];
		await this.services.saveSettings();
		return this.services.reflectionCatalog.byId(id)!;
	}
}
