import { Decoration, MatchDecorator, ViewPlugin } from "@codemirror/view";
import type { DecorationSet, EditorView, ViewUpdate } from "@codemirror/view";
import { createEl } from "obsidian";
import type { PluginConfig } from "../../config/types";
import { DEFAULT_SETTINGS } from "../../config/defaults";

const HIGHLIGHT_CLASS = "cm-quran-key-text";
const MARKDOWN_BLOCK_CLASS = "quran-key-text-block";
const ORNATE_NUMBER_CLASS = "quran-key-ornate-number";
const AYAH_NOTE_LINK_CLASS = "quran-key-ayah-note-link";
const LAZY_AYAH_CLASS = "quran-key-lazy-ayah";
const ARABIC_INDIC_DIGITS = "\u0660-\u0669";

function escapeRegex(literal: string): string {
	return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function createQuranHighlightExtension(wrapperStart: string, wrapperEnd: string) {
	const pattern = new RegExp(`${escapeRegex(wrapperStart)}.*?${escapeRegex(wrapperEnd)}`, "g");
	const decorator = new MatchDecorator({
		regexp: pattern,
		decoration: Decoration.mark({ class: HIGHLIGHT_CLASS }),
	});

	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;
			constructor(view: EditorView) {
				this.decorations = decorator.createDeco(view);
			}
			update(update: ViewUpdate) {
				this.decorations = decorator.updateDeco(update, this.decorations);
			}
		},
		{ decorations: (v) => v.decorations }
	);
}

export function createOrnateNumberHighlightExtension() {
	const pattern = new RegExp(`[${ARABIC_INDIC_DIGITS}]+`, "g");
	const decorator = new MatchDecorator({
		regexp: pattern,
		decoration: Decoration.mark({ class: ORNATE_NUMBER_CLASS }),
	});

	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;
			constructor(view: EditorView) {
				this.decorations = decorator.createDeco(view);
			}
			update(update: ViewUpdate) {
				this.decorations = decorator.updateDeco(update, this.decorations);
			}
		},
		{ decorations: (v) => v.decorations }
	);
}

export function createOrnateNumberPostProcessor(): (el: HTMLElement) => void {
	const pattern = new RegExp(`[${ARABIC_INDIC_DIGITS}]+`, "g");

	function walk(node: Node): void {
		if (node.nodeType === Node.TEXT_NODE) {
			const text = node.nodeValue || "";
			pattern.lastIndex = 0;
			if (pattern.test(text)) {
				pattern.lastIndex = 0;
				const frag = createFragment();
				let lastIndex = 0;
				let m: RegExpExecArray | null;
				while ((m = pattern.exec(text)) !== null) {
					if (m.index > lastIndex) {
						frag.appendText(text.slice(lastIndex, m.index));
					}
					frag.createSpan({ cls: ORNATE_NUMBER_CLASS, text: m[0] });
					lastIndex = m.index + m[0].length;
				}
				if (lastIndex < text.length) {
					frag.appendText(text.slice(lastIndex));
				}
				node.parentNode?.replaceChild(frag, node);
			}
		} else {
			const children = Array.from(node.childNodes);
			for (const child of children) walk(child);
		}
	}

	return walk;
}

export function createMarkdownPostProcessor(wrapperStart: string, wrapperEnd: string): (el: HTMLElement) => void {
	const pattern = new RegExp(`${escapeRegex(wrapperStart)}(.*?)${escapeRegex(wrapperEnd)}`, "g");

	function walk(node: Node): void {
		if (node.nodeType === Node.TEXT_NODE) {
			const text = node.nodeValue || "";
			if (text.includes(wrapperStart) && text.includes(wrapperEnd)) {
				const frag = createFragment();
				let lastIndex = 0;
				let m: RegExpExecArray | null;
				while ((m = pattern.exec(text)) !== null) {
					if (m.index > lastIndex) {
						frag.appendText(text.slice(lastIndex, m.index));
					}
					frag.createSpan({ cls: HIGHLIGHT_CLASS, text: `${wrapperStart}${m[1]}${wrapperEnd}` });
					lastIndex = m.index + m[0].length;
				}
				if (lastIndex < text.length) {
					frag.appendText(text.slice(lastIndex));
				}
				node.parentNode?.replaceChild(frag, node);
			}
		} else {
			const children = Array.from(node.childNodes);
			for (const child of children) walk(child);
		}
	}

	return (el: HTMLElement) => {
		walk(el);
		// A wikilink around the ayah marker splits the Quran text into several
		// DOM nodes, so the text-node walker above cannot see both wrapper
		// glyphs. Mark the containing block as a fallback styling boundary.
		for (const block of Array.from(el.querySelectorAll("p, li, blockquote"))) {
			const text = block.textContent ?? "";
			if (text.includes(wrapperStart) && text.includes(wrapperEnd)) block.classList.add(MARKDOWN_BLOCK_CLASS);
		}
		for (const link of Array.from(el.querySelectorAll("a.internal-link"))) {
			const label = link.textContent?.trim() ?? "";
			if (/^[()۝\u0660-\u0669\u06F0-\u06F9]+$/.test(label)) link.classList.add(AYAH_NOTE_LINK_CLASS);
		}
	};
}

