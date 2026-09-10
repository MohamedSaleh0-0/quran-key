import { PluginSettingTab, Setting } from "obsidian";
import type { App, Plugin } from "obsidian";
import type { CategoryOrganizationMode, Locale, TafsirResolutionStrategy } from "../../config/types";
import type { AppServices } from "../AppServices";
import { DEFAULT_SETTINGS } from "../../config/defaults";
import { SETTINGS_SCHEMA, type SettingFieldDefinition } from "./SettingsSchema";

type TabId = "general" | "appearance" | "quran-notes" | "advanced";

const RESOLUTION_LABELS: Record<TafsirResolutionStrategy, Record<Locale, string>> = {
	explicit: { ar: "اختيار صريح من قائمة", en: "Explicit picker choice" },
	lineAliases: { ar: "أسماء مذكورة في السطر", en: "Names mentioned on the line" },
	favorites: { ar: "الكتب المفضلة", en: "Favorite books" },
	default: { ar: "الكتاب الافتراضي", en: "Default book" },
};

const TAB_TITLES: Record<TabId, Record<Locale, string>> = {
	general: { ar: "عام وتنسيق النصوص", en: "General & Text" },
	appearance: { ar: "المظهر والخط", en: "Appearance" },
	"quran-notes": { ar: "التفسير والملاحظات", en: "Tafsir & Notes" },
	advanced: { ar: "إعدادات متقدمة", en: "Advanced" },
};

export class QuranKeySettingsTab extends PluginSettingTab {
	private activeTab: TabId = "general";

	constructor(app: App, plugin: Plugin, private readonly services: AppServices) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const locale = this.services.settings.interfaceLanguage;

		this.renderTabsHeader(containerEl, locale);

		const tabContent = containerEl.createDiv({ cls: "quran-key-settings-tab-content" });

