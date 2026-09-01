import { Decoration, MatchDecorator, ViewPlugin } from "@codemirror/view";
import type { DecorationSet, EditorView, ViewUpdate } from "@codemirror/view";
import type { PluginConfig } from "../../config/types";

const HIGHLIGHT_CLASS = "cm-quran-key-text";
const ORNATE_NUMBER_CLASS = "quran-key-ornate-number";
const ARABIC_INDIC_DIGITS = "\u0660-\u0669";

function escapeRegex(literal: string): string {
	return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Live Preview highlighting for any span wrapped in the configured
 * wrapper glyphs. v1 hardcoded the pattern `﴿[^﴾]*﴾` directly; here it's
 * rebuilt from settings.wrapperStart/wrapperEnd (non-greedy `.*?` instead
 * of a negated character class so multi-character wrapper strings work
 * too, not just single glyphs). main.ts re-registers this extension when
 * the wrapper glyphs change, since a CodeMirror extension's regex isn't
 * mutable in place once constructed.
 */
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

/**
 * Live Preview highlighting for ornate ayah-number markers ("۝١٢") as
 * their own styleable span, independent of the surrounding
 * cm-quran-key-text mark — CodeMirror layers overlapping mark decorations
 * fine, so this nests naturally inside the wrapper highlight. Gated
 * behind settings.styleOrnateNumbers in main.ts's refreshHighlightExtension
 * (separate from useOrnateNumbers, which controls the character
 * substitution itself, not whether it's additionally styled).
 */
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

/** Reading-view equivalent of createOrnateNumberHighlightExtension. Run
 *  after createMarkdownPostProcessor so the ornate-number span nests
 *  inside the wrapper's highlight span rather than replacing it. */
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
						frag.appendChild(document.createTextNode(text.slice(lastIndex, m.index)));
					}
					const span = document.createElement("span");
					span.className = ORNATE_NUMBER_CLASS;
					span.textContent = m[0];
					frag.appendChild(span);
					lastIndex = m.index + m[0].length;
				}
				if (lastIndex < text.length) {
					frag.appendChild(document.createTextNode(text.slice(lastIndex)));
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

/** Reading-view equivalent: walks rendered text nodes and wraps any
 *  wrapperStart...wrapperEnd span in the same highlight class, so styling
 *  is identical in both modes. */
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
						frag.appendChild(document.createTextNode(text.slice(lastIndex, m.index)));
					}
					const span = document.createElement("span");
					span.className = HIGHLIGHT_CLASS;
					span.textContent = `${wrapperStart}${m[1]}${wrapperEnd}`;
					frag.appendChild(span);
					lastIndex = m.index + m[0].length;
				}
				if (lastIndex < text.length) {
					frag.appendChild(document.createTextNode(text.slice(lastIndex)));
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

/** Writes the Qur'anic-text style settings as CSS custom properties,
 *  consumed by the plain classes in styles.css. Replaces v1's five
 *  separate `style.cssText = "...!important..."` call sites with one
 *  function and zero `!important` (NFR-10) — themes and CSS snippets can
 *  still override any of this.
 *
 *  settings.customCss (raw, user-authored) is appended verbatim after the
 *  generated variables so it can target .cm-quran-key-text,
 *  .quran-key-ornate-number, or anything else in styles.css without
 *  editing the plugin's bundled stylesheet. */
export function applyStyleVariables(styleEl: HTMLStyleElement, settings: PluginConfig): void {
	const vars = `
:root {
	--quran-key-font-family: ${settings.quranFontFamily};
	--quran-key-font-size: ${settings.quranFontSize}em;
	--quran-key-line-height: ${settings.quranLineHeight};
	--quran-key-line-height-loose: ${settings.quranLineHeight + 0.4};
	--quran-key-color: ${settings.quranColor};
}
`.trim();
	styleEl.textContent = settings.customCss?.trim() ? `${vars}\n\n${settings.customCss}` : vars;
}