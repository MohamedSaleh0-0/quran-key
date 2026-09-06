import { Decoration, MatchDecorator, ViewPlugin } from "@codemirror/view";
import type { DecorationSet, EditorView, ViewUpdate } from "@codemirror/view";
import type { PluginConfig } from "../../config/types";
import { DEFAULT_SETTINGS } from "../../config/defaults";

const HIGHLIGHT_CLASS = "cm-quran-key-text";
const ORNATE_NUMBER_CLASS = "quran-key-ornate-number";
const ARABIC_INDIC_DIGITS = "\u0660-\u0669";
const CUSTOM_STYLE_TAG_ID = "quran-key-custom-styles";

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

	return walk;
}

export function applyStyleVariables(settings: PluginConfig): void {
	const fontFamily = settings.quranFontFamily?.trim() || DEFAULT_SETTINGS.quranFontFamily;
	const fontSize = settings.quranFontSize || DEFAULT_SETTINGS.quranFontSize;
	const lineHeight = settings.quranLineHeight || DEFAULT_SETTINGS.quranLineHeight;

	document.body.style.setProperty("--quran-key-font-family", fontFamily);
	document.body.style.setProperty("--quran-key-font-size", `${fontSize}em`);
	document.body.style.setProperty("--quran-key-line-height", String(lineHeight));
	document.body.style.setProperty("--quran-key-line-height-loose", String(lineHeight + 0.4));
	document.body.style.setProperty("--quran-key-color", settings.quranColor || DEFAULT_SETTINGS.quranColor);

	let customStyleEl = document.getElementById(CUSTOM_STYLE_TAG_ID) as HTMLStyleElement | null;
	if (!customStyleEl) {
		customStyleEl = document.createElement("style");
		customStyleEl.id = CUSTOM_STYLE_TAG_ID;
		document.head.appendChild(customStyleEl);
	}
	customStyleEl.textContent = settings.customCss || "";
}

export function cleanupStyleVariables(): void {
	document.body.style.removeProperty("--quran-key-font-family");
	document.body.style.removeProperty("--quran-key-font-size");
	document.body.style.removeProperty("--quran-key-line-height");
	document.body.style.removeProperty("--quran-key-line-height-loose");
	document.body.style.removeProperty("--quran-key-color");

	const customStyleEl = document.getElementById(CUSTOM_STYLE_TAG_ID);
	if (customStyleEl) {
		customStyleEl.remove();
	}
}