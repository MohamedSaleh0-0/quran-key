import { Modal } from "obsidian";
import type { App } from "obsidian";
import type { Ayah } from "../../domain/entities/Ayah";
import type { AppServices } from "../AppServices";
import { t } from "../../config/strings";

/**
 * "Link ayat" command: pick 2+ ayahs (any surah, any count) that share
 * something — a repeated phrase, a theme, whatever the user has in mind —
 * and link them all together via LinkAyahsTogether. Deliberately modeled
 * on TafsirBookPickerModal (search box + checkbox list + keyboard nav +
 * explicit confirm) rather than QuranSearchModal, which is a SuggestModal
 * built to close on a *single* choice.
 */
export class LinkAyatModal extends Modal {
	private readonly selected = new Map<number, Ayah>(); // keyed by Ayah.id
	private activeIndex = 0;
	private filtered: Ayah[] = [];
	private listEl!: HTMLElement;
	private searchEl!: HTMLInputElement;
	private confirmBtn!: HTMLButtonElement;

	constructor(app: App, private readonly services: AppServices) {
		super(app);
	}

	private get locale() {
		return this.services.settings.interfaceLanguage;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass("quran-key-picker-modal");

		contentEl.createEl("h2", { text: t(this.locale, "linkAyat.title") });

		this.searchEl = contentEl.createEl("input", { type: "text", placeholder: t(this.locale, "linkAyat.placeholder") });
		this.searchEl.focus();

		this.listEl = contentEl.createDiv({ cls: "quran-key-picker-list" });
		this.filtered = [];
		this.renderList();

		this.searchEl.addEventListener("input", () => {
			const query = this.searchEl.value.trim();
			this.filtered = query.length === 0 ? [] : this.services.useCases.search.execute(query).slice(0, this.services.settings.maxSuggestionResults);
			this.activeIndex = 0;
			this.renderList();
		});

		this.renderFooter(contentEl);

		this.modalEl.addEventListener(
			"keydown",
			(evt) => {
				if (evt.key === "ArrowDown") {
					evt.preventDefault();
					if (this.filtered.length > 0) {
						this.activeIndex = (this.activeIndex + 1) % this.filtered.length;
						this.renderList();
					}
				} else if (evt.key === "ArrowUp") {
					evt.preventDefault();
					if (this.filtered.length > 0) {
						this.activeIndex = (this.activeIndex - 1 + this.filtered.length) % this.filtered.length;
						this.renderList();
					}
				} else if (evt.key === "Enter" && !evt.shiftKey) {
					evt.preventDefault();
					const ayah = this.filtered[this.activeIndex];
					if (ayah) this.toggle(ayah);
				} else if (evt.key === "Enter" && evt.shiftKey) {
					evt.preventDefault();
					this.submitAndClose();
				}
			},
			true
		);
	}

	private renderList(): void {
		this.listEl.empty();
		if (this.filtered.length === 0) {
			this.listEl.createDiv({ text: t(this.locale, "linkAyat.empty") });
			return;
		}
		this.filtered.forEach((ayah, idx) => {
			const isActive = idx === this.activeIndex;
			const isChecked = this.selected.has(ayah.id);
			const item = this.listEl.createDiv({ cls: `quran-key-picker-item${isActive ? " is-active" : ""}` });
			const right = item.createDiv({ cls: "quran-key-picker-item-right" });
			const checkbox = right.createEl("input", { type: "checkbox" });
			checkbox.checked = isChecked;
			right.createSpan({ text: ayah.text, cls: `quran-key-picker-item-name${isChecked ? " is-checked" : ""}` });
			item.createSpan({ text: `${ayah.surahName} ${ayah.ayahId}`, cls: "quran-key-modal-alias" });
			item.addEventListener("click", () => {
				this.activeIndex = idx;
				this.toggle(ayah);
				this.searchEl.focus(); // keep keyboard nav working after a mouse click — see TafsirBookPickerModal
			});
		});
	}

	private toggle(ayah: Ayah): void {
		if (this.selected.has(ayah.id)) this.selected.delete(ayah.id);
		else this.selected.set(ayah.id, ayah);
		this.renderList();
		this.updateConfirmState();
		this.renderSelectedSummary();
	}

	private selectedSummaryEl?: HTMLElement;

	private renderSelectedSummary(): void {
		if (!this.selectedSummaryEl) return;
		this.selectedSummaryEl.empty();
		if (this.selected.size === 0) return;
		this.selectedSummaryEl.createSpan({ text: t(this.locale, "linkAyat.selectedPrefix") });
		for (const ayah of this.selected.values()) {
			this.selectedSummaryEl.createSpan({ text: ` ${ayah.surahName} ${ayah.ayahId} ·`, cls: "quran-key-modal-alias" });
		}
	}

	private renderFooter(containerEl: HTMLElement): void {
		this.selectedSummaryEl = containerEl.createDiv({ cls: "quran-key-picker-hint" });
		const footer = containerEl.createDiv({ cls: "quran-key-picker-footer" });
		footer.createSpan({ text: t(this.locale, "linkAyat.hint"), cls: "quran-key-picker-hint" });
		this.confirmBtn = footer.createEl("button", { text: t(this.locale, "linkAyat.confirm"), cls: "mod-cta" });
		this.confirmBtn.addEventListener("click", () => this.submitAndClose());
		this.updateConfirmState();
	}

	private updateConfirmState(): void {
		if (!this.confirmBtn) return;
		// Needs 2+, not 1+ — linking a single ayah to nothing is a no-op (LinkAyahsTogether.execute short-circuits on this too).
		this.confirmBtn.disabled = this.selected.size < 2;
	}

	private async submitAndClose(): Promise<void> {
		if (this.selected.size < 2) return;
		const ayahs = Array.from(this.selected.values());
		this.close();
		await this.services.useCases.linkAyahsTogether.execute(
			ayahs,
			this.services.settings.reflectionFileNameTemplate,
			this.services.settings.includeAyahTextInReflectionNote,
			{
				wrapperStart: this.services.settings.wrapperStart,
				wrapperEnd: this.services.settings.wrapperEnd,
				useOrnateNumbers: this.services.settings.useOrnateNumbers,
				stripTashkeelOnOutput: this.services.settings.stripTashkeel,
			}
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
