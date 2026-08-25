import type { Editor, MarkdownView, Plugin } from "obsidian";

/** One entry per command palette action. NFR-9: adding a feature is
 *  "write a new file exporting one of these, add it to the array in
 *  registerCommands.ts" — never a change to onload() itself. */
export interface CommandDefinition {
	id: string;
	name: string;
	run: (editor: Editor, view: MarkdownView) => void | Promise<void>;
}

export function registerCommands(plugin: Plugin, definitions: readonly CommandDefinition[]): void {
	for (const def of definitions) {
		plugin.addCommand({
			id: def.id,
			name: def.name,
			editorCallback: (editor, view) => {
				void def.run(editor, view as MarkdownView);
			},
		});
	}
}
