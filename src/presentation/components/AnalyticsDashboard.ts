import type { Ayah } from "../../domain/entities/Ayah";
import { AnalyticsCalculator } from "../../domain/services/AnalyticsCalculator";
import type { Locale } from "../../config/types";
import { t } from "../../config/strings";

/** Live match-statistics panel shown under the search modal's input when
 *  settings.showAnalytics is on (FR-20). Pure DOM + CSS classes from
 *  styles.css — v1 built this with `style.cssText` and `!important` five
 *  times over; this is the one place that pattern is fully replaced. */
export class AnalyticsDashboard {
	private readonly container: HTMLElement;
	private readonly totalEl: HTMLElement;
	private readonly mostQuotedEl: HTMLElement;
	private readonly densestEl: HTMLElement;
	private readonly locale: Locale;

	constructor(anchorEl: HTMLElement, locale: Locale) {
		this.locale = locale;
		this.container = document.createElement("div");
		this.container.className = "quran-key-analytics-dashboard";
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
		const wrap = document.createElement("div");
		wrap.className = "quran-key-analytics-stat";
		const label = document.createElement("span");
		label.className = "quran-key-analytics-label";
		label.textContent = t(this.locale, labelKey);
		const value = document.createElement("span");
		value.className = "quran-key-analytics-value";
		value.textContent = t(this.locale, "analytics.empty");
		wrap.append(label, value);
		return { wrap, value };
	}

	update(matches: readonly Ayah[], corpus: readonly Ayah[]): void {
		const result = AnalyticsCalculator.compute(matches, corpus);
		const empty = t(this.locale, "analytics.empty");
		this.totalEl.textContent = String(result.totalMatches);
		this.mostQuotedEl.textContent = result.mostQuoted
			? `${result.mostQuoted.surahName} (${result.mostQuoted.count}, ${result.mostQuoted.densityPercent.toFixed(3)}%)`
			: empty;
		this.densestEl.textContent = result.densest
			? `${result.densest.surahName} (${result.densest.densityPercent.toFixed(3)}%)`
			: empty;
	}

	destroy(): void {
		this.container.remove();
	}
}
