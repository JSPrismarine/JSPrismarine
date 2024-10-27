import { Vector3 } from '@jsprismarine/math';
import type { Server, Service } from './';
import { EntityLike } from './entity/';
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

/**
 * Server console.
 */
export default class Console extends EntityLike implements Service {
    private cli?: readline.Interface;

    public constructor(server: Server, runtimeId = BigInt(-1)) {
        const world = server.getWorldManager().getDefaultWorld()!;
        super({
            server,
            runtimeId,
            world
        });
    }

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
        process.stdin.setNoDelay(true);
        process.stdin.setKeepAlive(true);
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
            await this.sendMessage(evt.getChat().getMessage());
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

            void this.server.getCommandManager().dispatchCommand(this as any, this as any, input);
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
        return '[CONSOLE]';
    }

    public async sendMessage(message: string): Promise<void> {
        this.server.getLogger().info(message);
    }

    public getWorld() {
        return this.server.getWorldManager().getDefaultWorld()!;
    }

    public isPlayer(): boolean {
        return false;
    }

    public isOp(): boolean {
        return true;
    }

    public getX(): number {
        return 0;
    }
    public getY(): number {
        return 0;
    }
    public getZ(): number {
        return 0;
    }

    public getPosition(): Vector3 {
        return new Vector3(0, 0, 0);
    }

    public getType() {
        return 'jsprismarine:console';
    }

    public isConsole(): boolean {
        return true;
    }
}
