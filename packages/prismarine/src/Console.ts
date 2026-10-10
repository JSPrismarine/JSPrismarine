import type { Server, Service } from './';
import type { CommandExecutor } from './command/CommandExecutor';
import type ChatEvent from './events/chat/ChatEvent';

import process from 'node:process';
import type { CompleterResult } from 'node:readline';
import readline from 'node:readline';

// Extend builtin `readline.Interface` type
declare module 'node:readline' {
    interface Interface {
        setRawMode?(mode: boolean): void;
        output: {
            write: (data: string) => void;
        };
        input: any;
        _refreshLine?(): void;
    }
}

/** The minimum of a readline interface needed to print above its prompt. */
export interface PromptWriter {
    output: { write: (data: string) => void };
    line?: string;
    prompt(preserveCursor?: boolean): void;
    _refreshLine?(): void;
}

/**
 * Prints a line without destroying whatever is half-typed at the prompt.
 *
 * A log arriving mid-keystroke lands on the same terminal row the prompt and the typed
 * text occupy. Writing it straight out leaves the row in a mess: the prompt scrolls away
 * with the message, and a message shorter than the input leaves the tail of the input
 * stranded after it.
 *
 * So the row is wiped first, the message takes it, and readline is asked to draw itself
 * again underneath - prompt, the text being typed, and the cursor wherever in that text it
 * had been left.
 */
export const writeAbovePrompt = (cli: PromptWriter, line: string): void => {
    // \x1b[2K erases the whole row, \r returns to its start. Both are needed: \r alone
    // would overwrite only as far as the new text reaches.
    cli.output.write(`\x1b[2K\r${line}\n`);

    if (cli._refreshLine) {
        // Redraws prompt, buffer and cursor in one go, which is exactly the job.
        cli._refreshLine();
        return;
    }

    // Without that internal, the best available is the prompt plus an echo of the buffer.
    // The cursor ends up at the end of the text rather than where it was, which is worth
    // it against losing the input altogether.
    cli.prompt(true);
    if (cli.line) cli.output.write(cli.line);
};

/**
 * Server console.
 */
export default class Console implements CommandExecutor, Service {
    private cli?: readline.Interface;

    public constructor(private readonly server: Server) {}

    /**
     * On enable hook.
     * @group Lifecycle
     */
    public async enable(): Promise<void> {
        // Make sure we don't enable the console twice.
        if (this.cli) return;

        if (!process.stdin.setRawMode as any) {
            // TODO: Handle headless modes better (eg unit testing).
            return;
        }

        process.stdin.setRawMode(true);
        // setNoDelay and setKeepAlive are Node.js-specific and not available in Bun
        if (typeof process.stdin.setNoDelay === 'function') process.stdin.setNoDelay(true);
        if (typeof process.stdin.setKeepAlive === 'function') process.stdin.setKeepAlive(true);
        process.stdin.resume();

        this.cli = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: true,
            prompt: '> ',
            tabSize: 4,
            removeHistoryDuplicates: true,
            completer: this.complete.bind(this)
        });

        this.server.on('chat', async (evt: ChatEvent) => {
            if (evt.isCancelled()) return;
            this.sendMessage(evt.getChat().getMessage());
        });
        this.server.getLogger().setConsole(this);

        this.cli.on('keypress', async (_, key) => {
            switch (key.name) {
                case 'c': {
                    if (key.ctrl) {
                        await this.server.shutdown();
                    }
                    break;
                }
                default: {
                    break;
                }
            }
        });

        this.cli.on('line', (input: string) => {
            if (input.trim() === '') return;

            // Fix cursor positioning.
            this.cli?.output.write(`\x1b[2D`);

            this.server
                .getCommandManager()
                .dispatchCommand(this, this, input)
                .catch((error: unknown) => {
                    this.server.getLogger().error(`Command "${input}" failed`);
                    this.server.getLogger().error(error);
                });
        });
    }

    /**
     * On disable hook.
     * @group Lifecycle
     */
    public async disable(): Promise<void> {
        this.cli?.close();
        this.cli?.removeAllListeners();
    }

    private async complete(line: string, callback: (err?: null | Error, result?: CompleterResult) => void) {
        const commands = Array.from(this.server.getCommandManager().getCommands().values()).map(
            (command) => command.name
        );

        // Merge and remove duplicates.
        const completions = commands
            .reverse() // Reverse to remove duplicates at the end.
            .filter((value, index, self) => self.indexOf(value) === index)
            .reverse(); // Restore.

        // TODO: Handle arguments.
        const hits = completions.filter((c) => c.startsWith(line));
        return callback(null, [hits.length ? hits : completions, line]);
    }

    public write(line: string): void {
        if (!this.cli) {
            process.stdout.write(`${line}\n`);
            return;
        }

        writeAbovePrompt(this.cli, line);
    }

    public getName(): string {
        return 'CONSOLE';
    }

    public getFormattedUsername(): string {
        return '[CONSOLE]';
    }

    public sendMessage(message: string): void {
        this.server.getLogger().info(message);
    }

    public getServer(): Server {
        return this.server;
    }
}
