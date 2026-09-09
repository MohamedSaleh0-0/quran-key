import { describe, expect, it } from "vitest";
import {
	DEFAULT_QURAN_RENDERING_PROFILE,
	getQuranRenderingProfile,
	QURAN_RENDERING_PROFILES,
} from "../../src/config/quranRenderingProfiles";

describe("Quran rendering profiles", () => {
	it("keeps each testing candidate addressable and falls back safely", () => {
		expect(new Set(QURAN_RENDERING_PROFILES.map((profile) => profile.id)).size).toBe(QURAN_RENDERING_PROFILES.length);
		expect(getQuranRenderingProfile(DEFAULT_QURAN_RENDERING_PROFILE).textProfile).toBe("tanzil-sequential");
		expect(getQuranRenderingProfile("removed-profile").id).toBe(DEFAULT_QURAN_RENDERING_PROFILE);
	});
});
