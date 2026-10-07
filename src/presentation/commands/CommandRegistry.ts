import type { Editor, MarkdownView, Plugin } from "obsidian";

/** One entry per command palette action. NFR-9: adding a feature is
 *  "write a new file exporting one of these, add it to the array in
 *  registerCommands.ts" — never a change to onload() itself. */
export interface CommandDefinition {
	id: string;
	name: string;
	/** Set for commands such as settings or comparison tools that should be
	 * available even when no Markdown editor has focus. */
	requiresEditor?: boolean;
	run: (editor: Editor, view: MarkdownView) => void | Promise<void>;
}

export function registerCommands(plugin: Plugin, definitions: readonly CommandDefinition[]): void {
	for (const def of definitions) {
		if (def.requiresEditor === false) {
			plugin.addCommand({
				id: def.id,
				name: def.name,
				callback: () => {
					void def.run(undefined as never, undefined as never);
				},
			});
		} else {
			plugin.addCommand({
				id: def.id,
				name: def.name,
				editorCallback: (editor, view) => {
					void def.run(editor, view as MarkdownView);
				},
			});
		}
	}
}
