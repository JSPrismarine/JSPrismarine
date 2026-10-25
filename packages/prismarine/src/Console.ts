import type { Server, Service } from './';
import type { CommandExecutor } from './command/CommandExecutor';
import { consoleTextOf } from './chat/ConsoleText';
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

/** The byte a terminal in raw mode sends for Ctrl+C, in place of raising a signal. */
const END_OF_TEXT = 0x03;

/**
 * How many interrupts one chunk of raw terminal input holds.
 *
 * In raw mode Ctrl+C is not a signal. Node's tty documentation says of `setRawMode` that
 * "Ctrl+C will no longer cause a SIGINT when in this mode", and under a real pty the keypress
 * arrives as this one byte with nothing else happening at all. So stdin, and not a signal
 * handler, is where an interrupt lands whenever a terminal is attached.
 *
 * More than one in a chunk is the case worth counting. The byte waits in the terminal's buffer
 * until the event loop next polls, and the whole reason an operator is pressing Ctrl+C is that
 * the loop is busy generating terrain - so the presses arrive together, in a single read,
 * seconds after the last of them. Measured on a server preloading a start region: twelve
 * seconds between the keypress and the read that collected it. Treating that read as one press
 * loses every press but the first, and the second press is the one that forces an exit.
 * @param chunk - What stdin just read.
 * @returns {number} The number of Ctrl+C presses in it.
 */
export const countInterrupts = (chunk: Uint8Array): number =>
    chunk.reduce<number>((count, byte) => count + (byte === END_OF_TEXT ? 1 : 0), 0);

/** The one event a readline interface reports a Ctrl+C on. */
export interface InterruptSource {
    on(event: 'SIGINT', listener: () => void): unknown;
}

/**
 * Stops a readline interface from closing itself the first time Ctrl+C is pressed.
 *
 * readline parses byte 3 too and emits `SIGINT` - but only when something is listening. With
 * no listener it closes the interface instead, and a closed interface never reads stdin again.
 * That is the reported "input stops working": one Ctrl+C took the console down and left the
 * server running, and the keypress handler that was meant to start a shutdown never ran at
 * all, because closing removed it first.
 *
 * The listener has nothing to do because {@link countInterrupts} already acted on the same
 * byte. Reading stdin directly is what survives this interface being closed by the shutdown
 * that the first press started, which is where the second press has to still be heard.
 * @param cli - The interface reading the terminal.
 */
export const keepOpenThroughInterrupts = (cli: InterruptSource): void => {
    cli.on('SIGINT', () => {});
};

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
 * Server console.
 */
export default class Console implements CommandExecutor, Service {
    private cli?: readline.Interface;

    /** The stdin reader that counts Ctrl+C, held so {@link Console.disable} can take it off. */
    private interrupts?: (chunk: Buffer) => void;

    public constructor(private readonly server: Server) {}

    /**
     * One Ctrl+C, whichever press it is.
     *
     * What the second one means is `Server.shutdown`'s to decide and not this console's, so
     * every press is the same call. See `Server.forceExit`.
     */
    private interrupt(): void {
        this.server.shutdown().catch((error: unknown) => {
            this.server.getLogger().error(error);
        });
    }

    /**
     * On enable hook.
     * @group Lifecycle
     */
    public async enable(): Promise<void> {
        // Make sure we don't enable the console twice.
        if (this.cli) return;

        if (typeof process.stdin.setRawMode !== 'function') {
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
            if (evt.isCanceled()) return;
            this.sendMessage(consoleTextOf(evt.getChat()));
        });
        this.server.getLogger().setConsole(this);

        // Read off stdin rather than through readline, for the two reasons on
        // `countInterrupts` and `keepOpenThroughInterrupts`: a read can carry several presses,
        // and the first of them closes the interface.
        this.interrupts = (chunk: Buffer) => {
            for (let presses = countInterrupts(chunk); presses > 0; presses--) this.interrupt();
        };
        process.stdin.on('data', this.interrupts);
        keepOpenThroughInterrupts(this.cli);

        // Raw mode is what put the interrupt on stdin to begin with, and it is what stops the
        // kernel killing this process on the next one. Handing it back the moment a shutdown
        // begins makes a later Ctrl+C a signal again - one that arrives whether or not the
        // event loop is free, which during world generation it is not. See
        // `Server.releaseOnShutdown`.
        this.server.releaseOnShutdown(() => {
            if (process.stdin.isRaw) process.stdin.setRawMode?.(false);
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
        if (this.interrupts) process.stdin.off('data', this.interrupts);
        this.interrupts = undefined;
        this.cli?.close();
        this.cli?.removeAllListeners();
    }

    private complete(line: string, callback: (err?: null | Error, result?: CompleterResult) => void): void {
        const names = Array.from(this.server.getCommandManager().getCommands().values()).map((command) => command.name);

        // TODO: Handle arguments.
        callback(null, completeCommand(names, line));
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
