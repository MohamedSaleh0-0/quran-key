import { SuggestModal } from "obsidian";
import type { Editor, EditorPosition as ObsidianEditorPosition } from "obsidian";
import type { Ayah } from "../../domain/entities/Ayah";
import type { EditorPosition } from "../../domain/ports/EditorPort";
import type { AppServices } from "../AppServices";
import { AnalyticsDashboard } from "../components/AnalyticsDashboard";
import { renderHighlightedForms, renderHighlightedText } from "./highlightMatch";
import { TafsirBookPickerModal } from "./TafsirBookPickerModal";
import { RangeEndSuggestModal } from "./RangeEndSuggestModal";
import type { VerseSelectHandler } from "./types";
import { t } from "../../config/strings";

function toPosition(pos: ObsidianEditorPosition): EditorPosition {
	return { line: pos.line, ch: pos.ch };
}

export class QuranSearchModal extends SuggestModal<Ayah> {
	private currentQuery = "";
	private rootSearchEnabled = false;
	private dashboard: AnalyticsDashboard | null = null;
	private paginationEl: HTMLElement | null = null;
	private paginationStatusEl: HTMLElement | null = null;
	private expandButtonEl: HTMLButtonElement | null = null;
	private searchKey = "";
	private visibleResultCount = 0;

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
		// The modal itself still receives only the currently visible page. Keep
		// SuggestModal from imposing a second, smaller cap when more pages are
		// expanded.
		this.limit = Number.POSITIVE_INFINITY;
		this.setPlaceholder(t(services.settings.interfaceLanguage, "search.placeholder"));
	}

	onOpen(): void {
		void super.onOpen();
		const { settings } = this.services;
		this.createPaginationControls();
		// SuggestModal refreshes its content area while suggestions change. Keep
		// the guide outside that replaceable area and append it to the modal root
		// so it remains visible at the very bottom.
		const hint = this.modalEl.createDiv({ cls: "quran-key-search-hint quran-key-search-hint-footer" });
		hint.setAttribute("dir", this.services.settings.interfaceLanguage === "ar" ? "rtl" : "ltr");
		for (const [key, shortcut] of [
			["search.hint.enter", "Enter"],
			["search.hint.range", "Ctrl/Cmd + Enter"],
			["search.hint.tafsir", "Shift + Enter"],
			["search.hint.root", "Alt + Enter"],
		] as const) {
			const item = hint.createSpan({ cls: "quran-key-search-hint-item" });
			item.createEl("kbd", { text: shortcut });
			item.createSpan({ text: t(settings.interfaceLanguage, key).replace(`${shortcut}: `, " ") });
		}

		if (settings.showAnalytics) {
			const inputContainer = this.inputEl.parentElement;
			if (inputContainer) this.dashboard = new AnalyticsDashboard(inputContainer, settings.interfaceLanguage);
		}

		this.inputEl.addEventListener(
			"keydown",
			(evt) => {
				if (evt.key !== "Enter") return;
				if (evt.altKey) {
					evt.preventDefault();
					evt.stopPropagation();
					this.rootSearchEnabled = !this.rootSearchEnabled;
					this.updateRootSearchState();
					this.inputEl.dispatchEvent(new Event("input", { bubbles: true }));
					return;
				}
				const isCtrlOrMeta = evt.ctrlKey || evt.metaKey;
				const isShift = evt.shiftKey;
				if (!isCtrlOrMeta && !isShift) return;
				evt.preventDefault();
				evt.stopPropagation();
				this.handleModifiedEnter(isCtrlOrMeta);
			},
			true
		);
		this.updateRootSearchState();

		if (this.initialQuery) {
			this.inputEl.value = this.initialQuery;
			this.currentQuery = this.initialQuery;
			window.setTimeout(() => this.inputEl.dispatchEvent(new Event("input")), 50);
		}
	}

	private updateRootSearchState(): void {
		this.inputEl.classList.toggle("quran-key-root-search-active", this.rootSearchEnabled);
		this.inputEl.setAttribute("data-quran-search-mode", this.rootSearchEnabled ? "root" : "literal");
		this.setPlaceholder(
			t(
				this.services.settings.interfaceLanguage,
				this.rootSearchEnabled ? "search.placeholder.root" : "search.placeholder"
			)
		);
	}

	onClose(): void {
		this.dashboard?.destroy();
		this.paginationEl?.remove();
		this.paginationEl = null;
		this.paginationStatusEl = null;
		this.expandButtonEl = null;
		this.searchKey = "";
		this.visibleResultCount = 0;
	}

	private get pageSize(): number {
		return Math.max(1, this.services.settings.maxSuggestionResults || 30);
	}

	private createPaginationControls(): void {
		const locale = this.services.settings.interfaceLanguage;
		this.paginationEl = this.modalEl.createDiv({ cls: "quran-key-search-pagination" });
		this.paginationEl.setAttribute("dir", locale === "ar" ? "rtl" : "ltr");
		this.paginationStatusEl = this.paginationEl.createSpan({ cls: "quran-key-search-pagination-status" });
		this.expandButtonEl = this.paginationEl.createEl("button", {
			cls: "quran-key-search-pagination-button",
			type: "button",
		});
		this.expandButtonEl.addEventListener("click", () => {
			if (!this.expandButtonEl || this.visibleResultCount <= 0) return;
			this.visibleResultCount += this.pageSize;
			this.inputEl.dispatchEvent(new Event("input", { bubbles: true }));
			this.inputEl.focus();
		});
	}

	private updatePaginationControls(totalMatches: number, visibleMatches: number): void {
		if (!this.paginationEl || !this.paginationStatusEl || !this.expandButtonEl) return;
		const hasMore = totalMatches > visibleMatches;
		this.paginationEl.classList.toggle("is-hidden", !hasMore);
		if (!hasMore) return;

		this.paginationStatusEl.setText(
			t(this.services.settings.interfaceLanguage, "search.paginationStatus", {
				shown: visibleMatches,
				total: totalMatches,
			})
		);
		this.expandButtonEl.setText(
			t(this.services.settings.interfaceLanguage, "search.expand", {
				count: Math.min(this.pageSize, totalMatches - visibleMatches),
			})
		);
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
		const nextSearchKey = `${this.rootSearchEnabled ? "root" : "literal"}\u0000${query}`;
		if (nextSearchKey !== this.searchKey) {
			this.searchKey = nextSearchKey;
			this.visibleResultCount = this.pageSize;
		}
		const { normalizer } = this.services;
		const cleanQuery = normalizer.normalizeForSearch(query);
		const cleanInitial = this.initialQuery ? normalizer.normalizeForSearch(this.initialQuery) : "";
		const usePreFiltered =
			!this.rootSearchEnabled &&
			Boolean(this.preFilteredMatches) &&
			cleanQuery.length > 0 &&
			(cleanQuery.includes(cleanInitial) || cleanInitial.includes(cleanQuery));
		const pool = usePreFiltered && this.preFilteredMatches ? this.preFilteredMatches : undefined;

		const result = !this.rootSearchEnabled && usePreFiltered && cleanQuery === cleanInitial && this.preFilteredMatches
			? {
					allMatches: [...this.preFilteredMatches],
					totalMatches: this.preFilteredMatches.length,
			  }
			: this.services.useCases.search.executeWithCount(query, pool, this.rootSearchEnabled ? "root" : undefined);
		if (this.dashboard) this.dashboard.update(result.allMatches, this.services.repository.getAllAyahs());

		this.visibleResultCount = Math.max(this.pageSize, this.visibleResultCount);
		const visibleMatches = result.allMatches.slice(0, this.visibleResultCount);
		this.updatePaginationControls(result.totalMatches, visibleMatches.length);
		return visibleMatches;
	}

	renderSuggestion(item: Ayah, el: HTMLElement): void {
		const textEl = el.createDiv({ cls: "quran-key-suggestion-text" });
		if (this.rootSearchEnabled) {
			const matchingForms = this.services.useCases.search.getRootMatchingForms(item, this.currentQuery);
			renderHighlightedForms(textEl, item.text, matchingForms, (s) => this.services.normalizer.normalizeForSearch(s));
		} else {
			renderHighlightedText(textEl, item.text, this.currentQuery, (s) => this.services.normalizer.normalizeForSearch(s));
		}
		el.createEl("small", {
			text: `${item.surahName} - \u0627\u0644\u0622\u064A\u0629 ${item.ayahId}`,
			cls: "quran-key-suggestion-meta",
		});
	}

	onChooseSuggestion(item: Ayah): void {
		const start = this.startPos ?? toPosition(this.editor.getCursor("from"));
		const end = this.endPos ?? toPosition(this.editor.getCursor("to"));
		if (this.onVerseSelectOverride) {
			this.close();
			void this.onVerseSelectOverride([item]);
			return;
		}
		void this.services.useCases.extract.insertAyahs(this.services.wrapEditor(this.editor), start, end, [item], this.currentQuery);
	}
}