export function createLazyAyahMarkerPostProcessor(
	openAyahNote: (surahId: number, ayahId: number) => Promise<void>,
	surahId: number
): (el: HTMLElement) => void {
	return (el) => {
		if (!Number.isInteger(surahId)) return;
		const quranBlocks = Array.from(el.querySelectorAll<HTMLElement>(`.${HIGHLIGHT_CLASS}`));
		const markerPattern = /[٠-٩]+/g;
		for (const block of quranBlocks) {
			decorateLazyMarkers(block, surahId, markerPattern, openAyahNote);
		}
	};
}

function decorateLazyMarkers(
	root: HTMLElement,
	 surahId: number,
	pattern: RegExp,
	openAyahNote: (surahId: number, ayahId: number) => Promise<void>
): void {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const textNodes: Text[] = [];
	let current: Node | null;
	while ((current = walker.nextNode())) {
		if (current.parentElement?.closest(`.${LAZY_AYAH_CLASS}, a.internal-link`)) continue;
		textNodes.push(current as Text);
	}

	for (const textNode of textNodes) {
		const text = textNode.nodeValue ?? "";
		pattern.lastIndex = 0;
		if (!pattern.test(text)) continue;
		pattern.lastIndex = 0;
		const fragment = document.createDocumentFragment();
		let lastIndex = 0;
		let match: RegExpExecArray | null;
		while ((match = pattern.exec(text)) !== null) {
			if (match.index > lastIndex) fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
			const marker = createEl("span", { cls: LAZY_AYAH_CLASS });
			marker.dataset.quranKeySurah = String(surahId);
			marker.dataset.quranKeyAyah = String(arabicIndicToNumber(match[0]));
			marker.textContent = match[0];
			marker.setAttribute("role", "button");
			marker.setAttribute("tabindex", "0");
			marker.setAttribute("aria-label", `Open ayah note ${surahId}:${marker.dataset.quranKeyAyah}`);
			const open = () => void openAyahNote(surahId, Number(marker.dataset.quranKeyAyah)).catch(() => undefined);
			marker.addEventListener("click", open);
			marker.addEventListener("keydown", (event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					open();
				}
			});
			fragment.appendChild(marker);
			lastIndex = match.index + match[0].length;
		}
		if (lastIndex < text.length) fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
		textNode.parentNode?.replaceChild(fragment, textNode);
	}
}

function arabicIndicToNumber(value: string): number {
	return Number(value.replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))));
}

export function applyStyleVariables(settings: PluginConfig): void {
	const fontFamily = "'QPC Hafs v18', serif";
	const fontSize = settings.quranFontSize || DEFAULT_SETTINGS.quranFontSize;
	const lineHeight = settings.quranLineHeight || DEFAULT_SETTINGS.quranLineHeight;

	document.body.style.setProperty("--quran-key-font-family", fontFamily);
	document.body.style.setProperty("--quran-key-font-size", `${fontSize}em`);
	document.body.style.setProperty("--quran-key-line-height", String(lineHeight));
	document.body.style.setProperty("--quran-key-line-height-loose", String(lineHeight + 0.4));
	document.body.style.setProperty("--quran-key-color", settings.quranColor || DEFAULT_SETTINGS.quranColor);
}

export function cleanupStyleVariables(): void {
	document.body.style.removeProperty("--quran-key-font-family");
	document.body.style.removeProperty("--quran-key-font-size");
	document.body.style.removeProperty("--quran-key-line-height");
	document.body.style.removeProperty("--quran-key-line-height-loose");
	document.body.style.removeProperty("--quran-key-color");
}
