import { Modal, Setting } from "obsidian";
import type { App, TextComponent } from "obsidian";
import type { TafsirBook } from "../../domain/entities/TafsirBook";
import type { AppServices } from "../AppServices";
import { t } from "../../config/strings";

export class TafsirBookPickerModal extends Modal {
	private readonly selected = new Set<string>();
	private activeIndex = 0;
	private filtered: TafsirBook[];
	private listEl!: HTMLElement;
	private searchEl!: HTMLInputElement;
	private confirmBtn!: HTMLButtonElement;

	constructor(
		app: App,
		private readonly services: AppServices,
		private readonly onSubmit: (books: TafsirBook[]) => void
	) {
		super(app);
		this.filtered = [...this.services.catalog.all()];
	}

	private get locale() {
		return this.services.settings.interfaceLanguage;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass("quran-key-picker-modal");

		contentEl.createEl("h2", { text: t(this.locale, "tafsir.pickerTitle") });

		this.searchEl = contentEl.createEl("input", {
			type: "text",
			placeholder: t(this.locale, "tafsir.pickerPlaceholder"),
		});
		this.searchEl.focus();

		this.listEl = contentEl.createDiv({ cls: "quran-key-picker-list" });
		this.renderList();

		this.searchEl.addEventListener("input", () => {
			this.filtered = this.services.catalog.search(this.searchEl.value);
			this.activeIndex = 0;
			this.renderList();
		});

		this.renderAddSourceForm(contentEl);
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
					const book = this.filtered[this.activeIndex];
					if (book) this.toggle(book.id);
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
			this.listEl.createDiv({ text: t(this.locale, "tafsir.pickerEmpty") });
			return;
		}
		this.filtered.forEach((book, idx) => {
			const isActive = idx === this.activeIndex;
			const isChecked = this.selected.has(book.id);
			const item = this.listEl.createDiv({ cls: `quran-key-picker-item${isActive ? " is-active" : ""}` });
			const right = item.createDiv({ cls: "quran-key-picker-item-right" });
			const checkbox = right.createEl("input", { type: "checkbox" });
			checkbox.checked = isChecked;
			right.createSpan({
				text: book.name,
				cls: `quran-key-picker-item-name${isChecked ? " is-checked" : ""}`,
			});
			if (book.aliases.length > 0) {
				item.createSpan({ text: book.aliases.join("\u060C "), cls: "quran-key-modal-alias" });
			}
			item.addEventListener("click", () => {
				this.activeIndex = idx;
				this.toggle(book.id);
				// `renderList()` (called from `toggle()`) empties and rebuilds every
				// list item, including whichever one the browser had just focused
				// via this click — the old node is gone, so focus silently falls
				// back to <body>. Since the keydown listener below is registered on
				// `modalEl` with `capture: true`, it only fires for descendants of
				// the *focused* element; once focus is on <body> (an ancestor of
				// modalEl, not a descendant), the listener is out of the event path
				// entirely and arrow keys fall through to the browser's default
				// (scrolling) instead of moving `activeIndex`. Re-focusing a stable
				// element inside the modal after every click keeps it fixed.
				this.searchEl.focus();
			});
		});
	}

	private toggle(bookId: string): void {
		if (this.selected.has(bookId)) this.selected.delete(bookId);
		else this.selected.add(bookId);
		this.renderList();
		this.updateConfirmState();
	}

	private renderAddSourceForm(containerEl: HTMLElement): void {
		const details = containerEl.createEl("details", { cls: "quran-key-picker-add-source" });
		details.createEl("summary", { text: t(this.locale, "tafsir.addSourceTitle") });
		const body = details.createDiv();

		let nameInput!: TextComponent;
		let aliasesInput!: TextComponent;
		let urlInput!: TextComponent;

		new Setting(body)
			.setName(t(this.locale, "tafsir.addSourceNamePlaceholder"))
			.addText((tx) => {
				nameInput = tx;
			});

		new Setting(body)
			.setName(t(this.locale, "tafsir.addSourceAliasesPlaceholder"))
			.addText((tx) => {
				aliasesInput = tx;
			});

		new Setting(body)
			.setName(t(this.locale, "tafsir.addSourceUrlPlaceholder"))
			.addText((tx) => {
				urlInput = tx;
			});

		new Setting(body).addButton((btn) =>
			btn
				.setButtonText(t(this.locale, "tafsir.addSourceButton"))
				.setCta()
				.onClick(async () => {
					const addedId = await this.addCustomSource(nameInput.getValue(), aliasesInput.getValue(), urlInput.getValue());
					if (addedId) {
						nameInput.setValue("");
						aliasesInput.setValue("");
						urlInput.setValue("");
					}
				})
		);
	}

	private async addCustomSource(name: string, aliasesRaw: string, urlTemplate: string): Promise<string | null> {
		if (!name.trim() || !urlTemplate.trim()) return null;
		const id = `custom-${name
			.trim()
			.toLowerCase()
			.replace(/\s+/g, "-")
			.replace(/[^a-z0-9\u0600-\u06ff-]/g, "")}-${Date.now().toString(36)}`;

		this.services.settings.customTafsirBooks = [
			...this.services.settings.customTafsirBooks,
			{
				id,
				name: name.trim(),
				aliases: aliasesRaw
					.split(",")
					.map((a) => a.trim())
					.filter(Boolean),
				urlTemplate: urlTemplate.trim(),
				isBuiltin: false,
			},
		];

		await this.services.saveSettings();

		this.selected.add(id);
		this.filtered = this.services.catalog.search(this.searchEl.value);
		this.renderList();
		this.updateConfirmState();
		return id;
	}

	private renderFooter(containerEl: HTMLElement): void {
		const footer = containerEl.createDiv({ cls: "quran-key-picker-footer" });
		footer.createSpan({ text: t(this.locale, "tafsir.pickerHint"), cls: "quran-key-picker-hint" });
		this.confirmBtn = footer.createEl("button", {
			text: t(this.locale, "tafsir.pickerConfirm"),
			cls: "mod-cta",
		});
		this.confirmBtn.addEventListener("click", () => this.submitAndClose());
		this.updateConfirmState();
	}

	private updateConfirmState(): void {
		if (!this.confirmBtn) return;
		this.confirmBtn.disabled = this.selected.size === 0;
	}

	private submitAndClose(): void {
		if (this.selected.size === 0) return;
		const chosen = this.services.catalog.all().filter((b) => this.selected.has(b.id));
		this.close();
		this.onSubmit(chosen);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
