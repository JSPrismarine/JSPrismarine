import type { Server, Service } from './';
import type { CommandExecutor } from './command/CommandExecutor';
import { consoleTextOf } from './chat/ConsoleText';
import type ChatEvent from './events/chat/ChatEvent';

import process from 'node:process';
import type { CompleterResult } from 'node:readline';
import readline from 'node:readline';
import type { Readable } from 'node:stream';

/**
 * Completes a partially typed console line against the known command names.
 *
 * Duplicate names are dropped, keeping the last occurrence. When no name starts with the
 * typed text, every name is offered instead.
 */
export const completeCommand = (names: readonly string[], line: string): CompleterResult => {
    const completions = names.filter((name, index, self) => self.lastIndexOf(name) === index);
    const hits = completions.filter((name) => name.startsWith(line));
    return [hits.length ? hits : completions, line];
};

/**
 * The plain line console: one command per line of input, one log record per line of output.
 *
 * This is the in-process console for plain mode, where the server owns stdin and stdout
 * itself. It never puts the terminal in raw mode, draws no prompt, and does no completion,
 * so it works the same under a pipe, inside a container, from a panel that feeds stdin, and
 * on a Node without a TTY. The interactive terminal UI lives in `@jsprismarine/console`.
 *
 * Ctrl+C is not handled here. The process entry point installs the signal handlers that
 * stop the server.
 */
export default class Console implements CommandExecutor, Service {
    private cli?: readline.Interface;
    private enabled = false;

    /**
     * @param input - Where command lines come from. Defaults to the process's stdin.
     */
    public constructor(
        private readonly server: Server,
        private readonly input: Readable = process.stdin
    ) {}

    /**
     * Subscribes to chat and starts reading command lines from the input.
     *
     * Output needs nothing to be set up, so chat forwarding and the logger hookup happen
     * even when there is no usable input. Input is skipped when the stream is destroyed or
     * no longer readable, which is what a host that closed stdin leaves behind. A pipe that
     * stays open but never sends anything, as under the test runner, is harmless: readline
     * only pauses it again on {@link disable}.
     * @group Lifecycle
     */
    public async enable(): Promise<void> {
        // A reload enables the server again. The chat subscription must not be added twice,
        // and the flag rather than the readline covers the case where there was no input.
        if (this.enabled) return;
        this.enabled = true;

        this.server.on('chat', async (evt: ChatEvent) => {
            if (evt.isCanceled()) return;
            this.sendMessage(consoleTextOf(evt.getChat()));
        });
        this.server.getLogger().setConsole(this);

        if (!this.hasUsableInput()) return;

        this.cli = readline.createInterface({
            input: this.input,
            output: undefined,
            terminal: false,
            crlfDelay: Number.POSITIVE_INFINITY
        });

        this.cli.on('line', (input: string) => {
            if (input.trim() === '') return;

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
     * Stops reading command lines. Output keeps working through {@link write}.
     * @group Lifecycle
     */
    public async disable(): Promise<void> {
        this.cli?.close();
        this.cli?.removeAllListeners();
        this.cli = undefined;
    }

    private hasUsableInput(): boolean {
        return !this.input.destroyed && this.input.readable;
    }

    /**
     * Writes one formatted log line to stdout.
     */
    public write(line: string): void {
        process.stdout.write(`${line}\n`);
    }

    /**
     * The name commands see for the console executor.
     */
    public getName(): string {
        return 'CONSOLE';
    }

    /**
     * The console's name as shown in chat and command feedback.
     */
    public getFormattedUsername(): string {
        return '[CONSOLE]';
    }

    /**
     * Prints a message addressed to the console through the logger at info level.
     */
    public sendMessage(message: string): void {
        this.server.getLogger().info(message);
    }

    /**
     * Returns the server this console belongs to.
     */
    public getServer(): Server {
        return this.server;
    }
}
