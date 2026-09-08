import { Modal, Notice } from "obsidian";
import type { App } from "obsidian";
import type { Ayah } from "../../domain/entities/Ayah";
import type { ReflectionCategory } from "../../domain/entities/ReflectionCategory";
import type { AppServices } from "../AppServices";
import { t } from "../../config/strings";
import { ReflectionCategoryPickerModal } from "./ReflectionCategoryPickerModal";

export class LogAyahEntryModal extends Modal {
	private searchEl!: HTMLInputElement;
	private resultsEl!: HTMLElement;
	private noteEl!: HTMLTextAreaElement;
	private sectionEl!: HTMLSelectElement;
	private rangeEndEl!: HTMLSelectElement;
	private rangeEndLabel!: HTMLLabelElement;
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
		this.rangeEndLabel = contentEl.createEl("label", {
			text: t(this.locale, "entry.rangeEnd"),
			cls: "quran-key-entry-label quran-key-entry-range-label",
		});
		this.rangeEndEl = contentEl.createEl("select", { cls: "quran-key-entry-section quran-key-entry-range" });
		this.rangeEndLabel.htmlFor = this.rangeEndEl.id = `quran-key-entry-range-${Date.now()}`;
		this.rangeEndEl.addEventListener("change", () => undefined);
		this.renderRangeControl();

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
		this.noteEl.addEventListener("keydown", (event) => {
			if (event.key !== "@" || !this.services.settings.enableAtSectionTrigger) return;
			event.preventDefault();
			new ReflectionCategoryPickerModal(this.app, this.services, (category) => {
				this.sectionEl.value = category.id;
			}).open();
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
				this.renderRangeControl();
			});
		}
	}

	private renderRangeControl(): void {
		this.rangeEndEl.empty();
		const start = this.selectedAyah;
		const enabled = start !== null;
		this.rangeEndEl.disabled = !enabled;
		this.rangeEndLabel.toggleClass("is-hidden", !enabled);
		if (!start) return;

		const ayahs = this.services.repository
			.getAllAyahs()
			.filter((ayah) => ayah.surahId === start.surahId && ayah.ayahId >= start.ayahId);
		for (const ayah of ayahs) {
			this.rangeEndEl.createEl("option", {
				value: String(ayah.ayahId),
				text: `${ayah.ayahId} — ${ayah.text.slice(0, 80)}`,
			});
		}
		this.rangeEndEl.value = String(start.ayahId);
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
		const endAyah = Number(this.rangeEndEl.value) || ayah.ayahId;
		this.close();
		try {
			await this.services.useCases.linkReflection.executeDirect(
				reflectionText,
				category,
				ayah.surahId,
				ayah.surahName,
				ayah.ayahId,
				endAyah,
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
