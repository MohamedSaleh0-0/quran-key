\# Obsidian Plugin Publishing Checklist (2026)



Obsidian relaunched its plugin submission system in May 2026. Submissions now go through \*\*Obsidian Community\*\* (community.obsidian.md), not a GitHub pull request against `community-plugins.json`. There are two layers of review:



1\. \*\*Automated review\*\* — runs on every version you release (not just the first one), checks security, code quality, and known vulnerabilities, and usually returns a result within a few minutes.

2\. \*\*Manual review\*\* — Obsidian staff still hand-review submissions, especially popular/featured plugins or anything flagged by the community. This is slower and not guaranteed on a timeline.



If your plugin fails automated review after being listed, it gets pulled from search within 24 hours until you fix it — so treat this as a permanent gate, not a one-time hurdle.



Use this checklist in order: Section 1 items are absolute blockers, Sections 2–5 are what the bot and human reviewers actually check line by line, and Section 6+ covers submission mechanics and post-launch growth.



\---



\## 1. Hard blockers — fix these or you cannot pass, ever



These come from Obsidian's Developer Policies. Violating them isn't a "warning," it's a rejection (or later removal):



\- \[ ] \*\*No obfuscated code.\*\* Ship readable source — minified is fine, deliberately obfuscated/hidden-purpose code is not.

\- \[ ] \*\*No dynamic ads\*\* (anything loaded from the internet to display ads).

\- \[ ] \*\*No static ads outside your plugin's own UI\*\* (e.g. don't inject banners into the user's notes) unless disclosed — see disclosures below.

\- \[ ] \*\*No client-side telemetry.\*\* You cannot silently collect and phone home usage data from the user's device.

\- \[ ] \*\*No tracking without explicit opt-in consent.\*\* Any data collection needs a clear opt-in (checkbox/setting), not a default-on toggle buried in fine print.

\- \[ ] \*\*LICENSE file present at repo root\*\*, and you comply with the licenses of any third-party code you used (with attribution in the README where required).

\- \[ ] \*\*Closed-source plugins are not currently accepted\*\* for new submissions. If your plugin isn't open source, it won't get in right now.



\### Disclosures (allowed, but must be stated clearly in your README)

If any of these apply, say so explicitly in the README — don't just let a reviewer discover it:

\- \[ ] Payment required for full access, or account required for full access.

\- \[ ] Any network use — name the remote service(s) and explain why they're needed.

\- \[ ] Access to files outside the vault — explain why.

\- \[ ] Static ads within your own UI.

\- \[ ] Server-side telemetry — link to an actual privacy policy explaining what's collected and how it's used.



Also decide your pricing label honestly, since Obsidian requires one of three: \*\*Free\*\* (no payment tied to it at all — donation links are fine), \*\*Optional payments\*\* (works free but unlocks features or talks to a paid API/service, even one with a free tier), or \*\*Paid\*\* (must pay to use core features). Mislabeling this is a common rejection reason.



\---



\## 2. Repo \& release structure



\- \[ ] Root of repo contains: `manifest.json`, `main.js`, `styles.css` (only if you have styles), `README.md`, `LICENSE`, and `versions.json` if you support multiple `minAppVersion`s over time.

\- \[ ] `manifest.json` fields (`id`, `name`, `version`, `minAppVersion`) exactly match what you're submitting/what's in `community-plugins.json`.

\- \[ ] `id` is unique and doesn't collide with an existing plugin.

\- \[ ] `minAppVersion` is set to the actual minimum Obsidian version your API usage requires — if unsure, use the latest stable build number rather than guessing low.

\- \[ ] `fundingUrl` (if present) only points to something like Buy Me a Coffee or GitHub Sponsors — remove it entirely if you don't accept donations.

\- \[ ] GitHub \*\*release name/tag matches your manifest version exactly\*\*, with no `v` prefix (`1.2.0`, not `v1.2.0`).

