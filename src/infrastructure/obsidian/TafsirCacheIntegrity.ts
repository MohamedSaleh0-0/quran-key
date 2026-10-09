/** Return a stable SHA-256 digest for cached tafsir content. */
export async function sha256Hex(content: string): Promise<string> {
	const bytes = new TextEncoder().encode(content);
	const digest = await window.crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