		switch (this.activeTab) {
			case "general":
				this.renderGeneralTab(tabContent, locale);
				break;
			case "appearance":
				this.renderAppearanceTab(tabContent, locale);
				break;
			case "quran-notes":
				this.renderTafsirAndNotesTab(tabContent, locale);
				break;
			case "advanced":
				this.renderAdvancedTab(tabContent, locale);
				break;
		}
	}

	private renderTabsHeader(containerEl: HTMLElement, locale: Locale): void {
		const header = containerEl.createDiv({ cls: "quran-key-settings-tabs-header" });
		const tabs: TabId[] = ["general", "appearance", "quran-notes", "advanced"];

		for (const tab of tabs) {
			const btn = header.createEl("button", {
				text: TAB_TITLES[tab][locale],
				cls: `quran-key-settings-tab-btn${this.activeTab === tab ? " is-active" : ""}`,
			});
			btn.addEventListener("click", () => {
				this.activeTab = tab;
				this.display();
			});
		}
	}

	private renderGeneralTab(containerEl: HTMLElement, locale: Locale): void {
		const generalSection = SETTINGS_SCHEMA.find((s) => s.id === "general");
		if (generalSection) {
			new Setting(containerEl).setName(generalSection.heading[locale]).setHeading();
			for (const field of generalSection.fields) this.renderField(containerEl, field, locale);
		}

		const textSection = SETTINGS_SCHEMA.find((s) => s.id === "text");
		if (textSection) {
			new Setting(containerEl).setName(textSection.heading[locale]).setHeading();
			for (const field of textSection.fields) this.renderField(containerEl, field, locale);
		}
	}

	private renderAppearanceTab(containerEl: HTMLElement, locale: Locale): void {
		const styleSection = SETTINGS_SCHEMA.find((s) => s.id === "style");
		if (styleSection) {
			new Setting(containerEl).setName(styleSection.heading[locale]).setHeading();
			for (const field of styleSection.fields.filter((f) => f.key !== "customCss")) {
				this.renderField(containerEl, field, locale);
			}
		}
	}

	private renderTafsirAndNotesTab(containerEl: HTMLElement, locale: Locale): void {
		new Setting(containerEl).setName(locale === "ar" ? "كتب التفسير" : "Tafsir Books").setHeading();
		this.renderDefaultTafsirBook(containerEl, locale);
		this.renderFavorites(containerEl, locale);
		this.renderCustomBooks(containerEl, locale);
		this.renderResolutionOrder(containerEl, locale);

		new Setting(containerEl).setName(locale === "ar" ? "تصنيفات ملاحظات الآيات" : "Ayah Note Categories").setHeading();
		this.renderReflectionCategories(containerEl, locale);

		const reflectionsSection = SETTINGS_SCHEMA.find((s) => s.id === "reflections");
		if (reflectionsSection) {
			new Setting(containerEl).setName(reflectionsSection.heading[locale]).setHeading();
			const linkingEnabled = this.services.settings.deleteSelectionAfterLinkingReflection;
			for (const field of reflectionsSection.fields) {
				if (!linkingEnabled && (field.key === "reflectionBacklinkAliasTemplate" || field.key === "reflectionBacklinkWrapTemplate")) continue;
				this.renderField(containerEl, field, locale);
			}
		}
	}

	private renderAdvancedTab(containerEl: HTMLElement, locale: Locale): void {
		const searchSection = SETTINGS_SCHEMA.find((s) => s.id === "search");
		if (searchSection) {
			new Setting(containerEl).setName(searchSection.heading[locale]).setHeading();
			for (const field of searchSection.fields) this.renderField(containerEl, field, locale);
		}

		const tafsirSection = SETTINGS_SCHEMA.find((s) => s.id === "tafsir");
		if (tafsirSection) {
			new Setting(containerEl).setName(tafsirSection.heading[locale]).setHeading();
			for (const field of tafsirSection.fields) this.renderField(containerEl, field, locale);
		}

		new Setting(containerEl).setName(locale === "ar" ? "معايير محرك البحث والانزلاق" : "Engine Tunables").setHeading();
		this.renderAdvancedTunables(containerEl, locale);

		const advancedFeaturesSection = SETTINGS_SCHEMA.find((s) => s.id === "advancedFeatures");
		if (advancedFeaturesSection) {
			new Setting(containerEl).setName(advancedFeaturesSection.heading[locale]).setHeading();
			for (const field of advancedFeaturesSection.fields) this.renderField(containerEl, field, locale);
		}

		new Setting(containerEl).setName(locale === "ar" ? "قواعد التطبيع" : "Normalization Rules").setHeading();
		this.renderNormalizationRules(containerEl, locale);

		const styleSection = SETTINGS_SCHEMA.find((s) => s.id === "style");
		const customCssField = styleSection?.fields.find((f) => f.key === "customCss");
		if (customCssField) {
			new Setting(containerEl).setName(locale === "ar" ? "تخصيص المظهر المتقدم" : "Custom Styling").setHeading();
			this.renderField(containerEl, customCssField, locale);
		}

		new Setting(containerEl).setName(locale === "ar" ? "إعادة الضبط" : "Reset").setHeading();
		new Setting(containerEl)
			.setName(locale === "ar" ? "استعادة الإعدادات الافتراضية" : "Restore default settings")
			.setDesc(
				locale === "ar"
					? "يعيد كافة الإعدادات والتصنيفات والكتب المضافة إلى وضعها الأصلي."
					: "Resets all settings, custom categories, and added books to defaults."
			)
			.addButton((btn) =>
				btn
					.setButtonText(locale === "ar" ? "إعادة الضبط" : "Reset to Defaults")
					.setDestructive()
					.onClick(async () => {
						const confirmed = window.confirm(
							locale === "ar"
								? "هل أنت متأكد من رغبتك في استعادة الإعدادات الافتراضية؟ ستفقد كافة التخصيصات الحالية."
								: "Are you sure you want to restore defaults? All current customizations will be lost."
						);
						if (!confirmed) return;
						Object.assign(this.services.settings, structuredClone(DEFAULT_SETTINGS));
						await this.save();
						this.display();
					})
			);
	}

	private async save(): Promise<void> {
		await this.services.saveSettings();
	}

	private renderField(containerEl: HTMLElement, field: SettingFieldDefinition, locale: Locale): void {
		const settings = this.services.settings as unknown as Record<string, unknown>;
		const setting = new Setting(containerEl).setName(field.label[locale]).setDesc(field.description[locale]);

		switch (field.type) {
			case "toggle":
				setting.addToggle((toggle) =>
					toggle.setValue(Boolean(settings[field.key])).onChange(async (value) => {
						settings[field.key] = value;
						await this.save();
						if (field.key === "deleteSelectionAfterLinkingReflection") this.display();
					})
				);
				break;
			case "text":
				setting.addText((text) =>
					text.setValue(String(settings[field.key])).onChange(async (value) => {
						settings[field.key] = value;
						await this.save();
					})
				);
				break;
			case "textarea":
				setting.addTextArea((textarea) => {
					textarea.setValue(String(settings[field.key])).onChange(async (value) => {
						settings[field.key] = value;
						await this.save();
					});
					textarea.inputEl.rows = 4;
					textarea.inputEl.addClass("quran-key-settings-textarea");
					if (field.key === "customCss") {
						textarea.inputEl.placeholder =
							".cm-quran-key-text { border-right: 2px solid gold; padding-right: 6px; }\n.quran-key-ornate-number { font-size: 0.9em; }";
					}
				});
				break;
			case "dropdown":
				setting.addDropdown((dropdown) => {
					for (const opt of field.dropdownOptions ?? []) dropdown.addOption(opt.value, opt.label);
					dropdown.setValue(String(settings[field.key]));
					dropdown.onChange(async (value) => {
						settings[field.key] = value;
						await this.save();
						if (field.key === "interfaceLanguage") {
							this.display();
						}
					});
				});
				break;
			case "slider":
				setting.addSlider((slider) => {
					const { min, max, step } = field.slider ?? { min: 0, max: 1, step: 0.1 };
					slider
						.setLimits(min, max, step)
						.setValue(Number(settings[field.key]))
						.onChange(async (value) => {
							settings[field.key] = value;
							await this.save();
						});
				});
				break;
			case "color":
				setting.addColorPicker((picker) =>
					picker.setValue(String(settings[field.key])).onChange(async (value) => {
						settings[field.key] = value;
						await this.save();
					})
				);
				break;
		}
	}

	private renderDefaultTafsirBook(containerEl: HTMLElement, locale: Locale): void {
		new Setting(containerEl)
			.setName(locale === "ar" ? "الكتاب الافتراضي" : "Default tafsir book")
			.setDesc(
				locale === "ar"
					? "الكتاب الذي يتم جلبه تلقائياً عند عدم تحديد كتاب بعينه."
					: "Book used when no specific source is chosen."
			)
			.addDropdown((dropdown) => {
				for (const book of this.services.catalog.all()) dropdown.addOption(book.id, book.name);
				dropdown.setValue(this.services.settings.defaultTafsirBookId);
				dropdown.onChange(async (value) => {
					this.services.settings.defaultTafsirBookId = value;
					await this.save();
				});
			});
	}

	private renderFavorites(containerEl: HTMLElement, locale: Locale): void {
		const section = containerEl.createEl("details");
		section.createEl("summary", { text: locale === "ar" ? "الكتب المفضلة" : "Favorite books" });
		const list = section.createDiv();

		new Setting(list).setDesc(
			locale === "ar"
				? "تُجلب هذه الكتب مباشرة عند وصول أولوية الجلب إلى خيار «الكتب المفضلة» دون الحاجة للاختيار اليدوي."
				: "These books are fetched automatically when the priority order reaches 'Favorite books'."
		);

		for (const book of this.services.catalog.all()) {
			new Setting(list).setName(book.name).addToggle((toggle) =>
				toggle.setValue(this.services.settings.favoriteBooksIds.includes(book.id)).onChange(async (value) => {
					const set = new Set(this.services.settings.favoriteBooksIds);
					if (value) set.add(book.id);
					else set.delete(book.id);
					this.services.settings.favoriteBooksIds = Array.from(set);
					await this.save();
				})
			);
		}
	}

	private renderCustomBooks(containerEl: HTMLElement, locale: Locale): void {
		const list = containerEl.createDiv();
		const renderList = () => {
			list.empty();
			for (const book of this.services.settings.customTafsirBooks) {
				new Setting(list)
					.setName(book.name)
					.setDesc(book.urlTemplate)
					.addExtraButton((btn) =>
						btn.setIcon("trash").onClick(async () => {
							this.services.settings.customTafsirBooks = this.services.settings.customTafsirBooks.filter(
								(b) => b.id !== book.id
							);
							await this.save();
							renderList();
						})
					);
			}
		};
		renderList();

		let newId = "";
		let newName = "";
		let newAliases = "";
		let newUrl = "";
		new Setting(containerEl)
			.setName(locale === "ar" ? "إضافة مصدر تفسير جديد" : "Add a custom tafsir source")
			.setDesc(
				locale === "ar"
					? "استخدم {bookId} و {surahId} و {ayahId} داخل الرابط."
					: "Use {bookId}, {surahId}, and {ayahId} inside the URL."
			)
			.addText((t) => t.setPlaceholder("id").onChange((v) => (newId = v)))
			.addText((t) => t.setPlaceholder(locale === "ar" ? "الاسم" : "Name").onChange((v) => (newName = v)))
			.addText((t) =>
				t.setPlaceholder(locale === "ar" ? "أسماء بديلة (مفصولة بفواصل)" : "Aliases (comma-separated)").onChange((v) => (newAliases = v))
			)
			.addText((t) => t.setPlaceholder("https://...").onChange((v) => (newUrl = v)))
			.addButton((btn) =>
				btn.setButtonText(locale === "ar" ? "إضافة" : "Add").onClick(async () => {
					if (!newId.trim() || !newName.trim() || !newUrl.trim()) return;
					this.services.settings.customTafsirBooks = [
						...this.services.settings.customTafsirBooks,
						{
							id: newId.trim(),
							name: newName.trim(),
							aliases: newAliases
								.split(",")
								.map((a) => a.trim())
								.filter(Boolean),
							urlTemplate: newUrl.trim(),
							isBuiltin: false,
						},
					];
					await this.save();
					this.display();
				})
			);
	}

	private renderResolutionOrder(containerEl: HTMLElement, locale: Locale): void {
		const list = containerEl.createDiv();
		const renderList = () => {
			list.empty();
			const order = this.services.settings.tafsirBookResolutionOrder;
			order.forEach((strategy, idx) => {
				const row = new Setting(list).setName(`${idx + 1}. ${RESOLUTION_LABELS[strategy]?.[locale] ?? strategy}`);
				row.addExtraButton((btn) =>
					btn
						.setIcon("arrow-up")
						.setDisabled(idx === 0)
						.onClick(async () => {
							const next = [...order];
							[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
							this.services.settings.tafsirBookResolutionOrder = next;
							await this.save();
							renderList();
						})
				);
				row.addExtraButton((btn) =>
					btn
						.setIcon("arrow-down")
						.setDisabled(idx === order.length - 1)
						.onClick(async () => {
							const next = [...order];
							[next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
							this.services.settings.tafsirBookResolutionOrder = next;
							await this.save();
							renderList();
						})
				);
			});
		};
		renderList();
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
			.addText((t) => t.setPlaceholder("id").onChange((v) => (newId = v)))
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

	private renderAdvancedTunables(containerEl: HTMLElement, locale: Locale): void {
		const numberField = (
			key: "maxSlidingWindowWords" | "maxSuggestionResults" | "tafsirFetchDelayMs" | "tafsirFetchDelayThreshold" | "reflectionFileNameAyahTextMaxLength",
			label: Record<Locale, string>,
			desc: Record<Locale, string>
		) => {
			new Setting(containerEl)
				.setName(label[locale])
				.setDesc(desc[locale])
				.addText((text) =>
					text.setValue(String(this.services.settings[key])).onChange(async (value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num >= 0) {
							this.services.settings[key] = num;
							await this.save();
						}
					})
				);
		};

		numberField(
			"maxSlidingWindowWords",
			{ ar: "أقصى عرض لنافذة البحث التلقائي", en: "Max auto-detect word window" },
			{ ar: "أقصى عدد كلمات يحاول الاكتشاف التلقائي مطابقتها دفعة واحدة.", en: "Max word count the auto-detect fallback matches at once." }
		);
		numberField(
			"maxSuggestionResults",
			{ ar: "أقصى عدد نتائج مقترحة", en: "Max suggestion results" },
			{ ar: "سقف عدد الآيات في نوافذ البحث والربط.", en: "Maximum number of verses shown in modals." }
		);
		numberField(
			"tafsirFetchDelayMs",
			{ ar: "تأخير جلب التفسير (ميلي ثانية)", en: "Tafsir fetch delay (ms)" },
			{ ar: "مهلة الانتظار بين طلبات التفسير المتتالية.", en: "Delay between consecutive tafsir requests." }
		);
		numberField(
			"tafsirFetchDelayThreshold",
			{ ar: "عتبة تفعيل التأخير (عدد الآيات)", en: "Delay threshold (ayahs)" },
			{ ar: "عدد الآيات الذي يبدأ عنده تطبيق التأخير أعلاه.", en: "Number of ayahs above which the delay applies." }
		);
		numberField(
			"reflectionFileNameAyahTextMaxLength",
			{ ar: "أقصى طول لنص الآية في اسم الملف", en: "Max ayah text length in filename" },
			{
				ar: "اقتطاع نص الآية في عنوان الملف عند هذا الحد (0 = بلا اقتطاع).",
				en: "Truncates verse text in file title at this length (0 = no truncation).",
			}
		);
	}
}
