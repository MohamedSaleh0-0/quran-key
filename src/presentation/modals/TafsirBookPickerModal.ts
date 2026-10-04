import { Modal, Setting } from "obsidian";
import type { App, TextComponent } from "obsidian";
import type { TafsirBook } from "../../domain/entities/TafsirBook";
import type { TafsirPackage } from "../../domain/entities/TafsirPackage";
import type { AppServices } from "../AppServices";
import { t } from "../../config/strings";

type PickerItem =
	| { kind: "book"; book: TafsirBook }
	| { kind: "package"; pkg: TafsirPackage };

export class TafsirBookPickerModal extends Modal {
	private readonly selected = new Set<string>();
	private activeIndex = 0;
	private filtered: PickerItem[] = [];
	private listEl!: HTMLElement;
	private searchEl!: HTMLInputElement;
	private confirmBtn!: HTMLButtonElement;

	constructor(app: App, private readonly services: AppServices, private readonly onSubmit: (books: TafsirBook[]) => void) {
		super(app);
		this.filtered = this.allItems();
	}

	private get locale() {
		return this.services.settings.interfaceLanguage;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass("quran-key-picker-modal");
		contentEl.createEl("h2", { text: t(this.locale, "tafsir.pickerTitle") });
		this.searchEl = contentEl.createEl("input", { type: "text", placeholder: t(this.locale, "tafsir.pickerPlaceholder") });
		this.searchEl.focus();
		this.listEl = contentEl.createDiv({ cls: "quran-key-picker-list" });
		this.renderList();
		this.searchEl.addEventListener("input", () => {
			this.filtered = this.searchItems(this.searchEl.value);
			this.activeIndex = 0;
			this.renderList();
		});
		this.renderAddSourceForm(contentEl);
		this.renderFooter(contentEl);
		this.modalEl.addEventListener("keydown", (evt) => this.handleKeyboard(evt), true);
	}

