import type { Server, Service } from './';
import type { CommandExecutor } from './command/CommandExecutor';
import type ChatEvent from './events/chat/ChatEvent';

import type { CompleterResult } from 'node:readline';
import readline from 'node:readline';

// Extend `readline.Interface` type
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

/**
 * Server console.
 */
export default class Console implements CommandExecutor, Service {
    private cli?: readline.Interface;

    public constructor(private server: Server) {}

    public async enable(): Promise<void> {
        process.stdin.setRawMode(true);

        this.cli = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: true,
            prompt: '> ',
            tabSize: 4,
            crlfDelay: Number.POSITIVE_INFINITY,
            escapeCodeTimeout: 1500,
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

            this.cli?.output.write(`\x1b[2D`);

            // Handle commands.
            if (input.startsWith('/')) {
                void this.server.getCommandManager().dispatchCommand(this, this as any, input);
                return;
            }
        });

        this.cli.on('close', async () => await this.server.shutdown());
    }

    public async disable(): Promise<void> {
        /*this.cli?.removeAllListeners();
        this.cli?.close();*/
    }

    private async complete(line: string, callback: (err?: null | Error, result?: CompleterResult) => void) {
        const commands = Array.from(this.server.getCommandManager().getCommands().values()).map(
            (command) => `/${command.name}`
        );

        // Merge and remove duplicates.
        const completions = ['/', ...commands]
            .reverse() // Reverse to remove duplicates at the end.
            .filter((value, index, self) => self.indexOf(value) === index)
            .reverse(); // Restore.

        // TODO: Handle arguments.
        const hits = completions.filter((c) => c.startsWith(line));
        return callback(null, [hits.length ? hits : completions, line]);
    }

    public write(line: string): void {
        // Remove the prompt that's prefixed when logging.
        this.cli?.output.write(`\x1b[${this.cli.getPrompt().length}D`);

        // Write the line.
        this.cli?.output.write(`\r${line}\n\r`);

        this.cli?._refreshLine?.();
        this.cli?.prompt();
    }

    public getName(): string {
        return 'CONSOLE';
    }

    public getFormattedUsername(): string {
        return 'CONSOLE';
    }

    public sendMessage(message: string): void {
        this.server.getLogger().info(message);
    }

    public getServer(): Server {
        return this.server;
    }
}
