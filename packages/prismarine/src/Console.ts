import Chat from './chat/Chat';
import ChatEvent from './events/chat/ChatEvent';
import Vector3 from './math/Vector3';
import readline from 'node:readline';

import type Entity from './entity/Entity';
import type Server from './Server';

export default class Console {
    private readonly server: Server;
    private cli: readline.Interface;
    public runtimeId = BigInt(-1);

    public constructor(server: Server) {
        this.server = server;

        // Console command reader
        readline.emitKeypressEvents(process.stdin);
        process.stdin.setEncoding('utf8');

        try {
            if (process.stdin.isTTY) process.stdin.setRawMode(true);
        } catch (error: unknown) {
            this.server.getLogger()?.warn(`Failed to enable stdin rawMode: ${error}!`);
            this.server.getLogger()?.error(error);
        }

        const completer = (line: string) => {
            const hits = Array.from(this.getServer().getCommandManager().getCommands().values())
                .filter((a) => a.id.split(':')[1]!.startsWith(line.replace('/', '')))
                .map((a) => '/' + a.id.split(':')[1]);
            return [
                hits.length
                    ? hits
                    : Array.from(this.getServer().getCommandManager().getCommands().values()).map(
                          (a) => '/' + a.id.split(':')[1]
                      ),
                line
            ];
        };

        this.cli = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: true,
            prompt: '',
            crlfDelay: Number.POSITIVE_INFINITY,
            escapeCodeTimeout: 1500,
            completer: process.stdin.isTTY ? completer : undefined
        });

        this.cli.on('line', (input: string) => {
            if (input.startsWith('/')) {
                void this.getServer()
                    .getCommandManager()
                    .dispatchCommand(this as any, this as any, input.slice(1));
                return;
            }

            const event = new ChatEvent(new Chat(this, `${this.getFormattedUsername()} ${input}`));
            void this.getServer().getEventManager().emit('chat', event);
        });

        server.getEventManager().on('chat', async (evt: ChatEvent) => {
            if (evt.isCancelled()) return;
            await this.sendMessage(evt.getChat().getMessage());
        });
    }

    public getRuntimeId(): bigint {
        return this.runtimeId;
    }

    public async onDisable(): Promise<void> {
        this.cli.close();
    }

    public getName(): string {
        return 'CONSOLE';
    }

    public getFormattedUsername(): string {
        return '[CONSOLE]';
    }

    public async sendMessage(message: string): Promise<void> {
        this.getServer().getLogger()?.info(message, 'Console');
    }

    public getWorld() {
        return this.server.getWorldManager().getDefaultWorld();
    }

    public getServer(): Server {
        return this.server;
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

    /**
     * Returns the nearest entity from the current entity
     *
     * TODO: Customizable radius
     * TODO: Generic?
     */
    public getNearestEntity(entities: Entity[] = this.server.getWorldManager().getDefaultWorld().getEntities()!) {
        const pos = new Vector3(this.getX(), this.getY(), this.getZ());
        const dist = (a: Vector3, b: Vector3) =>
            Math.hypot(b.getX() - a.getX(), b.getY() - a.getY(), b.getZ() - a.getZ());

        const closest = (target: Vector3, points: Entity[], eps = 0.00001) => {
            const distances = points.map((e) => dist(target, new Vector3(e.getX(), e.getY(), e.getZ())));
            const closest = Math.min(...distances);
            return points.find((e, i) => distances[i]! - closest < eps)!;
        };

        return [
            closest(
                pos,
                entities.filter((a) => a.getRuntimeId() !== this.getRuntimeId())
            )
        ].filter((a) => a);
    }
}
