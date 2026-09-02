import { PluginSettingTab, Setting } from "obsidian";
import type { App, Plugin } from "obsidian";
import type { Locale, PluginConfig, TafsirResolutionStrategy } from "../../config/types";
import type { AppServices } from "../AppServices";
import { SETTINGS_SCHEMA, type SettingFieldDefinition } from "./SettingsSchema";

export interface SettingsHost {
	settings: PluginConfig;
	saveSettings(): Promise<void>;
}

const RESOLUTION_LABELS: Record<TafsirResolutionStrategy, Record<Locale, string>> = {
	explicit: { ar: "اختيار صريح من قائمة", en: "Explicit picker choice" },
	lineAliases: { ar: "أسماء مذكورة في السطر", en: "Names mentioned on the line" },
	favorites: { ar: "الكتب المفضلة", en: "Favorite books" },
	default: { ar: "الكتاب الافتراضي", en: "Default book" },
};

export class QuranKeySettingsTab extends PluginSettingTab {
	private readonly host: Plugin & SettingsHost;

	constructor(app: App, pluginInstance: Plugin & SettingsHost, private readonly services: AppServices) {
		super(app, pluginInstance);
		this.host = pluginInstance;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const locale = this.host.settings.interfaceLanguage;

		for (const section of SETTINGS_SCHEMA) {
			new Setting(containerEl).setName(section.heading[locale]).setHeading();
			for (const field of section.fields) this.renderField(containerEl, field, locale);
		}

		new Setting(containerEl).setName(locale === "ar" ? "تخصيص كتب التفسير" : "Tafsir book options").setHeading();
		this.renderDefaultTafsirBook(containerEl, locale);
		this.renderFavorites(containerEl, locale);
		this.renderCustomBooks(containerEl, locale);
		this.renderResolutionOrder(containerEl, locale);

		new Setting(containerEl).setName(locale === "ar" ? "قواعد التطبيع والتصنيفات" : "Normalization and reflections").setHeading();
		this.renderNormalizationRules(containerEl, locale);
		this.renderReflectionCategories(containerEl, locale);

		new Setting(containerEl).setName(locale === "ar" ? "إعدادات متقدمة" : "Advanced").setHeading();
		this.renderAdvancedTunables(containerEl, locale);
	}

	private async save(): Promise<void> {
		await this.host.saveSettings();
	}

