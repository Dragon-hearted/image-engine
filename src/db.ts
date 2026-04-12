import { Database } from "bun:sqlite";
import type {
	BudgetConfig,
	GenerationRecord,
	ImageRecord,
	TokenCostRecord,
} from "./types";

const db = new Database("./imageengine.db", { create: true });

// Enable WAL mode for better concurrent access
db.exec("PRAGMA journal_mode = WAL;");

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS generations (
    id TEXT PRIMARY KEY,
    prompt TEXT NOT NULL,
    model TEXT NOT NULL,
    systemInstruction TEXT,
    aspectRatio TEXT,
    imageSize TEXT,
    resultPath TEXT NOT NULL,
    referenceImageIds TEXT NOT NULL,
    finishReason TEXT NOT NULL,
    createdAt TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS images (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    originalName TEXT NOT NULL,
    path TEXT NOT NULL,
    mimeType TEXT NOT NULL,
    size INTEGER NOT NULL,
    createdAt TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS token_ledger (
    id TEXT PRIMARY KEY,
    generationId TEXT NOT NULL,
    model TEXT NOT NULL,
    promptTokens INTEGER NOT NULL,
    candidateTokens INTEGER NOT NULL,
    totalTokens INTEGER NOT NULL,
    createdAt TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS budget_config (
    id TEXT PRIMARY KEY,
    tokenCeiling INTEGER NOT NULL,
    warnAtPercent INTEGER NOT NULL DEFAULT 80,
    isActive INTEGER NOT NULL DEFAULT 1,
    updatedAt TEXT NOT NULL
  )
`);

// Insert default budget config if none exists
const existingConfig = db.prepare("SELECT id FROM budget_config LIMIT 1").get();

if (!existingConfig) {
	const defaultCeiling = Number.parseInt(
		process.env.IMAGE_ENGINE_TOKEN_CEILING ?? "100000",
		10,
	);
	db.prepare(
		"INSERT INTO budget_config (id, tokenCeiling, warnAtPercent, isActive, updatedAt) VALUES (?, ?, 80, 1, ?)",
	).run("default", defaultCeiling, new Date().toISOString());
}

// ─── Generation helpers ───

export function insertGeneration(gen: GenerationRecord): void {
	db.prepare(
		"INSERT INTO generations (id, prompt, model, systemInstruction, aspectRatio, imageSize, resultPath, referenceImageIds, finishReason, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
	).run(
		gen.id,
		gen.prompt,
		gen.model,
		gen.systemInstruction,
		gen.aspectRatio,
		gen.imageSize,
		gen.resultPath,
		gen.referenceImageIds,
		gen.finishReason,
		gen.createdAt,
	);
}

export function getGeneration(id: string): GenerationRecord | null {
	return (
		(db
			.prepare("SELECT * FROM generations WHERE id = ?")
			.get(id) as GenerationRecord) ?? null
	);
}

export function getAllGenerations(
	limit: number,
	offset: number,
): GenerationRecord[] {
	return db
		.prepare(
			"SELECT * FROM generations ORDER BY createdAt DESC LIMIT ? OFFSET ?",
		)
		.all(limit, offset) as GenerationRecord[];
}

// ─── Image helpers ───

export function insertImage(image: ImageRecord): void {
	db.prepare(
		"INSERT INTO images (id, filename, originalName, path, mimeType, size, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
	).run(
		image.id,
		image.filename,
		image.originalName,
		image.path,
		image.mimeType,
		image.size,
		image.createdAt,
	);
}

export function getImage(id: string): ImageRecord | null {
	return (
		(db.prepare("SELECT * FROM images WHERE id = ?").get(id) as ImageRecord) ??
		null
	);
}

// ─── Token ledger helpers ───

export function insertTokenRecord(record: TokenCostRecord): void {
	db.prepare(
		"INSERT INTO token_ledger (id, generationId, model, promptTokens, candidateTokens, totalTokens, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
	).run(
		record.id,
		record.generationId,
		record.model,
		record.promptTokens,
		record.candidateTokens,
		record.totalTokens,
		record.createdAt,
	);
}

export function getTotalTokensSpent(): number {
	const result = db
		.prepare("SELECT COALESCE(SUM(totalTokens), 0) as total FROM token_ledger")
		.get() as { total: number };
	return result.total;
}

export function getTokenHistory(from?: string, to?: string): TokenCostRecord[] {
	if (from && to) {
		return db
			.prepare(
				"SELECT * FROM token_ledger WHERE createdAt >= ? AND createdAt <= ? ORDER BY createdAt DESC",
			)
			.all(from, to) as TokenCostRecord[];
	}
	if (from) {
		return db
			.prepare(
				"SELECT * FROM token_ledger WHERE createdAt >= ? ORDER BY createdAt DESC",
			)
			.all(from) as TokenCostRecord[];
	}
	if (to) {
		return db
			.prepare(
				"SELECT * FROM token_ledger WHERE createdAt <= ? ORDER BY createdAt DESC",
			)
			.all(to) as TokenCostRecord[];
	}
	return db
		.prepare("SELECT * FROM token_ledger ORDER BY createdAt DESC")
		.all() as TokenCostRecord[];
}

// ─── Budget config helpers ───

export function getBudgetConfig(): BudgetConfig | null {
	return (
		(db
			.prepare("SELECT * FROM budget_config WHERE isActive = 1 LIMIT 1")
			.get() as BudgetConfig) ?? null
	);
}

export function updateBudgetCeiling(ceiling: number): void {
	db.prepare(
		"UPDATE budget_config SET tokenCeiling = ?, updatedAt = ? WHERE isActive = 1",
	).run(ceiling, new Date().toISOString());
}

export { db };
