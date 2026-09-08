import { Modal, Notice } from "obsidian";
import type { App } from "obsidian";
import type { Ayah } from "../../domain/entities/Ayah";
import type { ReflectionCategory } from "../../domain/entities/ReflectionCategory";
import type { AppServices } from "../AppServices";
import { t } from "../../config/strings";

export class LogAyahEntryModal extends Modal {
	private searchEl!: HTMLInputElement;
	private resultsEl!: HTMLElement;
	private noteEl!: HTMLTextAreaElement;
	private sectionEl!: HTMLSelectElement;
	private selectedAyah: Ayah | null = null;

	constructor(app: App, private readonly services: AppServices) {
		super(app);
	}

	private get locale() {
		return this.services.settings.interfaceLanguage;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass("quran-key-picker-modal", "quran-key-entry-modal");

		contentEl.createEl("h2", { text: t(this.locale, "entry.title") });
		this.searchEl = contentEl.createEl("input", {
			type: "text",
			placeholder: t(this.locale, "entry.searchPlaceholder"),
		});
		this.searchEl.addEventListener("input", () => this.renderResults());

		this.resultsEl = contentEl.createDiv({ cls: "quran-key-picker-list quran-key-entry-results" });
		this.renderResults();

		const sectionLabel = contentEl.createEl("label", { text: t(this.locale, "entry.section"), cls: "quran-key-entry-label" });
		this.sectionEl = contentEl.createEl("select", { cls: "quran-key-entry-section" });
		sectionLabel.htmlFor = this.sectionEl.id = `quran-key-entry-section-${Date.now()}`;
		for (const category of this.services.reflectionCatalog.all()) {
			this.sectionEl.createEl("option", { value: category.id, text: category.name });
		}

		this.noteEl = contentEl.createEl("textarea", {
			placeholder: t(this.locale, "entry.notePlaceholder"),
			cls: "quran-key-entry-textarea",
		});

		const footer = contentEl.createDiv({ cls: "quran-key-picker-footer" });
		const save = footer.createEl("button", { text: t(this.locale, "entry.save"), cls: "mod-cta" });
		save.addEventListener("click", () => void this.submit());
		this.searchEl.focus();
	}

	private renderResults(): void {
		this.resultsEl.empty();
		const query = this.searchEl.value.trim();
		if (!query) return;

		const matches = this.services.useCases.search.execute(query).slice(0, this.services.settings.maxSuggestionResults);
		if (matches.length === 0) {
			this.resultsEl.createDiv({ text: t(this.locale, "linkAyat.empty") });
			return;
		}

		for (const ayah of matches) {
			const item = this.resultsEl.createDiv({ cls: "quran-key-picker-item" });
			item.toggleClass("is-active", this.selectedAyah?.id === ayah.id);
			item.createSpan({ text: ayah.text, cls: "quran-key-picker-item-name" });
			item.createSpan({ text: `${ayah.surahName} ${ayah.ayahId}`, cls: "quran-key-modal-alias" });
			item.addEventListener("click", () => {
				this.selectedAyah = ayah;
				this.renderResults();
			});
		}
	}

	private async submit(): Promise<void> {
		if (!this.selectedAyah) {
			new Notice(t(this.locale, "entry.chooseAyah"));
			return;
		}
		const reflectionText = this.noteEl.value.trim();
		if (!reflectionText) {
			new Notice(t(this.locale, "entry.writeNote"));
			return;
		}

		const category = this.services.reflectionCatalog.byId(this.sectionEl.value);
		if (!category) return;

		const ayah = this.selectedAyah;
		this.close();
		try {
			await this.services.useCases.linkReflection.executeDirect(
				reflectionText,
				category,
				ayah.surahId,
				ayah.surahName,
				ayah.ayahId,
				ayah.ayahId,
				this.services.buildReflectionOptions()
			);
		} catch {
			new Notice(t(this.locale, "entry.failed"));
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
