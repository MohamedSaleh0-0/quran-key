import { Decoration, MatchDecorator, ViewPlugin } from "@codemirror/view";
import type { DecorationSet, EditorView, ViewUpdate } from "@codemirror/view";
import type { PluginConfig } from "../../config/types";

const HIGHLIGHT_CLASS = "cm-quran-key-text";
const ORNATE_NUMBER_CLASS = "quran-key-ornate-number";
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

export function createOrnateNumberHighlightExtension(ringGlyph: string) {
	const pattern = new RegExp(`${escapeRegex(ringGlyph)}[${ARABIC_INDIC_DIGITS}]+`, "g");
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

export function createOrnateNumberPostProcessor(ringGlyph: string): (el: HTMLElement) => void {
	const pattern = new RegExp(`(${escapeRegex(ringGlyph)}[${ARABIC_INDIC_DIGITS}]+)`, "g");

	function walk(node: Node): void {
		if (node.nodeType === Node.TEXT_NODE) {
			const text = node.nodeValue || "";
			if (text.includes(ringGlyph)) {
				const frag = document.createDocumentFragment();
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
				const frag = document.createDocumentFragment();
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

	return walk;
}

export function applyStyleVariables(settings: PluginConfig): void {
	document.body.style.setProperty("--quran-key-font-family", settings.quranFontFamily);
	document.body.style.setProperty("--quran-key-font-size", `${settings.quranFontSize}em`);
	document.body.style.setProperty("--quran-key-line-height", String(settings.quranLineHeight));
	document.body.style.setProperty("--quran-key-line-height-loose", String(settings.quranLineHeight + 0.4));
	document.body.style.setProperty("--quran-key-color", settings.quranColor);
}

export function cleanupStyleVariables(): void {
	document.body.style.removeProperty("--quran-key-font-family");
	document.body.style.removeProperty("--quran-key-font-size");
	document.body.style.removeProperty("--quran-key-line-height");
	document.body.style.removeProperty("--quran-key-line-height-loose");
	document.body.style.removeProperty("--quran-key-color");
}