import { SuggestModal } from "obsidian";
import type { Editor } from "obsidian";
import type { Ayah } from "../../domain/entities/Ayah";
import type { EditorPosition } from "../../domain/ports/EditorPort";
import type { AppServices } from "../AppServices";
import { TafsirBookPickerModal } from "./TafsirBookPickerModal";
import type { VerseSelectHandler } from "./types";
import { ArabicNormalizer } from "../../domain/services/ArabicNormalizer";
import { t } from "../../config/strings";

/**
 * Scoped range-end picker: choose the closing ayah of a multi-verse range
 * starting at `startAyah`, within the same surah (FR-18). Plain
 * Enter/click inserts the resolved range as text (or resolves the
 * override); Shift+Enter skips straight to fetching tafsir for the whole
 * range (FR-19), prompting for books via TafsirBookPickerModal.
 */
export class RangeEndSuggestModal extends SuggestModal<Ayah> {
	constructor(
		private readonly services: AppServices,
		private readonly editor: Editor,
		private readonly startAyah: Ayah,
		private readonly startPos: EditorPosition,
		private readonly endPos: EditorPosition,
		private readonly onVerseSelectOverride?: VerseSelectHandler
	) {
		super(services.app);
		const locale = services.settings.interfaceLanguage;
		this.setPlaceholder(
			`${t(locale, "rangeEnd.placeholderPrefix")} ${startAyah.surahName} (${t(locale, "rangeEnd.placeholderSuffix")} ${startAyah.ayahId})`
		);
	}

	onOpen(): void {
		super.onOpen();
		this.inputEl.addEventListener(
			"keydown",
			(evt) => {
				if (evt.key !== "Enter" || !evt.shiftKey) return;
				evt.preventDefault();
				evt.stopPropagation();

				const suggestions = this.getSuggestions(this.inputEl.value);
				if (suggestions.length === 0) return;
				const activeEl = this.containerEl.querySelector(".suggestion-item.is-selected");
				let endAyah = suggestions[0];
				if (activeEl) {
					const allItems = Array.from(this.containerEl.querySelectorAll(".suggestion-item"));
					const idx = allItems.indexOf(activeEl);
					if (idx !== -1 && suggestions[idx]) endAyah = suggestions[idx];
				}
				const rangeAyahs = this.buildRange(endAyah);
				this.close();

				if (this.onVerseSelectOverride) {
					void this.onVerseSelectOverride(rangeAyahs);
					return;
				}
				this.openTafsirFlow(rangeAyahs);
			},
			true
		);
	}

	private buildRange(endAyah: Ayah): Ayah[] {
		return this.services.repository
			.getAllAyahs()
			.filter(
				(a) => a.surahId === this.startAyah.surahId && a.ayahId >= this.startAyah.ayahId && a.ayahId <= endAyah.ayahId
			);
	}

	private openTafsirFlow(rangeAyahs: Ayah[]): void {
		if (rangeAyahs.length === 0) return;
		new TafsirBookPickerModal(this.services.app, this.services, async (chosenBooks) => {
			if (chosenBooks.length === 0) return;
			const editorPort = this.services.wrapEditor(this.editor);
			const cursor = editorPort.getCursor();
			const first = rangeAyahs[0];
			const last = rangeAyahs[rangeAyahs.length - 1];
			await this.services.useCases.fetchTafsir.execute(
				editorPort,
				editorPort.getLine(cursor.line),
				cursor.line,
				first.surahId,
				first.surahName,
				first.ayahId,
				last.ayahId,
				this.services.buildTafsirOptions(),
				chosenBooks
			);
		}).open();
	}

	getSuggestions(query: string): Ayah[] {
		const pool = this.services.repository
			.getAllAyahs()
			.filter((a) => a.surahId === this.startAyah.surahId && a.ayahId >= this.startAyah.ayahId);
		if (!query || query.trim() === "") return pool.slice(0, this.services.settings.maxSuggestionResults);

		const cleanQuery = this.services.normalizer.normalizeForSearch(query);
		const numericQuery = ArabicNormalizer.normalizeNumbers(query);
		return pool
			.filter(
				(a) =>
					a.ayahId.toString().includes(numericQuery) ||
					this.services.normalizer.normalizeForSearch(a.text).includes(cleanQuery)
			)
			.slice(0, this.services.settings.maxSuggestionResults);
	}

	renderSuggestion(item: Ayah, el: HTMLElement): void {
		const textEl = el.createDiv({ cls: "quran-key-suggestion-text" });
		textEl.setText(item.text);
		el.createEl("small", { text: `\u0627\u0644\u0622\u064A\u0629 ${item.ayahId}`, cls: "quran-key-suggestion-meta" });
	}

	onChooseSuggestion(endAyah: Ayah): void {
		const rangeAyahs = this.buildRange(endAyah);
		if (this.onVerseSelectOverride) {
			void this.onVerseSelectOverride(rangeAyahs);
			return;
		}
		this.services.useCases.extract.insertAyahs(this.services.wrapEditor(this.editor), this.startPos, this.endPos, rangeAyahs, "");
	}
}
