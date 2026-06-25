// src/lib/database.ts
import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import path from 'node:path';
import { configDir, pwd, useConfig } from '../context/ConfigContext';
import { createHash } from 'node:crypto';
import type { ConversationMessage } from '../types/index';
// Reading initial file
// Use configDir for persistence
const dbPath = path.join(configDir, 'agent.db');
// Ensure the directory exists
mkdirSync(dirname(dbPath), { recursive: true });

// Initialize the database connection (synchronous)
export const db = new Database(dbPath, { create: true });

// Enable foreign keys for better data integrity
db.run('PRAGMA foreign_keys = ON;');

// Create the llm table if it doesn't exist
db.run(`
    CREATE TABLE IF NOT EXISTS llm (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        model_name TEXT NOT NULL,
        embedding_model TEXT
    )
`);

// Create conversation messages table
db.run(`
    CREATE TABLE IF NOT EXISTS conversation_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`);

// Create index for thread_id to speed up lookups
db.run(`
    CREATE INDEX IF NOT EXISTS idx_thread_id ON conversation_messages(thread_id)
`);

export type LLMRecord = {
    id?: number;
    provider: string;
    model_name: string;
    embedding_model?: string | null;
};

// ─── LLM Table Helper Functions ─────────────────────────

export function insertLLM(record: Omit<LLMRecord, 'id'>): number {
    const stmt = db.prepare(`
        INSERT INTO llm (provider, model_name, embedding_model)
        VALUES (?, ?, ?)
    `);
    const info = stmt.run(
        record.provider,
        record.model_name,
        record.embedding_model ?? null,
    );
    return Number(info.lastInsertRowid);
}

export function getLLM(): LLMRecord[] {
    const stmt = db.prepare('SELECT * FROM llm');
    return stmt.all() as LLMRecord[];
}

export function getLLMByProvider(provider: string): LLMRecord[] {
    const stmt = db.prepare('SELECT * FROM llm WHERE provider = ?');
    return stmt.all(provider) as LLMRecord[];
}

export function updateLLM(
    id: number,
    updates: Partial<Omit<LLMRecord, 'id'>>
): void {
    const fields: string[] = [];
    const values: any[] = [];
    if (updates.provider !== undefined) {
        fields.push('provider = ?');
        values.push(updates.provider);
    }
    if (updates.model_name !== undefined) {
        fields.push('model_name = ?');
        values.push(updates.model_name);
    }
    if (updates.embedding_model !== undefined) {
        fields.push('embedding_model = ?');
        values.push(updates.embedding_model);
    }
    if (fields.length === 0) return;
    values.push(id);
    const stmt = db.prepare(`UPDATE llm SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
}

export function deleteLLM(id: number): void {
    const stmt = db.prepare('DELETE FROM llm WHERE id = ?');
    stmt.run(id);
}

// ─── Conversation History Helper Functions ──────────────

export function addMessage(
    threadId: string,
    role: 'user' | 'assistant' | 'system',
    content: string
): number {
    const stmt = db.prepare(`
        INSERT INTO conversation_messages (thread_id, role, content)
        VALUES (?, ?, ?)
    `);
    const info = stmt.run(threadId, role, content);
    return Number(info.lastInsertRowid);
}

export function getConversationHistory(
    threadId: string,
    limit: number = 20
): ConversationMessage[] {
    const stmt = db.prepare(`
        SELECT id, thread_id, role, content, created_at
        FROM conversation_messages
        WHERE thread_id = ?
        ORDER BY id DESC
        LIMIT ?
    `);
    const rows = stmt.all(threadId, limit) as ConversationMessage[];
    // Reverse to get chronological order (oldest first)
    return rows.reverse();
}

export function clearConversationHistory(threadId: string): void {
    const stmt = db.prepare(
        'DELETE FROM conversation_messages WHERE thread_id = ?'
    );
    stmt.run(threadId);
}

export function deleteAllConversations(): void {
    const stmt = db.prepare('DELETE FROM conversation_messages');
    stmt.run();
}

// Optional: Close the database connection when the process exits
process.on('exit', () => db.close());