import { Notice } from "obsidian";
import type { NoticePort } from "../../domain/ports/NoticePort";

export class ObsidianNoticeAdapter implements NoticePort {
	show(message: string): void {
		new Notice(message);
	}
}
