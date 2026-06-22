import { afterEach, describe, expect, mock, test } from "bun:test";
import { createEmitter } from "../src/lib/emitter";

describe("createEmitter", () => {
	const origFetch = global.fetch;
	const origUrl = process.env.CONSOLE_INGEST_URL;
	const origPort = process.env.ORCH_PORT;

	afterEach(() => {
		global.fetch = origFetch;
		restore("CONSOLE_INGEST_URL", origUrl);
		restore("ORCH_PORT", origPort);
	});

	function restore(key: string, value: string | undefined) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}

	test("no-ops (no POST) when no ingest env is set — Reflect mode", async () => {
		delete process.env.CONSOLE_INGEST_URL;
		delete process.env.ORCH_PORT;
		const fetchMock = mock(() => Promise.resolve(new Response(null)));
		global.fetch = fetchMock as unknown as typeof fetch;

		const emitter = createEmitter({ runId: "r1", producerSystem: "image-engine" });
		expect(emitter.enabled).toBe(false);

		await emitter.runStarted();
		await emitter.step("r1:scene-a", "queued");
		await emitter.runCompleted("completed");

		expect(fetchMock).not.toHaveBeenCalled();
	});

	test("POSTs well-formed envelopes when CONSOLE_INGEST_URL is set", async () => {
		process.env.CONSOLE_INGEST_URL = "http://127.0.0.1:4100/api/ingest";
		delete process.env.ORCH_PORT;
		const calls: { url: string; body: Record<string, unknown> }[] = [];
		const fetchMock = mock((url: string, init: RequestInit) => {
			calls.push({ url, body: JSON.parse(init.body as string) });
			return Promise.resolve(new Response(null, { status: 200 }));
		});
		global.fetch = fetchMock as unknown as typeof fetch;

		const emitter = createEmitter({ runId: "r1", producerSystem: "image-engine" });
		expect(emitter.enabled).toBe(true);

		await emitter.runStarted();
		await emitter.step("r1:scene-a", "succeeded", {
			url: "/api/gallery/x/image",
			mimeType: "image/png",
		});
		await emitter.runCompleted("completed");

		expect(calls).toHaveLength(3);
		for (const c of calls) {
			expect(c.url).toBe("http://127.0.0.1:4100/api/ingest");
			expect(c.body.envelopeVersion).toBe("1.0");
		}
		expect(calls[0].body).toMatchObject({
			kind: "run.started",
			runId: "r1",
			producerSystem: "image-engine",
		});
		expect(typeof calls[0].body.startedAt).toBe("number");
		expect(calls[1].body).toMatchObject({
			kind: "step",
			runId: "r1",
			stepKey: "r1:scene-a",
			state: "succeeded",
			artifact: { url: "/api/gallery/x/image", mimeType: "image/png" },
		});
		expect(calls[2].body).toMatchObject({
			kind: "run.completed",
			runId: "r1",
			status: "completed",
		});
		expect(typeof calls[2].body.completedAt).toBe("number");
	});
});