\- \[ ] The release itself has `main.js`, `manifest.json`, and `styles.css` uploaded as \*\*individual binary assets\*\* on the release — not just relying on the auto-generated source zip.

\- \[ ] README actually explains what the plugin does and how to use it (this is checked, not a formality).

\- \[ ] Rename every placeholder from the sample plugin template — `MyPlugin`, `MyPluginSettings`, `SampleSettingTab`, etc. Reviewers notice leftover boilerplate names immediately and read it as a sign you didn't clean up.



\---



\## 3. Code-quality pitfalls (this is what actually gets flagged)



These are pulled straight from Obsidian's own "common review comments" list — i.e., the exact things that get your PR/scan commented on:



\- \[ ] Use `this.app`, never the global `app` / `window.app`.

\- \[ ] Strip debug `console.log` calls — the console should be clean by default; only errors should show.

\- \[ ] Use `getFileByPath` / `getFolderByPath` / `getAbstractFileByPath` instead of iterating `vault.getFiles()` to find something by path.

\- \[ ] Use the \*\*Editor API\*\* for edits to the currently open note, not `Vault.modify()` (which loses cursor position, selection, folds).

\- \[ ] Use `Vault.process()` for background edits to a file that isn't open, not `Vault.modify()`.

\- \[ ] Use `FileManager.processFrontMatter()` for frontmatter edits — don't hand-parse YAML.

\- \[ ] Prefer the Vault API over the Adapter API for file ops (caching + race-condition safety).

\- \[ ] Run any user-supplied or constructed path through `normalizePath()`.

\- \[ ] Don't set a default hotkey for commands (causes conflicts, and no hotkey works cross-platform by default).

\- \[ ] Use the right command callback type: `callback` (unconditional), `checkCallback` (conditional), `editorCallback`/`editorCheckCallback` (needs an active Markdown editor).

\- \[ ] Don't access `workspace.activeLeaf` directly — use `getActiveViewOfType()` / `workspace.activeEditor`.

\- \[ ] Don't hold a live reference to a custom view instance in `registerView` — re-fetch via `getActiveLeavesOfType()` when needed, to avoid memory leaks.

\- \[ ] Don't detach leaves in `onunload` (breaks layout restore on update).

\- \[ ] Clean up anything you register — event listeners, intervals, etc. — using `registerEvent()`/`addCommand()` etc. so it's auto-released on unload.

\- \[ ] Prefer `const`/`let` over `var`, and `async`/`await` over raw `.then()` chains.

\- \[ ] If your plugin has more than one `.ts` file, organize it into folders — flat piles of files slow reviewers down and count against you.



\---



\## 4. Security checklist



\- \[ ] \*\*Never\*\* build DOM from user/note input with `innerHTML`, `outerHTML`, or `insertAdjacentHTML` — this is a real XSS vector reviewers specifically scan for. Use `createEl()`/`createDiv()`/`createSpan()` or the DOM API instead, and `el.empty()` to clear content.

\- \[ ] No hardcoded inline styles (`el.style.color = ...`) — use CSS classes + Obsidian's CSS variables so themes/snippets can still override you. This is technically a style guideline, but reviewers treat inline styling plus injected HTML as a bigger red flag together.

\- \[ ] Any network requests are clearly justified and disclosed (see Section 1).

\- \[ ] If you bundle any third-party dependency with known CVEs, update it before submitting — the automated scanner checks for known vulnerabilities.



\---



\## 5. UI text checklist (small, but reviewers do flag it)



\- \[ ] Sentence case everywhere in the UI — "Template folder location," not "Template Folder Location."

\- \[ ] No top-level heading in your settings tab named "Settings," "General," or your plugin's own name.

\- \[ ] If you have multiple settings sections, only add headings when there's more than one section, and never put the word "settings" inside a heading ("Advanced," not "Advanced settings").

\- \[ ] Use `new Setting(containerEl).setName('...').setHeading()` for section headings — not raw `<h1>`/`<h2>` elements.



