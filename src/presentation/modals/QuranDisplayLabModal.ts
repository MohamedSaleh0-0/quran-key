import { Modal, Notice } from "obsidian";
import type { App } from "obsidian";
import {
	QURAN_RENDERING_PROFILES,
	type QuranRenderingProfile,
} from "../../config/quranRenderingProfiles";
import { formatAyahMarker } from "../../domain/services/AyahMarkerFormatter";
import { buildQuranDisplayTestStrip } from "../../domain/services/QuranDisplayTestStrip";
import type { AppServices } from "../AppServices";

/** A local comparison panel for human typography testing. It never modifies
 * vault notes; choosing a candidate only changes the plugin's saved profile. */
export class QuranDisplayLabModal extends Modal {
	constructor(app: App, private readonly services: AppServices) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		const locale = this.services.settings.interfaceLanguage;
		contentEl.empty();
		this.modalEl.addClass("quran-key-display-lab-modal");

		contentEl.createEl("h2", {
			text: locale === "ar" ? "مختبر عرض النص القرآني" : "Quran display laboratory",
		});
		contentEl.createEl("p", {
			text:
				locale === "ar"
					? "قارن الحروف والعلامات نفسها داخل الخطوط المتاحة. الشريحة اختبار بصري مركّب عمدًا وليست آية قرآنية."
					: "Compare the same letters and markers in each candidate. The strip is a deliberately composed visual test, not a Quran verse.",
			cls: "quran-key-display-lab-intro",
		});

		for (const profile of QURAN_RENDERING_PROFILES) {
			this.renderProfile(contentEl, profile);
		}
	}

	private renderProfile(containerEl: HTMLElement, profile: QuranRenderingProfile): void {
		const locale = this.services.settings.interfaceLanguage;
		const current = this.services.settings.quranRenderingProfile === profile.id;
		const card = containerEl.createDiv({ cls: `quran-key-display-lab-card${current ? " is-current" : ""}` });
		const heading = card.createDiv({ cls: "quran-key-display-lab-heading" });
		heading.createEl("h3", { text: profile.label[locale] });
		if (current) {
			heading.createSpan({ text: locale === "ar" ? "مستخدم الآن" : "Current", cls: "quran-key-display-lab-current" });
		}
		card.createEl("p", { text: profile.description[locale] });

		const samples = card.createDiv({ cls: "quran-key-display-lab-samples" });
		samples.style.fontFamily = profile.fontFamily;
		samples.setAttribute("dir", "rtl");
		samples.textContent = buildQuranDisplayTestStrip(profile.textProfile, profile.suggestedAyahMarkerStyle);
		card.createEl("small", {
			text:
				locale === "ar"
					? `أشكال علامة الآية: ${formatAyahMarker(104, "plain")}  ${formatAyahMarker(104, "parenthesized")}  ${formatAyahMarker(104, "end-symbol")}`
					: `Ayah-marker options: ${formatAyahMarker(104, "plain")}  ${formatAyahMarker(104, "parenthesized")}  ${formatAyahMarker(104, "end-symbol")}`,
			cls: "quran-key-display-lab-marker-options",
		});
		card.createEl("small", {
			text:
				locale === "ar"
					? "اختبار: الأقواس، البسملة/التطويل، الألف الخنجرية، المد والهمز، U+06DF، التنوين، الوقف، ربع الحزب، السجدة، وعلامة الآية."
					: "Checks brackets, basmala/tatweel, dagger alif, madd/hamza, U+06DF, tanween, pauses, Rubʿ, sajdah, and ayah marker.",
			cls: "quran-key-display-lab-checklist",
		});

		const button = card.createEl("button", {
			text: locale === "ar" ? "استخدم هذا العرض للتجربة" : "Use this candidate for testing",
			cls: current ? "mod-muted" : "mod-cta",
		});
		button.disabled = current;
		button.addEventListener("click", () => void this.chooseProfile(profile));
	}

	private async chooseProfile(profile: QuranRenderingProfile): Promise<void> {
		this.services.settings.quranRenderingProfile = profile.id;
		this.services.settings.ayahMarkerStyle = profile.suggestedAyahMarkerStyle;
		// A profile comparison must not be shadowed by an old manual font override.
		this.services.settings.quranFontFamily = "";
		await this.services.saveSettings();
		const locale = this.services.settings.interfaceLanguage;
		new Notice(
			locale === "ar"
				? `تم تفعيل: ${profile.label.ar}`
				: `Activated: ${profile.label.en}`
		);
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
