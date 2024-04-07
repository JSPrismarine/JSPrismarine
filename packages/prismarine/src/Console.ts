import Chat from './chat/Chat';
import ChatEvent from './events/chat/ChatEvent';
import Vector3 from './math/Vector3';
import readline from 'node:readline';

import { EntityLike } from './entity/Entity';
import type Server from './Server';

export default class Console extends EntityLike {
    protected readonly runtimeId: bigint;
    protected readonly server: Server;
    private cli: readline.Interface;

    public constructor(server: Server, runtimeId = BigInt(-1)) {
        super(runtimeId, server);
        this.runtimeId = runtimeId;
        this.server = server;

        // Console command reader
        readline.emitKeypressEvents(process.stdin);

        try {
            (process as any).stdin.setRawMode?.(true);
        } catch (error: unknown) {
            this.server.getLogger().warn(`Failed to enable stdin rawMode: ${error}!`);
            this.server.getLogger().error(error);
        }

        process.stdin.setEncoding('utf8');
        process.stdin.resume();

        this.cli = readline.createInterface({
            input: process.stdin,
            terminal: true,
            prompt: '',
            crlfDelay: Number.POSITIVE_INFINITY,
            escapeCodeTimeout: 1500
        });

        process.stdin.on('keypress', (str, key) => {
            // Handle ctrl+c
            if (key.ctrl && key.name === 'c') {
                this.getServer().shutdown();
            }
        });

        this.cli.on('line', (input: string) => {
            if (input.startsWith('/')) {
                void this.getServer()
                    .getCommandManager()
                    .dispatchCommand(this as any, this as any, input);
                return;
            }

            const event = new ChatEvent(new Chat(this, `${this.getFormattedUsername()} ${input}`));
            void this.getServer().getEventManager().emit('chat', event);
            this.cli.prompt();
        });

        server.getEventManager().on('chat', async (evt: ChatEvent) => {
            if (evt.isCancelled()) return;
            await this.sendMessage(evt.getChat().getMessage());
        });
    }

    public async onDisable(): Promise<void> {
        this.cli.close();
        this.cli.removeAllListeners();

        process.stdin.removeAllListeners();
        process.stdin.destroy();
        process.stdout.removeAllListeners();
        process.stdout.destroy();
    }

    public getName(): string {
        return 'CONSOLE';
    }

    public getFormattedUsername(): string {
        return '[CONSOLE]';
    }

    public async sendMessage(message: string): Promise<void> {
        this.getServer().getLogger().info(message, 'Console');
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
