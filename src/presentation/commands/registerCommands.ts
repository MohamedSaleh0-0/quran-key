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
import { createLinkReflectionPickerCommand } from "./definitions/linkReflectionCategoryPicker";
import { createLinkAyatCommand } from "./definitions/linkAyat";
import { createOpenSurahNoteCommand } from "./definitions/openSurahNote";
import { createLogAyahEntryCommand } from "./definitions/logAyahEntry";

/** The plugin's full command inventory. To add a new command: write a
 *  `create*Command(services)` factory next to these (see
 *  docs/ARCHITECTURE.md §8) and add it to this array — nothing else
 *  changes.
 *
 *  Reflection category commands are generated from the same factory, but
 *  only for categories whose `dedicatedCommand` setting is enabled. All
 *  categories — including newly created permanent categories — remain
 *  available in the general "choose category" command. The settings toggle
 *  registers or unregisters the optional dedicated command at runtime.
 */
export function registerAllCommands(plugin: Plugin, services: AppServices): void {
	register(plugin, [
		createOpenGlobalSearchCommand(services),
		createOpenGlobalTafsirCommand(services),
		createExtractContextCommand(services),
		createFetchContextualTafsirCommand(services),
		createRemoveReferenceCommand(services),
		createConvertToFootnoteCommand(services),
		createStripTashkeelCommand(services),
		...services.reflectionCatalog.all().filter((cat) => cat.dedicatedCommand === true).map((cat) => createLinkReflectionCommand(services, cat.id)),
		createLinkReflectionPickerCommand(services),
		createLinkAyatCommand(services),
		createOpenSurahNoteCommand(services),
		createLogAyahEntryCommand(services),
	]);
}
