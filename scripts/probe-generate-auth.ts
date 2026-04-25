/**
 * Probe the WisGate generateContent endpoint with different auth styles
 * to diagnose why image generation returns 401 while balance check succeeds.
 */

const env = (globalThis as any).process.env;
const key = env.WISDOM_GATE_KEY;
if (!key) {
	console.log("Key NOT loaded");
	process.exit(1);
}

const body = {
	contents: [{ role: "user", parts: [{ text: "a plain red square" }] }],
	generationConfig: { responseModalities: ["IMAGE"] },
};

const url = "https://api.wisgate.ai/v1beta/models/gemini-2.5-flash-image:generateContent";

const tests = [
	{ name: "x-goog-api-key", headers: { "Content-Type": "application/json", "x-goog-api-key": key } },
	{ name: "Bearer", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` } },
];

for (const t of tests) {
	const r = await fetch(url, { method: "POST", headers: t.headers, body: JSON.stringify(body) });
	console.log(`[${t.name}] status:`, r.status);
	const text = await r.text();
	console.log(`[${t.name}] body:`, text.slice(0, 500));
	console.log();
}
