import { SuggestModal } from "obsidian";
import type { Editor, EditorPosition as ObsidianEditorPosition } from "obsidian";
import type { Ayah } from "../../domain/entities/Ayah";
import type { EditorPosition } from "../../domain/ports/EditorPort";
import type { AppServices } from "../AppServices";
import { AnalyticsDashboard } from "../components/AnalyticsDashboard";
import { renderHighlightedText } from "./highlightMatch";
import { TafsirBookPickerModal } from "./TafsirBookPickerModal";
import { RangeEndSuggestModal } from "./RangeEndSuggestModal";
import type { VerseSelectHandler } from "./types";
import { t } from "../../config/strings";

function toPosition(pos: ObsidianEditorPosition): EditorPosition {
	return { line: pos.line, ch: pos.ch };
}

export class QuranSearchModal extends SuggestModal<Ayah> {
	private currentQuery = "";
	private dashboard: AnalyticsDashboard | null = null;

	constructor(
		private readonly services: AppServices,
		private readonly editor: Editor,
		private readonly initialQuery: string = "",
		private readonly preFilteredMatches: Ayah[] | null = null,
		private readonly startPos: EditorPosition | null = null,
		private readonly endPos: EditorPosition | null = null,
		private readonly onVerseSelectOverride?: VerseSelectHandler
	) {
		super(services.app);
		this.setPlaceholder(t(services.settings.interfaceLanguage, "search.placeholder"));
	}

	onOpen(): void {
		super.onOpen();
		const { settings } = this.services;

		if (settings.showAnalytics) {
			const inputContainer = this.inputEl.parentElement;
			if (inputContainer) this.dashboard = new AnalyticsDashboard(inputContainer, settings.interfaceLanguage);
		}

		this.inputEl.addEventListener(
			"keydown",
			(evt) => {
				if (evt.key !== "Enter") return;
				const isCtrlOrMeta = evt.ctrlKey || evt.metaKey;
				const isShift = evt.shiftKey;
				if (!isCtrlOrMeta && !isShift) return;
				evt.preventDefault();
				evt.stopPropagation();
				this.handleModifiedEnter(isCtrlOrMeta);
			},
			true
		);

		if (this.initialQuery) {
			this.inputEl.value = this.initialQuery;
			this.currentQuery = this.initialQuery;
			window.setTimeout(() => this.inputEl.dispatchEvent(new Event("input")), 50);
		}
	}

	onClose(): void {
		this.dashboard?.destroy();
	}

	private handleModifiedEnter(isRangeRequest: boolean): void {
		const suggestions = this.getSuggestions(this.inputEl.value);
		if (suggestions.length === 0) return;

		const activeEl = this.containerEl.querySelector(".suggestion-item.is-selected");
		let target = suggestions[0];
		if (activeEl) {
			const allItems = Array.from(this.containerEl.querySelectorAll(".suggestion-item"));
			const idx = allItems.indexOf(activeEl);
			if (idx !== -1 && suggestions[idx]) target = suggestions[idx];
		}

		const start = this.startPos ?? toPosition(this.editor.getCursor("from"));
		const end = this.endPos ?? toPosition(this.editor.getCursor("to"));
		this.close();

		if (isRangeRequest) {
			new RangeEndSuggestModal(this.services, this.editor, target, start, end, this.onVerseSelectOverride).open();
			return;
		}

		if (this.onVerseSelectOverride) {
			void this.onVerseSelectOverride([target]);
		} else {
			this.openTafsirFlow(target, target);
		}
	}

	private openTafsirFlow(startAyah: Ayah, endAyah: Ayah): void {
		new TafsirBookPickerModal(this.services.app, this.services, (chosenBooks) => {
			if (chosenBooks.length === 0) return;
			const editorPort = this.services.wrapEditor(this.editor);
			const cursor = editorPort.getCursor();
			void this.services.useCases.fetchTafsir.execute(
				editorPort,
				editorPort.getLine(cursor.line),
				cursor.line,
				startAyah.surahId,
				startAyah.surahName,
				startAyah.ayahId,
				endAyah.ayahId,
				this.services.buildTafsirOptions(),
				chosenBooks
			);
		}).open();
	}

	getSuggestions(query: string): Ayah[] {
		this.currentQuery = query;
		const { normalizer } = this.services;
		const cleanQuery = normalizer.normalizeForSearch(query);
		const cleanInitial = this.initialQuery ? normalizer.normalizeForSearch(this.initialQuery) : "";
		const usePreFiltered =
			!!this.preFilteredMatches &&
			cleanQuery.length > 0 &&
			(cleanQuery.includes(cleanInitial) || cleanInitial.includes(cleanQuery));
		const pool = usePreFiltered && this.preFilteredMatches ? this.preFilteredMatches : undefined;

		const matches = this.services.useCases.search.execute(query, pool);
		if (this.dashboard) this.dashboard.update(matches, this.services.repository.getAllAyahs());
		return matches;
	}

	renderSuggestion(item: Ayah, el: HTMLElement): void {
		const textEl = el.createDiv({ cls: "quran-key-suggestion-text" });
		renderHighlightedText(textEl, item.text, this.currentQuery, (s) => this.services.normalizer.normalizeForSearch(s));
		el.createEl("small", {
			text: `${item.surahName} - \u0627\u0644\u0622\u064A\u0629 ${item.ayahId}`,
			cls: "quran-key-suggestion-meta",
		});
	}

	onChooseSuggestion(item: Ayah): void {
		const start = this.startPos ?? toPosition(this.editor.getCursor("from"));
		const end = this.endPos ?? toPosition(this.editor.getCursor("to"));
		if (this.onVerseSelectOverride) {
			void this.onVerseSelectOverride([item]);
			return;
		}
		this.services.useCases.extract.insertAyahs(this.services.wrapEditor(this.editor), start, end, [item], this.currentQuery);
	}
}