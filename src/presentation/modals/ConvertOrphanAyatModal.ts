import { Modal, Notice } from "obsidian";
import type { App, Editor } from "obsidian";
import type { AppServices } from "../AppServices";
import type { OrphanAyatConversionResult, OrphanAyatDecisions } from "../../application/use-cases/ConvertOrphanAyat";
import type { Ayah } from "../../domain/entities/Ayah";
import type { OrphanAyahCandidate, OrphanAyahScanResult } from "../../domain/services/OrphanAyahScanner";

export class ConvertOrphanAyatModal extends Modal {
	private readonly editorPort;
	private scan!: OrphanAyahScanResult;
	private result: OrphanAyatConversionResult | null = null;
	private readonly rejected = new Set<string>();
	private readonly selectedAyahs = new Map<string, Ayah>();

	constructor(
		app: App,
		private readonly services: AppServices,
		private readonly editor: Editor
	) {
		super(app);
		this.editorPort = services.wrapEditor(editor);
	}

	private get isArabic(): boolean {
		return this.services.settings.interfaceLanguage === "ar";
	}

	onOpen(): void {
		this.scan = this.services.useCases.convertOrphanAyat.scan(
			this.editorPort.getValue(),
			this.services.buildOrphanAyatOptions()
		);
		this.renderScan();
	}

	private renderScan(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass("quran-key-picker-modal", "quran-key-orphan-modal");
		contentEl.createEl("h2", { text: this.isArabic ? "تحويل آيات الملاحظة" : "Convert ayahs in note" });

		const convertible = this.scan.candidates.filter((candidate) => candidate.status === "orphan" && this.selectedAyah(candidate));
		const excluded = this.scan.candidates.filter((candidate) => candidate.status === "orphan" && this.rejected.has(candidate.id));
		const linked = this.scan.candidates.filter((candidate) => candidate.status === "linked");
		const skipped = this.scan.candidates.filter((candidate) => candidate.status === "unresolved" || candidate.status === "ambiguous");
		contentEl.createDiv({
			text: this.isArabic
				? `سيتم ربط ${convertible.length} آية. المستبعدة: ${excluded.length}، المرتبطة مسبقًا: ${linked.length}، غير القابلة للتحديد: ${skipped.length}.`
				: `${convertible.length} ayah(s) will be linked. Excluded: ${excluded.length}; already linked: ${linked.length}; unresolved: ${skipped.length}.`,
			cls: "quran-key-orphan-summary",
		});

		const list = contentEl.createDiv({ cls: "quran-key-picker-list quran-key-orphan-list" });
		for (const candidate of this.scan.candidates) this.renderCandidate(list, candidate);
		if (this.scan.candidates.length === 0) {
			list.createDiv({ text: this.isArabic ? "لم تُعثر على آيات مزخرفة قابلة للتحويل." : "No ornate ayahs were found.", cls: "quran-key-picker-hint" });
		}

		const footer = contentEl.createDiv({ cls: "quran-key-picker-footer" });
		const cancel = footer.createEl("button", { text: this.isArabic ? "إلغاء" : "Cancel" });
		cancel.addEventListener("click", () => this.close());
		const execute = footer.createEl("button", { text: this.isArabic ? "تنفيذ التحويل" : "Convert", cls: "mod-cta" });
		execute.disabled = convertible.length === 0;
		execute.addEventListener("click", () => void this.executeConversion());
	}

