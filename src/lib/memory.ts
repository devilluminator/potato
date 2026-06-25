import { Database } from 'bun:sqlite';
import { LocalEmbeddings } from './embeddings';
import { configDir } from '../context/ConfigContext';
import path from 'node:path';
import { getLoadablePath } from 'sqlite-vec'; // ✅ official helper

// ─── Types ──────────────────────────────────────────────
export interface SearchResult {
    id: number;
    content: string;
    metadata?: Record<string, any>;
    timestamp: number;
    score: number; // RRF combined score
}

export class Memory {
    private db: Database;
    private embeddings: LocalEmbeddings;
    private readonly k = 60;
    private dimension = 768;
    private extensionLoaded = false;

    constructor(embedModelId: string, dbPath?: string) {
        this.embeddings = new LocalEmbeddings(embedModelId);
        const dbFile = dbPath ?? path.join(configDir, 'memory.db');
        this.db = new Database(dbFile);
        this.db.run('PRAGMA journal_mode=WAL;');
        this.initTables();
    }

    private initTables() {
        // ── 1. Load sqlite-vec extension (official method) ──
        try {
            const extPath = getLoadablePath();
            this.db.loadExtension(extPath);
            this.extensionLoaded = true;
            console.log('✅ sqlite-vec extension loaded from:', extPath);
        } catch (e) {
            console.warn('⚠️ sqlite-vec extension not available, falling back to brute‑force search.');
            this.extensionLoaded = false;
        }

        // ── 2. Main messages table ────────────────────────
        this.db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        embedding BLOB,
        metadata TEXT,
        timestamp INTEGER NOT NULL
      );
    `);

        // ── 3. FTS5 virtual table ─────────────────────────
        this.db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts
      USING fts5(content, tokenize = 'porter unicode61');
    `);

        // ── 4. vec0 table will be created lazily in ensureDimension()
    }

    private async ensureDimension(dim: number) {
        if (this.dimension === dim) return;
        if (!this.extensionLoaded) return;

        try {
            this.db.run('DROP TABLE IF EXISTS messages_vec');
            this.db.run(`
        CREATE VIRTUAL TABLE IF NOT EXISTS messages_vec
        USING vec0(
          id INTEGER PRIMARY KEY,
          embedding FLOAT[${dim}]
        );
      `);
            this.dimension = dim;
        } catch (e) {
            console.warn('Failed to create vec0 table, falling back to brute‑force.');
            this.extensionLoaded = false;
        }
    }

    // ─── Add a new memory entry ──────────────────────────
    async add(content: string, metadata?: Record<string, any>): Promise<number> {
        const timestamp = Date.now();
        const embedding = await this.embeddings.embedQuery(content);
        const dim = embedding.length;

        await this.ensureDimension(dim);

        const float32Array = new Float32Array(embedding);
        const blob = Buffer.from(float32Array.buffer);

        // Insert into messages
        const stmt = this.db.prepare(`
      INSERT INTO messages (content, embedding, metadata, timestamp)
      VALUES (?, ?, ?, ?)
    `);
        const metaJson = metadata ? JSON.stringify(metadata) : null;
        const info = stmt.run(content, blob, metaJson, timestamp);
        const id = Number(info.lastInsertRowid);

        // Insert into FTS5
        const ftsStmt = this.db.prepare('INSERT INTO messages_fts (rowid, content) VALUES (?, ?)');
        ftsStmt.run(id, content);

        // Insert into vec0 (if loaded)
        if (this.extensionLoaded) {
            try {
                const vecStmt = this.db.prepare('INSERT INTO messages_vec (id, embedding) VALUES (?, ?)');
                vecStmt.run(id, blob);
            } catch (e) {
                console.warn('Vector insert failed, falling back to brute‑force.');
                this.extensionLoaded = false;
            }
        }

        return id;
    }

    // ─── Search ────────────────────────────────────────────
    async search(query: string, limit: number = 5): Promise<SearchResult[]> {
        const vector = await this.embeddings.embedQuery(query);
        const float32Array = new Float32Array(vector);
        const queryBlob = Buffer.from(float32Array.buffer);

        // 1. Vector search via vec0 (if available)
        let vectorResults: { id: number; distance: number }[] = [];
        if (this.extensionLoaded) {
            try {
                const vecStmt = this.db.prepare(`
          SELECT id, distance
          FROM messages_vec
          WHERE embedding MATCH ?
          ORDER BY distance
          LIMIT ?
        `);
                vectorResults = vecStmt.all(queryBlob, limit * 2) as { id: number; distance: number }[];
            } catch (e) {
                console.warn('Vec0 query failed, falling back to brute‑force.');
                this.extensionLoaded = false;
                vectorResults = await this.bruteForceSearch(queryBlob, limit * 2);
            }
        } else {
            vectorResults = await this.bruteForceSearch(queryBlob, limit * 2);
        }

        // 2. FTS search
        let ftsResults: { id: number; rank: number }[] = [];
        try {
            const ftsStmt = this.db.prepare(`
        SELECT rowid AS id, rank
        FROM messages_fts
        WHERE messages_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `);
            const rows = ftsStmt.all(query, limit * 2) as { id: number; rank: number }[];
            ftsResults = rows.map(r => ({ id: r.id, rank: r.rank }));
        } catch (e) {
            // FTS may fail if query is empty or malformed
        }

        // 3. RRF fusion
        const scores = new Map<number, number>();
        vectorResults.forEach((res, idx) => {
            const rank = idx + 1;
            scores.set(res.id, (scores.get(res.id) || 0) + 1 / (this.k + rank));
        });
        ftsResults.forEach((res, idx) => {
            const rank = idx + 1;
            scores.set(res.id, (scores.get(res.id) || 0) + 1 / (this.k + rank));
        });

        const sortedIds = Array.from(scores.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([id]) => id);

        if (sortedIds.length === 0) return [];

        // Fetch full messages
        const placeholders = sortedIds.map(() => '?').join(',');
        const stmt = this.db.prepare(`
      SELECT id, content, metadata, timestamp
      FROM messages
      WHERE id IN (${placeholders})
    `);
        const rows = stmt.all(...sortedIds) as { id: number; content: string; metadata: string | null; timestamp: number }[];

        const idToRow = new Map(rows.map(r => [r.id, r]));
        const results: SearchResult[] = [];
        for (const id of sortedIds) {
            const row = idToRow.get(id);
            if (row) {
                results.push({
                    id: row.id,
                    content: row.content,
                    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
                    timestamp: row.timestamp,
                    score: scores.get(id) || 0,
                });
            }
        }
        return results;
    }

    // ─── Brute‑force fallback ─────────────────────────────
    private async bruteForceSearch(queryBlob: Buffer, limit: number): Promise<{ id: number; distance: number }[]> {
        const stmt = this.db.prepare('SELECT id, embedding FROM messages WHERE embedding IS NOT NULL');
        const rows = stmt.all() as { id: number; embedding: Buffer | null }[];
        const queryFloat = new Float32Array(queryBlob.buffer);

        const results: { id: number; distance: number }[] = [];
        for (const row of rows) {
            if (!row.embedding) continue;
            const vecFloat = new Float32Array(row.embedding.buffer);
            let dot = 0, normA = 0, normB = 0;
            for (let i = 0; i < vecFloat.length; i++) {
                dot += vecFloat[i] * queryFloat[i];
                normA += vecFloat[i] * vecFloat[i];
                normB += queryFloat[i] * queryFloat[i];
            }
            if (normA === 0 || normB === 0) continue;
            const sim = dot / (Math.sqrt(normA) * Math.sqrt(normB));
            results.push({ id: row.id, distance: 1 - sim });
        }
        results.sort((a, b) => a.distance - b.distance);
        return results.slice(0, limit);
    }
}