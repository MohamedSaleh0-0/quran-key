import type { Ayah } from "../../domain/entities/Ayah";
import { AnalyticsCalculator } from "../../domain/services/AnalyticsCalculator";
import type { Locale } from "../../config/types";
import { t } from "../../config/strings";

export class AnalyticsDashboard {
	private readonly container: HTMLElement;
	private readonly totalEl: HTMLElement;
	private readonly mostQuotedEl: HTMLElement;
	private readonly densestEl: HTMLElement;
	private readonly locale: Locale;

	constructor(anchorEl: HTMLElement, locale: Locale) {
		this.locale = locale;
		this.container = createDiv({ cls: "quran-key-analytics-dashboard" });
		if (locale === "ar") this.container.setAttribute("dir", "rtl");

		const total = this.makeStat("analytics.total");
		const mostQuoted = this.makeStat("analytics.mostQuoted");
		const densest = this.makeStat("analytics.densest");
		this.container.append(total.wrap, mostQuoted.wrap, densest.wrap);
		this.totalEl = total.value;
		this.mostQuotedEl = mostQuoted.value;
		this.densestEl = densest.value;

		anchorEl.insertAdjacentElement("afterend", this.container);
	}

	private makeStat(labelKey: string): { wrap: HTMLElement; value: HTMLElement } {
		const wrap = createDiv({ cls: "quran-key-analytics-stat" });
		wrap.createSpan({ cls: "quran-key-analytics-label", text: t(this.locale, labelKey) });
		const value = wrap.createSpan({ cls: "quran-key-analytics-value", text: t(this.locale, "analytics.empty") });
		return { wrap, value };
	}

	update(matches: readonly Ayah[], corpus: readonly Ayah[]): void {
		const result = AnalyticsCalculator.compute(matches, corpus);
		const empty = t(this.locale, "analytics.empty");
		this.totalEl.setText(String(result.totalMatches));
		this.mostQuotedEl.setText(
			result.mostQuoted
				? `${result.mostQuoted.surahName} (${result.mostQuoted.count}, ${result.mostQuoted.densityPercent.toFixed(3)}%)`
				: empty
		);
		this.densestEl.setText(
			result.densest
				? `${result.densest.surahName} (${result.densest.densityPercent.toFixed(3)}%)`
				: empty
		);
	}

	destroy(): void {
		this.container.remove();
	}
}