	private renderCandidate(host: HTMLElement, candidate: OrphanAyahCandidate, readOnly = false): void {
		const item = host.createDiv({ cls: "quran-key-orphan-item" });
		const selectedAyah = this.selectedAyah(candidate);
		const selectableAyah = this.selectedAyahs.get(candidate.id) ?? candidate.ayah;
		const label = selectedAyah
			? `${selectedAyah.surahName} — ${this.isArabic ? "آية" : "Ayah"} ${selectedAyah.ayahId}`
			: this.rejected.has(candidate.id)
			? this.isArabic ? "مستبعدة من التحويل" : "Excluded from conversion"
			: candidate.status === "linked"
			? this.isArabic ? "مرتبطة مسبقًا" : "Already linked"
			: this.isArabic ? "لم يمكن تحديد الآية" : "Could not resolve ayah";
		item.createSpan({ text: label, cls: "quran-key-orphan-item-label" });
		item.createSpan({ text: candidate.marker, cls: "quran-key-orphan-marker" });
		if (!readOnly && candidate.status === "orphan") {
			const actions = item.createDiv({ cls: "quran-key-orphan-actions" });
			if (candidate.alternatives.length > 1 && selectableAyah) {
				const select = actions.createEl("select", { cls: "quran-key-orphan-alternatives" });
				for (const alternative of candidate.alternatives) {
					const option = select.createEl("option", {
						value: String(alternative.id),
						text: `${alternative.surahName} — ${this.isArabic ? "آية" : "Ayah"} ${alternative.ayahId}`,
					});
					option.selected = alternative.id === selectableAyah.id;
				}
				select.addEventListener("change", () => {
					const alternative = candidate.alternatives.find((item) => String(item.id) === select.value);
					if (alternative) this.selectedAyahs.set(candidate.id, alternative);
					this.renderScan();
				});
			}
			const reject = actions.createEl("button", {
				text: this.rejected.has(candidate.id) ? (this.isArabic ? "إرجاع" : "Include") : (this.isArabic ? "استبعاد" : "Reject"),
			});
			reject.addEventListener("click", () => {
				if (this.rejected.has(candidate.id)) this.rejected.delete(candidate.id);
				else this.rejected.add(candidate.id);
				this.renderScan();
			});
		}
		if (candidate.status === "unresolved" || candidate.status === "ambiguous") {
			item.createDiv({ text: candidate.content, cls: "quran-key-orphan-content" });
		}
		if (candidate.reason) item.createDiv({ text: candidate.reason, cls: "quran-key-picker-hint" });
		item.toggleClass("is-linked", candidate.status === "linked");
		item.toggleClass("is-skipped", candidate.status === "unresolved" || candidate.status === "ambiguous");
		item.toggleClass("is-rejected", this.rejected.has(candidate.id));
	}

	private async executeConversion(): Promise<void> {
		try {
			this.result = await this.services.useCases.convertOrphanAyat.execute(
				this.editorPort,
				this.scan,
				this.services.buildOrphanAyatOptions(),
				this.buildDecisions()
			);
			this.renderResult();
		} catch (error) {
			const message = error instanceof Error && error.message === "note-changed"
				? this.isArabic ? "تغيرت الملاحظة قبل التنفيذ؛ أعد فتح الأمر." : "The note changed before conversion; reopen the command."
				: this.isArabic ? "تعذر تحويل الآيات." : "The ayahs could not be converted.";
			new Notice(message);
		}
	}

	private renderResult(): void {
		if (!this.result) return;
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: this.isArabic ? "تم تحويل الآيات" : "Ayahs converted" });
		contentEl.createDiv({
			text: this.isArabic
				? `تم ربط ${this.result.converted.length} آية. يمكنك التراجع ما دمت لم تعدّل الملاحظة أو الملفات التي أُنشئت.`
				: `${this.result.converted.length} ayah(s) linked. You can roll back while the note and created files remain unchanged.`,
			cls: "quran-key-orphan-summary",
		});
		const list = contentEl.createDiv({ cls: "quran-key-picker-list quran-key-orphan-list" });
		for (const candidate of this.result.converted) this.renderCandidate(list, candidate, true);
		const footer = contentEl.createDiv({ cls: "quran-key-picker-footer" });
		const close = footer.createEl("button", { text: this.isArabic ? "إغلاق" : "Close" });
		close.addEventListener("click", () => this.close());
		const rollback = footer.createEl("button", { text: this.isArabic ? "التراجع وحذف الملفات الجديدة" : "Roll back and delete created files" });
		rollback.addEventListener("click", () => void this.rollback(rollback));
	}

	private selectedAyah(candidate: OrphanAyahCandidate): Ayah | null {
		if (this.rejected.has(candidate.id)) return null;
		return this.selectedAyahs.get(candidate.id) ?? candidate.ayah;
	}

	private buildDecisions(): OrphanAyatDecisions {
		const decisions = new Map<string, Ayah | null>();
		for (const candidate of this.scan.candidates) {
			if (candidate.status !== "orphan") continue;
			if (this.rejected.has(candidate.id)) decisions.set(candidate.id, null);
			else if (this.selectedAyahs.has(candidate.id)) decisions.set(candidate.id, this.selectedAyahs.get(candidate.id)!);
		}
		return decisions;
	}

	private async rollback(button: HTMLButtonElement): Promise<void> {
		if (!this.result) return;
		button.disabled = true;
		const rollback = await this.services.useCases.convertOrphanAyat.rollback(this.editorPort, this.result);
		if (!rollback.restored) {
			new Notice(this.isArabic ? "لم يتم التراجع لأن الملاحظة تغيّرت." : "Rollback skipped because the note changed.");
			button.disabled = false;
			return;
		}
		new Notice(this.isArabic ? `تم التراجع. حُذف ${rollback.deletedFiles.length} ملفًا أُنشئ للعملية.` : `Rolled back. Deleted ${rollback.deletedFiles.length} file(s) created by the operation.`);
		button.remove();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
