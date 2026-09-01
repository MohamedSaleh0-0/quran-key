import type { Plugin } from "obsidian";
import type { AppServices } from "../AppServices";
import { registerCommands as register } from "./CommandRegistry";
import { createOpenGlobalSearchCommand } from "./definitions/openGlobalSearch";
import { createOpenGlobalTafsirCommand } from "./definitions/openGlobalTafsir";
import { createExtractContextCommand } from "./definitions/extractContext";
import { createFetchContextualTafsirCommand } from "./definitions/fetchContextualTafsir";
import { createRemoveReferenceCommand } from "./definitions/removeReference";
import { createConvertToFootnoteCommand } from "./definitions/convertToFootnote";
import { createStripTashkeelCommand } from "./definitions/stripTashkeel";
import { createLinkReflectionCommand } from "./definitions/linkReflection";

/** The plugin's full command inventory. To add a new command: write a
 *  `create*Command(services)` factory next to these (see
 *  docs/ARCHITECTURE.md §8) and add it to this array — nothing else
 *  changes. */
export function registerAllCommands(plugin: Plugin, services: AppServices): void {
	register(plugin, [
		createOpenGlobalSearchCommand(services),
		createOpenGlobalTafsirCommand(services),
		createExtractContextCommand(services),
		createFetchContextualTafsirCommand(services),
		createRemoveReferenceCommand(services),
		createConvertToFootnoteCommand(services),
		createStripTashkeelCommand(services),
		createLinkReflectionCommand(services, "tadabbur"),
		createLinkReflectionCommand(services, "athar"),
	]);
}

