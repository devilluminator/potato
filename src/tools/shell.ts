import { tool } from 'langchain';
import { z } from 'zod';
import { execa } from 'execa';

const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes
const MAX_OUTPUT_CHARS = 30_000;

function truncate(text: string, max = MAX_OUTPUT_CHARS): string {
    if (text.length <= max) return text;
    const omitted = text.length - max;
    return `${text.slice(0, max)}\n\n...[truncated ${omitted} more characters — re-run with a more specific command, e.g. grep/filter, to see the rest]`;
}

/**
 * Runs a shell command.
 *
 * - Normal mode: waits for the command to finish and returns output.
 * - Background mode: spawns a detached process and returns immediately.
 */
export const runShellCommand = tool(
    async ({ command, args = [], cwd, timeoutMs, background }) => {
        // ─── Background mode ────────────────────────────────
        if (background) {
            try {
                const subprocess = execa(command, args, {
                    cwd: cwd ?? process.cwd(),
                    detached: true,
                    stdio: 'ignore',
                    // No timeout – runs indefinitely
                });
                subprocess.unref(); // allow parent process to exit independently
                const pid = subprocess.pid;
                return `✅ Started "${command}${args.length ? ' ' + args.join(' ') : ''}" in background (PID: ${pid}).`;
            } catch (error: any) {
                return `❌ Failed to spawn background process: ${error.shortMessage || error.message}`;
            }
        }

        // ─── Normal mode (wait for exit) ─────────────────────
        try {
            const result = await execa(command, args, {
                cwd: cwd ?? process.cwd(),
                timeout: timeoutMs ?? DEFAULT_TIMEOUT_MS,
                reject: false,
                all: true,
                shell: false,
            });

            const header = [
                `$ ${command}${args.length ? ' ' + args.join(' ') : ''}`,
                `exit code: ${result.exitCode}`,
                result.timedOut ? `⚠️ timed out after ${timeoutMs ?? DEFAULT_TIMEOUT_MS}ms` : null,
            ]
                .filter(Boolean)
                .join('\n');

            const body = truncate(result.all || result.stdout || '(no output)');
            return `${header}\n--- output ---\n${body}`;
        } catch (error: any) {
            return `Failed to spawn "${command}": ${error.shortMessage || error.message}`;
        }
    },
    {
        name: 'run_shell_command',
        description:
            'Run a shell command. Use background=true for long-running servers (e.g., chroma run) so the tool returns immediately.',
        schema: z.object({
            command: z.string().describe('The executable to run, e.g. "chroma", "npm".'),
            args: z
                .array(z.string())
                .optional()
                .describe('Arguments as an array, e.g. ["run"].'),
            cwd: z
                .string()
                .optional()
                .describe('Working directory. Defaults to process.cwd().'),
            timeoutMs: z
                .number()
                .optional()
                .describe('Max runtime in ms. Ignored in background mode. Default 120000.'),
            background: z
                .boolean()
                .optional()
                .describe('If true, run the command in the background (detached) and return immediately. Use for services like chroma run.'),
        }),
    }
);