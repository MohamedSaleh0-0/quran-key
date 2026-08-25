/** Abstraction over Obsidian's `Notice` so domain/application code can
 *  surface a message to the user without importing `obsidian`. */
export interface NoticePort {
	show(message: string): void;
}
