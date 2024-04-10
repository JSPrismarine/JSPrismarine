import { Chat } from './chat/Chat';
import ChatEvent from './events/chat/ChatEvent';
import Vector3 from './math/Vector3';
import readline from 'node:readline';

import { EntityLike } from './entity/Entity';
import type Server from './Server';

// Extend `readline.Interface` type
declare module 'node:readline' {
    interface Interface {
        setRawMode?(mode: boolean): void;
        output: {
            write: (data: string) => void;
        };
        input: any;
        _refreshLine: () => void;
    }
}

export default class Console extends EntityLike {
    public readonly cli: readline.Interface;

    public constructor(server: Server, runtimeId = BigInt(-1)) {
        super(runtimeId, server);

        process.stdin.setRawMode?.(true);

        this.cli = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: true,
            prompt: '> ',
            crlfDelay: Number.POSITIVE_INFINITY,
            escapeCodeTimeout: 1500
        });

        this.cli.on('keypress', async (_, key) => {
            console.log(key);
            switch (key.name) {
                case 'c': {
                    if (key.ctrl) {
                        await this.getServer().shutdown();
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

            // Prevent double prompt, this only occurs when using nodemon.
            // this.cli.output.write(`\x1b[1A`);

            // Handle commands.
            if (input.startsWith('/')) {
                void this.getServer()
                    .getCommandManager()
                    .dispatchCommand(this as any, this as any, input);
                return;
            }

            void this.getServer().emit(
                'chat',
                new ChatEvent(
                    new Chat({
                        sender: this,
                        message: `${this.getFormattedUsername()} ${input}`
                    })
                )
            );
        });

        this.cli.on('close', async () => await this.server.shutdown());

        this.server.on('chat', async (evt: ChatEvent) => {
            if (evt.isCancelled()) return;
            await this.sendMessage(evt.getChat().getMessage());
        });
        this.server.getLogger().setConsole(this);
    }

    public async onEnable(): Promise<void> {}

    public async onDisable(isReload: boolean = false): Promise<void> {
        if (!isReload) return;

        this.cli.removeAllListeners();
        this.cli.close();
    }

    public write(line: string): void {
        // Remove the prompt that's prefixed when logging.
        this.cli.output.write(`\x1b[${this.cli.getPrompt().length}D`);

        // Write the line.
        this.cli.output.write(`${line}\n\r`);

        this.cli._refreshLine();
        this.cli.prompt();
    }

    public getName(): string {
        return 'CONSOLE';
    }

    public getFormattedUsername(): string {
        return '[CONSOLE]';
    }

    public async sendMessage(message: string): Promise<void> {
        this.getServer().getLogger().info(message);
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
        return new Vector3();
    }

    public getType() {
        return 'jsprismarine:console';
    }

    public isConsole(): boolean {
        return true;
    }
}
