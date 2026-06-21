/**
 * Console Emitter (copied, NOT imported — ADR-0008).
 *
 * A thin, fire-and-forget helper that POSTs Run/Step lifecycle envelopes to the
 * Command Center orchestrator's HTTP ingest. The envelope SHAPE is copied from
 * `@command-center/shared`'s `substrate.ts` — image-engine deliberately does
 * NOT depend on the orchestrator (ADR-0008).
 *
 * Emission must NEVER block or fail a generation: every POST is fire-and-forget
 * with a short timeout and swallows all errors. When no ingest URL is configured
 * the emitter no-ops cleanly (Reflect mode), so plain CLI runs without a Console
 * still work.
 */

const ENVELOPE_VERSION = "1.0" as const;
const POST_TIMEOUT_MS = 2000;

export type RunCompletedStatus =
	| "completed"
	| "completed-with-failures"
	| "failed"
	| "cancelled";

export type StepState =
	| "queued"
	| "running"
	| "retrying"
	| "succeeded"
	| "failed";

export interface StepArtifact {
	url: string;
	mimeType: string;
}

export interface Emitter {
	/** True when an ingest URL is configured; false = Reflect mode (no-op). */
	readonly enabled: boolean;
	runStarted(): Promise<void>;
	/**
	 * Emit a Step lifecycle event. `retryAttempt` (default 0) is part of the
	 * ingest dedupe identity (#32) so a retried event — same state, new attempt —
	 * is not collapsed as a duplicate. Bump it when re-running an item.
	 */
	step(
		stepKey: string,
		state: StepState,
		artifact?: StepArtifact,
		retryAttempt?: number,
	): Promise<void>;
	runCompleted(status: RunCompletedStatus): Promise<void>;
}

/**
 * Resolve the ingest endpoint from env, or null to no-op (Reflect mode).
 * - `CONSOLE_INGEST_URL` — full ingest URL (or base; `/api/ingest` appended).
 * - `ORCH_PORT` — orchestrator port on localhost (Console default: 4100).
 * - neither set → null (no Console attached; emit is a no-op).
 */
function resolveIngestUrl(): string | null {
	const explicit = process.env.CONSOLE_INGEST_URL;
	if (explicit) {
		const trimmed = explicit.replace(/\/+$/, "");
		return trimmed.endsWith("/api/ingest") ? trimmed : `${trimmed}/api/ingest`;
	}
	const port = process.env.ORCH_PORT;
	if (port) return `http://127.0.0.1:${port}/api/ingest`;
	return null;
}

export function createEmitter(opts: {
	runId: string;
	producerSystem: string;
}): Emitter {
	const url = resolveIngestUrl();

	function post(envelope: Record<string, unknown>): Promise<void> {
		if (!url) return Promise.resolve();
		return fetch(url, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(envelope),
			signal: AbortSignal.timeout(POST_TIMEOUT_MS),
		})
			.then(() => undefined)
			.catch(() => undefined);
	}

	return {
		enabled: url !== null,
		runStarted() {
			return post({
				envelopeVersion: ENVELOPE_VERSION,
				kind: "run.started",
				runId: opts.runId,
				producerSystem: opts.producerSystem,
				startedAt: Date.now(),
			});
		},
		step(stepKey, state, artifact, retryAttempt = 0) {
			const envelope: Record<string, unknown> = {
				envelopeVersion: ENVELOPE_VERSION,
				kind: "step",
				runId: opts.runId,
				stepKey,
				state,
				retryAttempt,
			};
			if (artifact) envelope.artifact = artifact;
			return post(envelope);
		},
		runCompleted(status) {
			return post({
				envelopeVersion: ENVELOPE_VERSION,
				kind: "run.completed",
				runId: opts.runId,
				status,
				completedAt: Date.now(),
			});
		},
	};
}