	private handleKeyboard(evt: KeyboardEvent): void {
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
		} else if (evt.key === "Enter" && evt.shiftKey) {
			evt.preventDefault();
			this.submitAndClose();
		} else if (evt.key === "Enter") {
			evt.preventDefault();
			const item = this.filtered[this.activeIndex];
			if (item) this.toggleItem(item);
		}
	}

	private allItems(): PickerItem[] {
		return [
			...this.services.tafsirPackages.all().map((pkg) => ({ kind: "package", pkg }) as const),
			...this.services.catalog.all().map((book) => ({ kind: "book", book }) as const),
		];
	}

	private searchItems(query: string): PickerItem[] {
		const normalized = query.trim().toLowerCase();
		if (!normalized) return this.allItems();
		return this.allItems().filter((item) => {
			if (item.kind === "book") {
				return item.book.name.toLowerCase().includes(normalized) || item.book.aliases.some((alias) => alias.toLowerCase().includes(normalized));
			}
			return item.pkg.name.toLowerCase().includes(normalized) || item.pkg.bookIds.some((id) => this.services.catalog.byId(id)?.name.toLowerCase().includes(normalized));
		});
	}

	private packageBookIds(pkg: TafsirPackage): string[] {
		return pkg.bookIds.filter((id) => this.services.catalog.byId(id));
	}

	private isPackageSelected(pkg: TafsirPackage): boolean {
		const ids = this.packageBookIds(pkg);
		return ids.length > 0 && ids.every((id) => this.selected.has(id));
	}

	private toggleItem(item: PickerItem): void {
		if (item.kind === "book") {
			if (this.selected.has(item.book.id)) this.selected.delete(item.book.id);
			else this.selected.add(item.book.id);
		} else {
			const ids = this.packageBookIds(item.pkg);
			const remove = ids.length > 0 && ids.every((id) => this.selected.has(id));
			for (const id of ids) {
				if (remove) this.selected.delete(id);
				else this.selected.add(id);
			}
		}
		this.renderList();
		this.updateConfirmState();
		this.searchEl.focus();
	}

	private renderList(): void {
		this.listEl.empty();
		if (this.filtered.length === 0) {
			this.listEl.createDiv({ text: t(this.locale, "tafsir.pickerEmpty") });
			return;
		}
		this.filtered.forEach((item, idx) => {
			const isPackage = item.kind === "package";
			const checked = isPackage ? this.isPackageSelected(item.pkg) : this.selected.has(item.book.id);
			const row = this.listEl.createDiv({ cls: `quran-key-picker-item${idx === this.activeIndex ? " is-active" : ""}` });
			const right = row.createDiv({ cls: "quran-key-picker-item-right" });
			const checkbox = right.createEl("input", { type: "checkbox" });
			checkbox.checked = checked;
			checkbox.addEventListener("click", (event) => {
				event.stopPropagation();
				this.activeIndex = idx;
				this.toggleItem(item);
			});
			right.createSpan({
				text: isPackage ? item.pkg.name : item.book.name,
				cls: `quran-key-picker-item-name${checked ? " is-checked" : ""}`,
			});
			row.createSpan({
				text: isPackage
					? `${this.packageBookIds(item.pkg).length} ${this.locale === "ar" ? "كتب" : "books"}`
					: item.book.aliases.join("\u060C "),
				cls: "quran-key-modal-alias",
			});
			row.addEventListener("click", () => {
				this.activeIndex = idx;
				this.toggleItem(item);
			});
		});
	}

	private renderAddSourceForm(containerEl: HTMLElement): void {
		const details = containerEl.createEl("details", { cls: "quran-key-picker-add-source" });
		details.createEl("summary", { text: t(this.locale, "tafsir.addSourceTitle") });
		const body = details.createDiv();
		let nameInput!: TextComponent;
		let aliasesInput!: TextComponent;
		let urlInput!: TextComponent;
		new Setting(body).setName(t(this.locale, "tafsir.addSourceNamePlaceholder")).addText((tx) => (nameInput = tx));
		new Setting(body).setName(t(this.locale, "tafsir.addSourceAliasesPlaceholder")).addText((tx) => (aliasesInput = tx));
		new Setting(body).setName(t(this.locale, "tafsir.addSourceUrlPlaceholder")).addText((tx) => (urlInput = tx));
		new Setting(body).addButton((btn) =>
			btn.setButtonText(t(this.locale, "tafsir.addSourceButton")).setCta().onClick(async () => {
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
		const id = `custom-${name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\u0600-\u06ff-]/g, "")}-${Date.now().toString(36)}`;
		this.services.settings.customTafsirBooks = [
			...this.services.settings.customTafsirBooks,
			{
				id,
				name: name.trim(),
				aliases: aliasesRaw.split(",").map((a) => a.trim()).filter(Boolean),
				urlTemplate: urlTemplate.trim(),
				isBuiltin: false,
				createdAt: Date.now(),
			},
		];
		await this.services.saveSettings();
		this.selected.add(id);
		this.filtered = this.searchItems(this.searchEl.value);
		this.renderList();
		this.updateConfirmState();
		return id;
	}

	private renderFooter(containerEl: HTMLElement): void {
		const footer = containerEl.createDiv({ cls: "quran-key-picker-footer" });
		footer.createSpan({ text: t(this.locale, "tafsir.pickerHint"), cls: "quran-key-picker-hint" });
		this.confirmBtn = footer.createEl("button", { text: t(this.locale, "tafsir.pickerConfirm"), cls: "mod-cta" });
		this.confirmBtn.addEventListener("click", () => this.submitAndClose());
		this.updateConfirmState();
	}

	private updateConfirmState(): void {
		if (this.confirmBtn) this.confirmBtn.disabled = this.selected.size === 0;
	}

	private submitAndClose(): void {
		if (this.selected.size === 0) return;
		const chosen = this.services.catalog.all().filter((book) => this.selected.has(book.id));
		this.close();
		this.onSubmit(chosen);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
