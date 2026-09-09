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
import { createOpenQuranDisplayLabCommand } from "./definitions/openQuranDisplayLab";

/** The plugin's full command inventory. To add a new command: write a
 *  `create*Command(services)` factory next to these (see
 *  docs/ARCHITECTURE.md §8) and add it to this array — nothing else
 *  changes.
 *
 *  Reflection categories are the one exception to "one line per command"
 *  above: every category in the catalog (builtin + custom, whatever
 *  exists at startup) gets its own command generated from the same
 *  factory, so a user can bind a hotkey directly to "Log selection as
 *  تدبرات الشيخ فلان" without that category needing a hardcoded line
 *  here. Categories created *after* startup (Settings, or the picker's
 *  "create new" flow) register their command immediately at creation
 *  time instead — see AppServices.registerReflectionCategoryCommand. */
export function registerAllCommands(plugin: Plugin, services: AppServices): void {
	register(plugin, [
		createOpenGlobalSearchCommand(services),
		createOpenGlobalTafsirCommand(services),
		createExtractContextCommand(services),
		createFetchContextualTafsirCommand(services),
		createRemoveReferenceCommand(services),
		createConvertToFootnoteCommand(services),
		createStripTashkeelCommand(services),
		...services.reflectionCatalog.all().map((cat) => createLinkReflectionCommand(services, cat.id)),
		createLinkReflectionPickerCommand(services),
		createLinkAyatCommand(services),
		createOpenSurahNoteCommand(services),
		createLogAyahEntryCommand(services),
		createOpenQuranDisplayLabCommand(services),
	]);
}