\---



\## 6. Mobile compatibility (skip if desktop-only, otherwise check)



\- \[ ] If your plugin is marked mobile-compatible, avoid Node.js/Electron-only APIs (`fs`, `child\_process`, etc.) — they don't exist on mobile and will crash the app there.

\- \[ ] Avoid regex lookbehind (`(?<=...)`) if you need to support older mobile WebView engines — it isn't universally supported there.



\---



\## 7. Self-check before you ever submit



Obsidian gives you two ways to run the same automated review yourself, before it's public:



1\. \*\*`obsidianmd/eslint-plugin`\*\* — the official ESLint plugin that checks your code against these exact guidelines locally, in your own dev loop.

2\. \*\*Developer dashboard preview scan\*\* — once logged into community.obsidian.md, you can run the automated review against any branch, tag, or commit \*without\* actually publishing a release. Use this to dry-run a submission and see the scorecard before committing to it publicly.



Run both before your first submission and before every subsequent release — a failed post-launch scan pulls your plugin from search within 24 hours.



\---



\## 8. Submitting (new flow, not the old GitHub PR)



1\. Create an Obsidian account if you don't have one (required for the dashboard).

2\. Sign in at \*\*community.obsidian.md\*\* and connect your GitHub account.

3\. From the developer dashboard, choose the repo to submit and complete the guided steps (this replaces manually editing `community-plugins.json` yourself).

4\. Submission triggers \*\*immediate automated review\*\* — expect a result within minutes, not days.

5\. If it passes, the plugin becomes searchable/installable inside Obsidian within about 24 hours.

6\. If it fails, the dashboard shows you exactly what failed (errors block; warnings don't block but should still be fixed) — fix and resubmit rather than opening a new PR.

7\. Manual review can still happen afterward (especially if your plugin gets popular or someone flags it) — passing automated review is necessary but isn't a permanent guarantee against further scrutiny.



Updates after the first approval don't need a new submission — push a new GitHub release and it's picked up and auto-scanned.



\---



\## 9. Increasing your odds of traction (the "going viral" part)



Nothing here is guaranteed, but these consistently correlate with plugins that get noticed:



\- \*\*A README with a GIF or screenshot in the first screen-height.\*\* Most people judge a plugin by whether they can \*see\* what it does in 5 seconds — text-only READMEs get skipped.

\- \*\*One clear job-to-be-done in the name/description\*\*, not a feature list. "Solves X" beats "does X, Y, Z, and also W."

\- \*\*Post it yourself\*\* in r/ObsidianMD, the Obsidian Discord `#updates`/`#plugin-dev` channels, and the "Share \& showcase" category on the Obsidian forum — the directory alone rarely drives discovery for a brand-new plugin.

\- \*\*Respond fast to early issues.\*\* The first 20–30 users are disproportionately vocal; a quick fix/reply turns them into advocates, silence turns them into a bad first GitHub issue thread that new visitors see.

\- \*\*Keep a real changelog\*\* and bump versions with actual notes — it signals active maintenance, which matters both to users and, per the policies above, to Obsidian's own "unmaintained plugin" removal criteria.

\- \*\*Categorize it correctly\*\* on the new Community site (it's now organized by category — Integrations, Bases, Charts, etc.) so it surfaces in the right browse/filter views.



\---



\## 10. Ongoing obligation (don't forget after launch)



\- \[ ] You're expected to keep maintaining the plugin. Long-term abandonment + it breaking on newer Obsidian versions is grounds for removal per policy.

\- \[ ] Every future release is auto-scanned — a regression that trips the scanner pulls you from search in 24 hours, so treat the eslint plugin / dashboard preview scan as a pre-release step permanently, not just for launch.



\---



\*Sources: Obsidian's "The future of Obsidian plugins" announcement (May 2026), Obsidian Developer Documentation — Plugin guidelines, Developer policies, and the obsidian-releases submission checklist template.\*