	private renderField(containerEl: HTMLElement, field: SettingFieldDefinition, locale: Locale): void {
		const settings = this.host.settings as unknown as Record<string, unknown>;
		const setting = new Setting(containerEl).setName(field.label[locale]).setDesc(field.description[locale]);

		switch (field.type) {
			case "toggle":
				setting.addToggle((toggle) =>
					toggle.setValue(Boolean(settings[field.key])).onChange(async (value) => {
						settings[field.key] = value;
						await this.save();
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
					textarea.inputEl.rows = 6;
					textarea.inputEl.addClass("quran-key-settings-textarea");
				});
				break;
			case "dropdown":
				setting.addDropdown((dropdown) => {
					for (const opt of field.dropdownOptions ?? []) dropdown.addOption(opt.value, opt.label);
					dropdown.setValue(String(settings[field.key]));
					dropdown.onChange(async (value) => {
						settings[field.key] = value;
						await this.save();
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
					? "يُستخدم إذا لم تُحلّ أي خطوة أعلاه في ترتيب الأولوية أدناه."
					: "Used when no earlier step in the resolution order below resolves."
			)
			.addDropdown((dropdown) => {
				for (const book of this.services.catalog.all()) dropdown.addOption(book.id, book.name);
				dropdown.setValue(this.host.settings.defaultTafsirBookId);
				dropdown.onChange(async (value) => {
					this.host.settings.defaultTafsirBookId = value;
					await this.save();
				});
			});
	}

	private renderFavorites(containerEl: HTMLElement, locale: Locale): void {
		const section = containerEl.createEl("details");
		section.createEl("summary", { text: locale === "ar" ? "كتب التفسير المفضلة" : "Favorite tafsir books" });
		const list = section.createDiv();
		for (const book of this.services.catalog.all()) {
			new Setting(list).setName(book.name).addToggle((toggle) =>
				toggle.setValue(this.host.settings.favoriteBooksIds.includes(book.id)).onChange(async (value) => {
					const set = new Set(this.host.settings.favoriteBooksIds);
					if (value) set.add(book.id);
					else set.delete(book.id);
					this.host.settings.favoriteBooksIds = Array.from(set);
					await this.save();
				})
			);
		}
	}

	private renderCustomBooks(containerEl: HTMLElement, locale: Locale): void {
		const list = containerEl.createDiv();
		const renderList = () => {
			list.empty();
			for (const book of this.host.settings.customTafsirBooks) {
				new Setting(list)
					.setName(book.name)
					.setDesc(book.urlTemplate)
					.addExtraButton((btn) =>
						btn.setIcon("trash").onClick(async () => {
							this.host.settings.customTafsirBooks = this.host.settings.customTafsirBooks.filter(
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
			.setName(locale === "ar" ? "إضافة مصدر تفسير جديد" : "Add a new tafsir source")
			.setDesc(
				locale === "ar"
					? "استخدم {bookId} و{surahId} و{ayahId} داخل الرابط — يتم استبدالها تلقائياً عند الجلب."
					: "Use {bookId}, {surahId}, {ayahId} inside the URL — substituted automatically at fetch time."
			)
			.addText((t) => t.setPlaceholder("id").onChange((v) => (newId = v)))
			.addText((t) => t.setPlaceholder(locale === "ar" ? "الاسم" : "Name").onChange((v) => (newName = v)))
			.addText((t) =>
				t.setPlaceholder(locale === "ar" ? "أسماء بديلة، مفصولة بفواصل" : "aliases, comma-separated").onChange((v) => (newAliases = v))
			)
			.addText((t) => t.setPlaceholder("https://example.com/tafsir?src={bookId}&s={surahId}&a={ayahId}").onChange((v) => (newUrl = v)))
			.addButton((btn) =>
				btn.setButtonText(locale === "ar" ? "إضافة" : "Add").onClick(async () => {
					if (!newId.trim() || !newName.trim() || !newUrl.trim()) return;
					this.host.settings.customTafsirBooks = [
						...this.host.settings.customTafsirBooks,
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
			const order = this.host.settings.tafsirBookResolutionOrder;
			order.forEach((strategy, idx) => {
				const row = new Setting(list).setName(`${idx + 1}. ${RESOLUTION_LABELS[strategy]?.[locale] ?? strategy}`);
				row.addExtraButton((btn) =>
					btn
						.setIcon("arrow-up")
						.setDisabled(idx === 0)
						.onClick(async () => {
							const next = [...order];
							[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
							this.host.settings.tafsirBookResolutionOrder = next;
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
							this.host.settings.tafsirBookResolutionOrder = next;
							await this.save();
							renderList();
						})
				);
			});
		};
		renderList();
	}

	private renderNormalizationRules(containerEl: HTMLElement, locale: Locale): void {
		const details = containerEl.createEl("details");
		details.createEl("summary", { text: locale === "ar" ? "قواعد تطبيع النص العربي" : "Arabic normalization rules" });
		const list = details.createDiv();
		const renderList = () => {
			list.empty();
			this.host.settings.normalizationRules.forEach((rule, idx) => {
				const row = new Setting(list).setName(rule.description || rule.id).setDesc(`${rule.pattern} -> ${rule.replacement}`);
				row.addToggle((toggle) =>
					toggle.setValue(rule.enabled).onChange(async (value) => {
						const rules = [...this.host.settings.normalizationRules];
						rules[idx] = { ...rules[idx], enabled: value };
						this.host.settings.normalizationRules = rules;
						await this.save();
					})
				);
				row.addExtraButton((btn) =>
					btn.setIcon("trash").onClick(async () => {
						this.host.settings.normalizationRules = this.host.settings.normalizationRules.filter((_, i) => i !== idx);
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
				.addText((t) => t.setPlaceholder(locale === "ar" ? "النمط (بلا علامات /)" : "pattern (no slashes)").onChange((v) => (pattern = v)))
				.addText((t) => t.setPlaceholder(locale === "ar" ? "البديل" : "replacement").onChange((v) => (replacement = v)))
				.addText((t) => t.setPlaceholder(locale === "ar" ? "وصف مختصر" : "short description").onChange((v) => (description = v)))
				.addButton((btn) =>
					btn.setButtonText(locale === "ar" ? "إضافة" : "Add").onClick(async () => {
						if (!pattern.trim()) return;
						this.host.settings.normalizationRules = [
							...this.host.settings.normalizationRules,
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

	private renderReflectionCategories(containerEl: HTMLElement, locale: Locale): void {
		const list = containerEl.createDiv();
		const renderList = () => {
			list.empty();
			for (const cat of this.host.settings.customReflectionCategories) {
				new Setting(list)
					.setName(cat.name)
					.setDesc(cat.folder)
					.addExtraButton((btn) =>
						btn.setIcon("trash").onClick(async () => {
							this.host.settings.customReflectionCategories = this.host.settings.customReflectionCategories.filter(
								(c) => c.id !== cat.id
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
		let newFolder = "";
		new Setting(containerEl)
			.setName(locale === "ar" ? "إضافة تصنيف تدبر جديد" : "Add a new reflection category")
			.setDesc(
				locale === "ar"
					? "تدبر وأثر مضمّنان دائماً. أضف تصنيفاً جديداً هنا (مثل «فائدة») ليصبح له مجلد خاص."
					: "Tadabbur and Athar are builtin. Add custom categories here (e.g. Benefit) to assign dedicated folders."
			)
			.addText((t) => t.setPlaceholder("id").onChange((v) => (newId = v)))
			.addText((t) => t.setPlaceholder(locale === "ar" ? "الاسم" : "Name").onChange((v) => (newName = v)))
			.addText((t) => t.setPlaceholder(locale === "ar" ? "اسم الفولدر" : "Folder name").onChange((v) => (newFolder = v)))
			.addButton((btn) =>
				btn.setButtonText(locale === "ar" ? "إضافة" : "Add").onClick(async () => {
					if (!newId.trim() || !newName.trim() || !newFolder.trim()) return;
					this.host.settings.customReflectionCategories = [
						...this.host.settings.customReflectionCategories,
						{ id: newId.trim(), name: newName.trim(), folder: newFolder.trim(), isBuiltin: false },
					];
					await this.save();
					renderList();
				})
			);
	}

	private renderAdvancedTunables(containerEl: HTMLElement, locale: Locale): void {
		const numberField = (
			key:
				| "maxSlidingWindowWords"
				| "maxSuggestionResults"
				| "tafsirFetchDelayMs"
				| "tafsirFetchDelayThreshold"
				| "reflectionFileNameAyahTextMaxLength",
			label: Record<Locale, string>,
			desc: Record<Locale, string>
		) => {
			new Setting(containerEl)
				.setName(label[locale])
				.setDesc(desc[locale])
				.addText((text) =>
					text.setValue(String(this.host.settings[key])).onChange(async (value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num >= 0) {
							this.host.settings[key] = num;
							await this.save();
						}
					})
				);
		};

		numberField(
			"maxSlidingWindowWords",
			{ ar: "أقصى عرض لنافذة البحث الانزلاقي", en: "Max sliding-window width" },
			{ ar: "أقصى عدد كلمات يحاول الاكتشاف التلقائي مطابقتها دفعة واحدة.", en: "Largest word-count window the auto-detect fallback tries." }
		);
		numberField(
			"maxSuggestionResults",
			{ ar: "أقصى عدد نتائج مقترحة", en: "Max suggestion results" },
			{ ar: "أقصى عدد آيات تظهر في نوافذ البحث/النطاق.", en: "Cap on suggestions shown in the search/range modals." }
		);
		numberField(
			"tafsirFetchDelayMs",
			{ ar: "تأخير الجلب (ميلي ثانية)", en: "Fetch delay (ms)" },
			{ ar: "التأخير بين طلبات التفسير المتتالية عند طول النطاق.", en: "Delay inserted between consecutive tafsir requests for long ranges." }
		);
		numberField(
			"tafsirFetchDelayThreshold",
			{ ar: "عتبة تفعيل التأخير (عدد الآيات)", en: "Delay threshold (ayah count)" },
			{ ar: "أقل طول نطاق يبدأ عنده تفعيل التأخير أعلاه.", en: "Range length above which the delay above kicks in." }
		);
		numberField(
			"reflectionFileNameAyahTextMaxLength",
			{ ar: "أقصى طول لنص الآية داخل اسم الملف", en: "Max ayah-text length in filename" },
			{
				ar: "يُقتطع نص الآية داخل عنوان الملف عند هذا الطول (٠ = بلا اقتطاع).",
				en: "Ayah text inside the file title is truncated at this length (0 = no truncation).",
			}
		);
	}
}