// src/tools/sqlExecutorTool.ts
import { tool } from 'langchain';
import { z } from 'zod';
import { db } from '../lib/database.js';

// Helper: Execute SQL and format result
function executeSQL(sql: string): string {
    // Normalise whitespace and detect operation type
    const trimmed = sql.trim().toLowerCase();
    const isSelect = trimmed.startsWith('select');

    try {
        if (isSelect) {
            const stmt = db.prepare(sql);
            const rows = stmt.all();
            return JSON.stringify(rows, null, 2);
        } else {
            const stmt = db.prepare(sql);
            const info = stmt.run();
            return `Query executed successfully. Affected rows: ${info.changes}. Last insert rowid: ${info.lastInsertRowid}`;
        }
    } catch (err: any) {
        return `SQL error: ${err.message}`;
    }
}

export const sqlExecutorTool = tool(
    async ({ sql }) => {
        return executeSQL(sql);
    },
    {
        name: 'execute_sql',
        description: `Execute a SQL command on the local SQLite database (agent.db in the config directory).
You can run SELECT, INSERT, UPDATE, DELETE, CREATE TABLE, ALTER TABLE, DROP TABLE, etc.
For SELECT queries, returns the result set as JSON.
For other commands, returns the number of affected rows and last insert rowid.
Use single quotes for strings. Be careful with destructive operations – the user may not want to lose data.
Always explain what you are going to do before executing destructive commands.
Use this tool to manage the agent's own conversation history, LLM settings, or to store custom data.
Tables:
- llm: stores LLM configurations (id, provider, model_name, embedding_model)
- conversation_messages: stores chat history (id, thread_id, role, content, created_at)`,
        schema: z.object({
            sql: z.string().describe('The SQL statement to execute.'),
        }),
    }
);