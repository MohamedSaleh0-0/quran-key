import { SuggestModal } from "obsidian";
import type { App } from "obsidian";
import type { AppServices } from "../AppServices";
import { t } from "../../config/strings";

interface SurahChoice {
	id: number;
	name: string;
	ayahCount: number;
}

export class SurahNoteModal extends SuggestModal<SurahChoice> {
	private readonly surahs: SurahChoice[];

	constructor(app: App, private readonly services: AppServices) {
		super(app);
		this.setPlaceholder(t(services.settings.interfaceLanguage, "surah.placeholder"));
		const grouped = new Map<number, SurahChoice>();
		for (const ayah of services.repository.getAllAyahs()) {
			const current = grouped.get(ayah.surahId);
			if (current) current.ayahCount = Math.max(current.ayahCount, ayah.ayahId);
			else grouped.set(ayah.surahId, { id: ayah.surahId, name: ayah.surahName, ayahCount: ayah.ayahId });
		}
		this.surahs = Array.from(grouped.values()).sort((a, b) => a.id - b.id);
	}

	getSuggestions(query: string): SurahChoice[] {
		const clean = this.services.normalizer.normalizeForSearch(query.trim());
		if (!clean) return this.surahs;
		return this.surahs.filter(
			(surah) => String(surah.id).includes(clean) || this.services.normalizer.normalizeForSearch(surah.name).includes(clean)
		);
	}

	renderSuggestion(surah: SurahChoice, el: HTMLElement): void {
		el.createDiv({ text: `${surah.id}. ${surah.name}`, cls: "quran-key-suggestion-text" });
		el.createEl("small", {
			text: t(this.services.settings.interfaceLanguage, "surah.ayahCount", { count: surah.ayahCount }),
			cls: "quran-key-suggestion-meta",
		});
	}

	onChooseSuggestion(surah: SurahChoice): void {
		void this.openSurah(surah);
	}

	private async openSurah(surah: SurahChoice): Promise<void> {
		this.close();
		const note = await this.services.ayahNotes.ensureSurahNote(surah.id, surah.name);
		await this.services.app.workspace.openLinkText(note.title, "", false);
	}
}
