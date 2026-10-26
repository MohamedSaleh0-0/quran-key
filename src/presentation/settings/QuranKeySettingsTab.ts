import { Modal, PluginSettingTab, Setting } from "obsidian";
import type { SettingDefinitionGroup, SettingDefinitionItem, SettingGroupItem } from "obsidian";
import type { App, Plugin } from "obsidian";
import type { CategoryOrganizationMode, Locale } from "../../config/types";
import type { AppServices } from "../AppServices";
import { DEFAULT_SETTINGS } from "../../config/defaults";
import { SETTINGS_SCHEMA, type SettingFieldDefinition } from "./SettingsSchema";

const TAB_TITLES = {
	general: { ar: "عام وتنسيق النصوص", en: "General & Text" },
	appearance: { ar: "المظهر والخط", en: "Appearance" },
	"quran-notes": { ar: "التفسير والملاحظات", en: "Tafsir & Notes" },
	advanced: { ar: "إعدادات متقدمة", en: "Advanced" },
};

export class QuranKeySettingsTab extends PluginSettingTab {
	constructor(app: App, plugin: Plugin, private readonly services: AppServices) {
		super(app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const locale = this.services.settings.interfaceLanguage;
		const sections = (ids: string[]) => SETTINGS_SCHEMA.filter((section) => ids.includes(section.id));
		const fields = (ids: string[]) => sections(ids).flatMap((section) => section.fields);
		const group = (heading: string, items: SettingGroupItem[]): SettingDefinitionGroup => ({
			type: "group",
			heading,
			items,
		});
		const page = (name: string, items: SettingDefinitionItem[]): SettingDefinitionItem => ({
			type: "page",
			name,
			items,
		});
		const custom = (
			name: string,
			desc: string,
			render: (containerEl: HTMLElement, locale: Locale) => void
		): SettingGroupItem => ({
			name,
			desc,
			render: (setting) => {
				setting.settingEl.addClass("quran-key-settings-custom-row");
				setting.controlEl.remove();
				render(setting.settingEl.createDiv({ cls: "quran-key-settings-schema-custom" }), locale);
			},
		});
		const definitions = (sectionIds: string[], excludedKeys: string[] = []): SettingGroupItem[] =>
			fields(sectionIds)
				.filter((field) => !excludedKeys.includes(field.key))
				.map((field) => this.fieldDefinition(field, locale));

		return [
			page(TAB_TITLES.general[locale], [
				group(locale === "ar" ? "عام وتنسيق النصوص" : "General & Text", definitions(["general", "text"])),
			]),
			page(TAB_TITLES.appearance[locale], [
				group(locale === "ar" ? "تنسيق المظهر" : "Appearance", definitions(["style"], ["customCss"])),
			]),
			page(TAB_TITLES["quran-notes"][locale], [
				group(locale === "ar" ? "كتب التفسير" : "Tafsir books", [
					...definitions(["tafsir"], ["rangeHeadingLevel", "bookHeadingLevel", "ayahHeadingLevel", "tafsirRangeHeadingTemplate", "tafsirBookHeadingTemplate", "tafsirAyahHeadingTemplate", "includeAyahTextInTafsir", "useHorizontalDivider"]),
					custom(
						locale === "ar" ? "مصادر التفسير المخصصة" : "Custom tafsir sources",
						locale === "ar" ? "أضف مصادر تفسير خاصة بك أو عدّلها." : "Add or edit custom tafsir sources.",
						(el, lang) => this.renderCustomBooks(el, lang)
					),
					custom(
						locale === "ar" ? "مجموعات كتب التفسير" : "Tafsir book packages",
						locale === "ar" ? "أنشئ مجموعات لإعادة استخدام اختيارات الكتب." : "Create reusable groups of tafsir books.",
						(el, lang) => this.renderTafsirPackages(el, lang)
					),
					this.fieldDefinition({
						key: "tafsirCacheEnabled",
						type: "toggle",
						label: { ar: "التخزين المؤقت للتفاسير", en: "Cache tafsir responses" },
						description: { ar: "يحفظ النتائج داخل الـ vault لإعادة استخدامها دون اتصال.", en: "Save responses in the vault for offline reuse." },
					}, locale),
					this.fieldDefinition({
						key: "tafsirCacheFolder",
						type: "text",
						label: { ar: "مجلد التخزين المؤقت", en: "Tafsir cache folder" },
						description: { ar: "مسار نسبي من جذر الـ vault.", en: "Vault-relative folder for cached tafsir responses." },
					}, locale),
				]),
				group(locale === "ar" ? "تنسيق التفسير" : "Tafsir formatting", [
					...definitions(["tafsir"], ["tafsirBookSortOrder"]),
				]),
				group(locale === "ar" ? "ملاحظات الآيات" : "Ayah notes", [
					custom(
						locale === "ar" ? "تصنيفات الملاحظات" : "Reflection categories",
						locale === "ar" ? "أدر التصنيفات وطريقة تنظيم ملاحظات الآيات." : "Manage categories and ayah note organization.",
						(el, lang) => this.renderReflectionCategories(el, lang)
					),
					...definitions(["reflections"]),
				]),
			]),
			page(TAB_TITLES.advanced[locale], [
				group(locale === "ar" ? "البحث" : "Search", [
					...definitions(["search"]),
					this.numberDefinition("maxSuggestionResults", locale === "ar" ? "حجم دفعة نتائج البحث" : "Search result page size", locale === "ar" ? "عدد الآيات الظاهرة في كل دفعة." : "Number of ayahs shown in each result page."),
					this.numberDefinition("maxSlidingWindowWords", locale === "ar" ? "أقصى عرض لنافذة البحث التلقائي" : "Max auto-detect word window", locale === "ar" ? "أقصى عدد كلمات يحاول الاكتشاف التلقائي مطابقتها." : "Max word count matched by automatic detection."),
					this.fieldDefinition({
						key: "ayahMarkerStyle",
						type: "dropdown",
						label: { ar: "نمط رقم الآية", en: "Ayah marker style" },
						description: { ar: "اختر طريقة إظهار رقم الآية.", en: "Choose how ayah numbers are displayed." },
						dropdownOptions: [
							{ value: "plain", label: "123" },
							{ value: "parenthesized", label: "(123)" },
							{ value: "end-symbol", label: "۝123" },
						],
					}, locale),
				]),
				group(locale === "ar" ? "إعدادات متقدمة" : "Advanced", [
					...definitions(["style"], ["quranFontSize", "quranLineHeight", "quranColorDark", "quranColorLight", "styleOrnateNumbers"]),
					this.numberDefinition("reflectionFileNameAyahTextMaxLength", locale === "ar" ? "أقصى طول لنص الآية في اسم الملف" : "Max ayah text length in filename", locale === "ar" ? "استخدم 0 بلا اقتطاع." : "Use 0 for no truncation."),
					this.numberDefinition("reflectionFileNameAyahTextMaxWords", locale === "ar" ? "أقصى عدد كلمات في اسم الملف" : "Max ayah words in filename", locale === "ar" ? "استخدم 0 بلا حد للكلمات." : "Use 0 for no word limit."),
					custom(
						locale === "ar" ? "قواعد تطبيع النص العربي" : "Arabic normalization rules",
						locale === "ar" ? "فعّل أو عدّل قواعد تطبيع البحث العربي." : "Enable or edit Arabic search normalization rules.",
						(el, lang) => this.renderNormalizationRules(el, lang)
					),
					this.fieldDefinition(SETTINGS_SCHEMA.find((section) => section.id === "style")!.fields.find((field) => field.key === "customCss")!, locale),
					custom(
						locale === "ar" ? "استعادة الإعدادات الافتراضية" : "Restore default settings",
						locale === "ar" ? "يعيد كافة الإعدادات والتصنيفات والكتب المضافة إلى وضعها الأصلي." : "Resets all settings, custom categories, and added books to defaults.",
						(el, lang) => this.renderReset(el, lang)
					),
				]),
			]),
		];
	}

	getControlValue(key: string): unknown {
		return (this.services.settings as unknown as Record<string, unknown>)[key];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (key === "tafsirCacheFolder" && typeof value === "string") value = value.trim() || "tafsir";
		(this.services.settings as unknown as Record<string, unknown>)[key] = value;
		await this.services.saveSettings();
		if (key === "interfaceLanguage") this.update();
	}

	private numberDefinition(key: string, name: string, desc: string): SettingGroupItem {
		return { name, desc, control: { type: "number", key, min: 0, step: 1 } };
	}

	private fieldDefinition(field: SettingFieldDefinition, locale: Locale): SettingGroupItem {
		const base = { name: field.label[locale], desc: field.description[locale] };
		switch (field.type) {
			case "toggle":
				return { ...base, control: { type: "toggle", key: field.key } };
			case "text":
				return { ...base, control: { type: "text", key: field.key } };
			case "textarea":
				return { ...base, control: { type: "textarea", key: field.key, rows: 4 } };
			case "dropdown":
				return {
					...base,
					control: {
						type: "dropdown",
						key: field.key,
						options: Object.fromEntries((field.dropdownOptions ?? []).map((option) => [option.value, option.label])),
					},
				};
			case "slider":
				return { ...base, control: { type: "slider", key: field.key, ...(field.slider ?? { min: 0, max: 1, step: 0.1 }) } };
			case "color":
				return { ...base, control: { type: "color", key: field.key } };
		}
	}

	private async save(): Promise<void> {
		await this.services.saveSettings();
	}

	private confirmReset(locale: Locale): Promise<boolean> {
		return new Promise((resolve) => {
			const modal = new Modal(this.app);
			let confirmed = false;
			modal.setTitle(locale === "ar" ? "استعادة الإعدادات الافتراضية" : "Restore default settings");
			modal.contentEl.createEl("p", {
				text: locale === "ar"
					? "هل أنت متأكد؟ ستفقد كافة التخصيصات الحالية."
					: "Are you sure? All current customizations will be lost.",
			});
			const actions = modal.contentEl.createDiv({ cls: "modal-button-container" });
			const cancel = actions.createEl("button", { text: locale === "ar" ? "إلغاء" : "Cancel" });
			cancel.addEventListener("click", () => modal.close());
			const accept = actions.createEl("button", { text: locale === "ar" ? "استعادة" : "Restore", cls: "mod-warning" });
			accept.addEventListener("click", () => {
				confirmed = true;
				modal.close();
			});
			modal.onClose = () => resolve(confirmed);
			modal.open();
		});
	}

	private renderReset(containerEl: HTMLElement, locale: Locale): void {
		new Setting(containerEl)
			.setName(locale === "ar" ? "إعادة ضبط الإعدادات" : "Reset settings")
			.setDesc(locale === "ar" ? "استعادة جميع التخصيصات إلى القيم الافتراضية." : "Restore all settings to their default values.")
			.addButton((button) =>
				button
					.setButtonText(locale === "ar" ? "استعادة" : "Restore")
					.setDestructive()
					.onClick(async () => {
						if (!(await this.confirmReset(locale))) return;
						Object.assign(this.services.settings, structuredClone(DEFAULT_SETTINGS));
						await this.save();
						this.update();
					})
			);
	}

	private renderCustomBooks(containerEl: HTMLElement, locale: Locale): void {
		const list = containerEl.createDiv({ cls: "quran-key-settings-card-list" });
		const input = (parent: HTMLElement, value: string, placeholder: string): HTMLInputElement => {
			const el = parent.createEl("input", { type: "text", placeholder });
			el.value = value;
			return el;
		};
		const renderList = () => {
			list.empty();
			for (const book of this.services.settings.customTafsirBooks) {
				const card = list.createDiv({ cls: "quran-key-settings-card" });
				const header = card.createDiv({ cls: "quran-key-settings-card-header" });
				header.createSpan({ text: book.name, cls: "quran-key-settings-card-title" });
				header.createSpan({ text: `${book.id} · ${book.aliases.length} ${locale === "ar" ? "أسماء بديلة" : "aliases"}`, cls: "quran-key-modal-alias" });
				const actions = header.createDiv({ cls: "quran-key-settings-card-actions" });
				const edit = actions.createEl("button", { text: locale === "ar" ? "تعديل" : "Edit" });
				const remove = actions.createEl("button", { text: locale === "ar" ? "حذف" : "Delete" });
				remove.addClass("mod-warning");
				const details = card.createDiv({ cls: "quran-key-settings-form quran-key-settings-card-editor" });
				details.hidden = true;
				const name = input(details, book.name, locale === "ar" ? "اسم الكتاب" : "Book name");
				const aliases = input(details, book.aliases.join(", "), locale === "ar" ? "الأسماء البديلة" : "Aliases");
				const url = input(details, book.urlTemplate, "https://...");
				const editorActions = details.createDiv({ cls: "quran-key-settings-form-actions" });
				const save = editorActions.createEl("button", { text: locale === "ar" ? "حفظ" : "Save", cls: "mod-cta" });
				const cancel = editorActions.createEl("button", { text: locale === "ar" ? "إلغاء" : "Cancel" });
				edit.addEventListener("click", () => {
					details.hidden = false;
					edit.disabled = true;
				});
				save.addEventListener("click", () => {
					void (async () => {
						this.services.settings.customTafsirBooks = this.services.settings.customTafsirBooks.map((item) =>
							item.id === book.id
								? { ...item, name: name.value.trim() || item.name, aliases: aliases.value.split(",").map((a) => a.trim()).filter(Boolean), urlTemplate: url.value.trim() || item.urlTemplate }
								: item
						);
						await this.save();
						this.update();
					})();
				});
				cancel.addEventListener("click", () => {
					details.hidden = true;
					edit.disabled = false;
				});
				remove.addEventListener("click", () => {
					void (async () => {
						this.services.settings.customTafsirBooks = this.services.settings.customTafsirBooks.filter((item) => item.id !== book.id);
						await this.save();
						this.update();
					})();
				});
			}
		};
		renderList();

		new Setting(containerEl)
			.setName(locale === "ar" ? "إضافة مصدر تفسير جديد" : "Add a custom tafsir source")
			.setDesc(locale === "ar" ? "استخدم {bookId} و {surahId} و {ayahId} داخل الرابط." : "Use {bookId}, {surahId}, and {ayahId} inside the URL.");
		const form = containerEl.createDiv({ cls: "quran-key-settings-form" });
		const newId = input(form, "", "id");
		const newName = input(form, "", locale === "ar" ? "الاسم" : "Name");
		const newAliases = input(form, "", locale === "ar" ? "أسماء بديلة، مفصولة بفواصل" : "Aliases, comma-separated");
		const newUrl = input(form, "", "https://...");
		const actions = form.createDiv({ cls: "quran-key-settings-form-actions" });
		const add = actions.createEl("button", { text: locale === "ar" ? "إضافة" : "Add", cls: "mod-cta" });
		add.addEventListener("click", () => {
			void (async () => {
				if (!newId.value.trim() || !newName.value.trim() || !newUrl.value.trim()) return;
				this.services.settings.customTafsirBooks = [...this.services.settings.customTafsirBooks, {
					id: newId.value.trim(), name: newName.value.trim(),
					aliases: newAliases.value.split(",").map((a) => a.trim()).filter(Boolean),
					urlTemplate: newUrl.value.trim(), isBuiltin: false, createdAt: Date.now(),
				}];
				await this.save();
				this.update();
			})();
		});
	}

	private renderTafsirPackages(containerEl: HTMLElement, locale: Locale): void {
		const books = this.services.catalog.all();
		const list = containerEl.createDiv({ cls: "quran-key-settings-card-list" });
		const checkboxGrid = (parent: HTMLElement, selectedIds: readonly string[]): Set<string> => {
			const selected = new Set(selectedIds);
			const grid = parent.createDiv({ cls: "quran-key-settings-book-grid" });
			for (const book of books) {
				const label = grid.createEl("label");
				const checkbox = label.createEl("input", { type: "checkbox" });
				checkbox.checked = selected.has(book.id);
				checkbox.addEventListener("change", () => checkbox.checked ? selected.add(book.id) : selected.delete(book.id));
				label.createSpan({ text: book.name });
			}
			return selected;
		};
		for (const pkg of this.services.settings.tafsirPackages) {
			const card = list.createDiv({ cls: "quran-key-settings-card" });
			const header = card.createDiv({ cls: "quran-key-settings-card-header" });
			header.createSpan({ text: pkg.name, cls: "quran-key-settings-card-title" });
			header.createSpan({ text: `${pkg.bookIds.length} ${locale === "ar" ? "كتب" : "books"}`, cls: "quran-key-modal-alias" });
			const actions = header.createDiv({ cls: "quran-key-settings-card-actions" });
			const edit = actions.createEl("button", { text: locale === "ar" ? "تعديل" : "Edit" });
			const remove = actions.createEl("button", { text: locale === "ar" ? "حذف" : "Delete" });
			remove.addClass("mod-warning");
			const editor = card.createDiv({ cls: "quran-key-settings-card-editor" });
			editor.hidden = true;
			const name = editor.createEl("input", { type: "text", placeholder: locale === "ar" ? "اسم المجموعة" : "Package name" });
			name.value = pkg.name;
			const selected = checkboxGrid(editor, pkg.bookIds);
			const editorActions = editor.createDiv({ cls: "quran-key-settings-form-actions" });
			const save = editorActions.createEl("button", { text: locale === "ar" ? "حفظ التعديلات" : "Save changes", cls: "mod-cta" });
			const cancel = editorActions.createEl("button", { text: locale === "ar" ? "إلغاء" : "Cancel" });
			edit.addEventListener("click", () => {
				editor.hidden = false;
				edit.disabled = true;
			});
			save.addEventListener("click", () => {
				void (async () => {
					this.services.settings.tafsirPackages = this.services.settings.tafsirPackages.map((item) => item.id === pkg.id ? { ...item, name: name.value.trim() || item.name, bookIds: Array.from(selected) } : item);
					await this.save();
					this.update();
				})();
			});
			cancel.addEventListener("click", () => {
				editor.hidden = true;
				edit.disabled = false;
			});
			remove.addEventListener("click", () => {
				void (async () => {
					this.services.settings.tafsirPackages = this.services.settings.tafsirPackages.filter((item) => item.id !== pkg.id);
					await this.save();
					this.update();
				})();
			});
		}

		new Setting(containerEl)
			.setName(locale === "ar" ? "إضافة مجموعة كتب" : "Add book package")
			.setDesc(locale === "ar" ? "أنشئ مجموعة خاصة بك لاختيار عدة كتب دفعة واحدة." : "Create your own reusable group of books.");
		const form = containerEl.createDiv({ cls: "quran-key-settings-form" });
		const name = form.createEl("input", { type: "text", placeholder: locale === "ar" ? "اسم المجموعة" : "Package name" });
		const selected = checkboxGrid(form, []);
		const add = form.createEl("button", { text: locale === "ar" ? "إضافة المجموعة" : "Add package", cls: "mod-cta" });
		add.addEventListener("click", () => {
			void (async () => {
				if (!name.value.trim() || selected.size === 0) return;
				this.services.settings.tafsirPackages = [...this.services.settings.tafsirPackages, { id: `custom-${Date.now().toString(36)}`, name: name.value.trim(), bookIds: Array.from(selected), isBuiltin: false }];
				await this.save();
				this.update();
			})();
		});
	}

	private renderReflectionCategories(containerEl: HTMLElement, locale: Locale): void {
		const list = containerEl.createDiv();
		const allCategories = () => [...this.services.reflectionCatalog.all()];

		const patchCategory = (id: string, patch: Partial<(typeof this.services.settings.customReflectionCategories)[number]>) => {
			const builtin = allCategories().find((c) => c.id === id && c.isBuiltin);
			const custom = this.services.settings.customReflectionCategories;
			const idx = custom.findIndex((c) => c.id === id);
			if (idx !== -1) {
				const next = [...custom];
				next[idx] = { ...next[idx], ...patch };
				this.services.settings.customReflectionCategories = next;
			} else if (builtin) {
				this.services.settings.customReflectionCategories = [...custom, { ...builtin, ...patch }];
			}
		};

		const renderList = () => {
			list.empty();
			for (const cat of allCategories()) {
				const details = list.createEl("details", { cls: "quran-key-picker-add-source" });
				details.createEl("summary", { text: cat.name });
				const body = details.createDiv();

				new Setting(body)
					.setName(locale === "ar" ? "الاسم" : "Name")
					.addText((tx) =>
						tx.setValue(cat.name).onChange(async (v) => {
							patchCategory(cat.id, { name: v });
							await this.save();
						})
					);

				new Setting(body)
					.setName(locale === "ar" ? "مكان التدوين" : "Organization")
					.setDesc(
						locale === "ar"
							? "موحد: داخل ملاحظة الآية. مجلد مستقل: ملف منفصل لكل آية."
							: "Unified: inside ayah note. Own folder: separate file per ayah."
					)
					.addDropdown((dd) => {
						dd.addOption("unified", locale === "ar" ? "موحد" : "unified");
						dd.addOption("ownFolder", locale === "ar" ? "مجلد مستقل" : "ownFolder");
						dd.setValue(cat.organizationMode);
						dd.onChange(async (v) => {
							patchCategory(cat.id, { organizationMode: v as CategoryOrganizationMode });
							await this.save();
							renderList();
						});
					});

				new Setting(body)
					.setName(locale === "ar" ? "إظهار أمرك الخاص" : "Dedicated command")
					.setDesc(locale === "ar" ? "أضف أمراً مستقلاً لهذا التصنيف إلى لوحة الأوامر." : "Add a separate command for this category to the command palette.")
					.addToggle((toggle) =>
						toggle.setValue(cat.dedicatedCommand === true).onChange(async (value) => {
							patchCategory(cat.id, { dedicatedCommand: value });
							await this.save();
							if (value) this.services.registerReflectionCategoryCommand(cat.id);
							else this.services.unregisterReflectionCategoryCommand(cat.id);
						})
					);

				new Setting(body)
					.setName(locale === "ar" ? "العنوان" : "Heading")
					.setDesc(locale === "ar" ? "مثل: ### تدبرات" : "e.g. ### Reflections")
					.addText((tx) =>
						tx.setValue(`${cat.headingLevel} ${cat.headingText}`.trim()).onChange(async (v) => {
							const match = /^(#{1,6})\s*(.*)$/.exec(v.trim());
							if (match) {
								patchCategory(cat.id, { headingLevel: match[1], headingText: match[2] });
							} else {
								patchCategory(cat.id, { headingText: v.trim() });
							}
							await this.save();
						})
					);

				if (cat.organizationMode === "ownFolder") {
					new Setting(body)
						.setName(locale === "ar" ? "المجلد" : "Folder")
						.setDesc(locale === "ar" ? "المجلد المخصص لحفظ ملفات هذا التصنيف." : "Folder where this category's files are saved.")
						.addText((tx) =>
							tx.setValue(cat.folder).onChange(async (v) => {
								patchCategory(cat.id, { folder: v });
								await this.save();
							})
						);
				}

				if (!cat.isBuiltin) {
					new Setting(body).addExtraButton((btn) =>
						btn.setIcon("trash").onClick(async () => {
							this.services.settings.customReflectionCategories = this.services.settings.customReflectionCategories.filter(
								(c) => c.id !== cat.id
							);
							await this.save();
							this.services.unregisterReflectionCategoryCommand(cat.id);
							renderList();
						})
					);
				}
			}
		};
		renderList();

		let newId = "";
		let newName = "";
		new Setting(containerEl)
			.setName(locale === "ar" ? "إضافة تصنيف جديد" : "Add a category")
			.setDesc(locale === "ar" ? "مثال: فوائد عملية" : "e.g. Practical Benefits")
			.addText((t) => t.setPlaceholder("ID").onChange((v) => (newId = v)))
			.addText((t) => t.setPlaceholder(locale === "ar" ? "الاسم" : "Name").onChange((v) => (newName = v)))
			.addButton((btn) =>
				btn.setButtonText(locale === "ar" ? "إضافة" : "Add").onClick(async () => {
					if (!newId.trim() || !newName.trim()) return;
					const trimmedId = newId.trim();
					this.services.settings.customReflectionCategories = [
						...this.services.settings.customReflectionCategories,
						{
							id: trimmedId,
							name: newName.trim(),
							organizationMode: "unified",
							headingText: newName.trim(),
							headingLevel: "###",
							folder: "",
							isBuiltin: false,
							dedicatedCommand: false,
						},
					];
					await this.save();
					renderList();
				})
			);
	}

	private renderNormalizationRules(containerEl: HTMLElement, locale: Locale): void {
		const details = containerEl.createEl("details");
		details.createEl("summary", { text: locale === "ar" ? "قواعد تطبيع النص العربي" : "Arabic normalization rules" });
		const list = details.createDiv();
		const renderList = () => {
			list.empty();
			this.services.settings.normalizationRules.forEach((rule, idx) => {
				const row = new Setting(list).setName(rule.description || rule.id).setDesc(`${rule.pattern} -> ${rule.replacement}`);
				row.addToggle((toggle) =>
					toggle.setValue(rule.enabled).onChange(async (value) => {
						const rules = [...this.services.settings.normalizationRules];
						rules[idx] = { ...rules[idx], enabled: value };
						this.services.settings.normalizationRules = rules;
						await this.save();
					})
				);
				row.addExtraButton((btn) =>
					btn.setIcon("trash").onClick(async () => {
						this.services.settings.normalizationRules = this.services.settings.normalizationRules.filter((_, i) => i !== idx);
						await this.save();
						renderList();
					})
				);
			});

			let pattern = "";
			let replacement = "";
			let description = "";
			new Setting(list)
				.setName(locale === "ar" ? "إضافة قاعدة" : "Add a rule")
				.addText((t) => t.setPlaceholder(locale === "ar" ? "النمط" : "Pattern").onChange((v) => (pattern = v)))
				.addText((t) => t.setPlaceholder(locale === "ar" ? "البديل" : "Replacement").onChange((v) => (replacement = v)))
				.addText((t) => t.setPlaceholder(locale === "ar" ? "الوصف" : "Description").onChange((v) => (description = v)))
				.addButton((btn) =>
					btn.setButtonText(locale === "ar" ? "إضافة" : "Add").onClick(async () => {
						if (!pattern.trim()) return;
						this.services.settings.normalizationRules = [
							...this.services.settings.normalizationRules,
							{
								id: `custom-${Date.now()}`,
								description: description.trim(),
								pattern: pattern.trim(),
								flags: "g",
								replacement,
								enabled: true,
							},
						];
						await this.save();
						renderList();
					})
				);
		};
		renderList();
	}


}
