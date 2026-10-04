import { Modal, Notice } from "obsidian";
import type { App } from "obsidian";
import type { Ayah } from "../../domain/entities/Ayah";
import type { AppServices } from "../AppServices";
import { t } from "../../config/strings";

const CREATE_SECTION_VALUE = "__create_new_section__";

export class LogAyahEntryModal extends Modal {
	private searchEl!: HTMLInputElement;
	private resultsEl!: HTMLElement;
	private noteEl!: HTMLTextAreaElement;
	private sectionEl!: HTMLSelectElement;
	private createSectionEl: HTMLElement | null = null;
	private destinationEl!: HTMLElement;
	private selectedAyah: Ayah | null;
	private matches: Ayah[] = [];
	private highlightedIndex = -1;

	constructor(app: App, private readonly services: AppServices, private readonly initialNoteText = "", initialAyah: Ayah | null = null) {
		super(app);
		this.selectedAyah = initialAyah;
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
		this.searchEl.addEventListener("keydown", (event) => {
			if (event.key === "ArrowDown" || event.key === "ArrowUp") {
				if (this.matches.length === 0) return;
				event.preventDefault();
				const direction = event.key === "ArrowDown" ? 1 : -1;
				this.highlightedIndex = this.highlightedIndex < 0 ? (direction > 0 ? 0 : this.matches.length - 1) :
					(this.highlightedIndex + direction + this.matches.length) % this.matches.length;
				this.renderResults(false);
				return;
			}
			if (event.key === "Enter" && this.matches.length > 0) {
				event.preventDefault();
				const index = this.highlightedIndex >= 0 ? this.highlightedIndex : 0;
				this.selectAyah(this.matches[index]);
			}
		});

		this.resultsEl = contentEl.createDiv({ cls: "quran-key-picker-list quran-key-entry-results" });
		this.renderResults();
		this.destinationEl = contentEl.createDiv({ cls: "quran-key-entry-destination" });
		this.renderDestination();

		const sectionLabel = contentEl.createEl("label", { text: t(this.locale, "entry.section"), cls: "quran-key-entry-label" });
		this.sectionEl = contentEl.createEl("select", { cls: "quran-key-entry-section" });
		sectionLabel.htmlFor = this.sectionEl.id = `quran-key-entry-section-${Date.now()}`;
		for (const category of this.services.reflectionCatalog.all()) {
			this.sectionEl.createEl("option", { value: category.id, text: category.name });
		}
		this.sectionEl.createEl("option", {
			value: CREATE_SECTION_VALUE,
			text: t(this.locale, "entry.createSectionOption"),
		});
		this.sectionEl.addEventListener("change", () => {
			if (this.sectionEl.value === CREATE_SECTION_VALUE) this.renderCreateSectionControl();
			else this.removeCreateSectionControl();
		});

		this.noteEl = contentEl.createEl("textarea", {
			placeholder: t(this.locale, "entry.notePlaceholder"),
			cls: "quran-key-entry-textarea",
		});
		this.noteEl.value = this.selectedAyah
			? this.services.useCases.linkReflection.cleanReflectionText(
					this.initialNoteText,
					this.selectedAyah.surahId,
					this.selectedAyah.ayahId,
					this.services.settings.wrapperStart,
					this.services.settings.wrapperEnd
				  )
			: this.initialNoteText;

		const footer = contentEl.createDiv({ cls: "quran-key-picker-footer" });
		const save = footer.createEl("button", { text: t(this.locale, "entry.save"), cls: "mod-cta" });
		save.addEventListener("click", () => void this.submit());
		this.searchEl.focus();
	}

	private renderCreateSectionControl(): void {
		this.removeCreateSectionControl();
		this.createSectionEl = this.contentEl.createDiv({ cls: "quran-key-entry-create-section" });
		const input = this.createSectionEl.createEl("input", {
			type: "text",
			placeholder: t(this.locale, "entry.newSectionPlaceholder"),
			cls: "quran-key-entry-create-input",
		});
		const button = this.createSectionEl.createEl("button", {
			text: t(this.locale, "entry.createSectionButton"),
			cls: "mod-cta",
		});
		button.addEventListener("click", () => void this.createSection(input.value));
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				void this.createSection(input.value);
			}
		});
		input.focus();
	}

	private removeCreateSectionControl(): void {
		this.createSectionEl?.remove();
		this.createSectionEl = null;
	}

	private async createSection(rawName: string): Promise<void> {
		const name = rawName.trim();
		if (!name) {
			new Notice(t(this.locale, "entry.newSectionRequired"));
			return;
		}

		const existing = this.services.reflectionCatalog.all().find((category) => category.name.trim().toLowerCase() === name.toLowerCase());
		if (existing) {
			this.sectionEl.value = existing.id;
			this.removeCreateSectionControl();
			return;
		}

		const id = `custom-${Date.now().toString(36)}`;
		this.services.settings.customReflectionCategories = [
			...this.services.settings.customReflectionCategories,
			{
				id,
				name,
				organizationMode: "unified",
				headingText: name,
				headingLevel: "###",
				folder: "",
				isBuiltin: false,
				dedicatedCommand: false,
			},
		];

		try {
			await this.services.saveSettings();
			this.sectionEl.empty();
			for (const category of this.services.reflectionCatalog.all()) {
				this.sectionEl.createEl("option", { value: category.id, text: category.name });
			}
			this.sectionEl.createEl("option", {
				value: CREATE_SECTION_VALUE,
				text: t(this.locale, "entry.createSectionOption"),
			});
			this.sectionEl.value = id;
			this.removeCreateSectionControl();
		} catch {
			new Notice(t(this.locale, "entry.sectionCreateFailed"));
		}
	}

	private renderResults(resetHighlight = true): void {
		this.resultsEl.empty();
		const query = this.searchEl.value.trim();
		if (!query) {
			this.matches = [];
			this.highlightedIndex = -1;
			return;
		}

		this.matches = this.services.useCases.search.execute(query).slice(0, this.services.settings.maxSuggestionResults);
		if (resetHighlight) this.highlightedIndex = this.matches.length > 0 ? 0 : -1;
		if (this.matches.length === 0) {
			this.resultsEl.createDiv({ text: t(this.locale, "linkAyat.empty") });
			return;
		}

		for (const [index, ayah] of this.matches.entries()) {
			const item = this.resultsEl.createDiv({ cls: "quran-key-picker-item" });
			item.toggleClass("is-active", this.selectedAyah?.id === ayah.id);
			item.toggleClass("is-selected", this.highlightedIndex === index);
			item.createSpan({ text: ayah.text, cls: "quran-key-picker-item-name" });
			item.createSpan({ text: `${ayah.surahName} ${ayah.ayahId}`, cls: "quran-key-modal-alias" });
			item.addEventListener("click", () => this.selectAyah(ayah));
		}
	}

	private selectAyah(ayah: Ayah): void {
		this.selectedAyah = ayah;
		this.renderResults(false);
		this.renderDestination();
		this.noteEl?.focus();
	}

	private renderDestination(): void {
		if (!this.destinationEl) return;
		this.destinationEl.empty();
		if (!this.selectedAyah) return;
		this.destinationEl.createSpan({
			text: `${this.locale === "ar" ? "الآية المستهدفة:" : "Destination ayah:"} ${this.selectedAyah.surahName} ${this.selectedAyah.ayahId}`,
		});
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
		if (this.sectionEl.value === CREATE_SECTION_VALUE) {
			new Notice(t(this.locale, "entry.createSectionFirst"));
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
