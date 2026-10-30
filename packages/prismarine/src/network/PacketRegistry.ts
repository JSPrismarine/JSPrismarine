import * as Handlers from './Handlers';
import * as Packets from './Packets';

import type { PlayerSession } from '../';
import type Server from '../Server';
import Timer from '../utils/Timer';
import Codec2193 from './codec/Codec2193';
import { latestCodec } from './codec/CodecRegistry';
import type PacketHandler from './handler/PacketHandler';
import type ConnectionPacketHandler from './handler/ConnectionPacketHandler';

/** Either handler kind the registry holds. Which one applies depends on the phases the handler declares. */
export type RegisteredHandler = PacketHandler<any> | ConnectionPacketHandler<any>;

export default class PacketRegistry {
    private server: Pick<Server, 'getLogger'>;
    private readonly packets: Map<number, typeof Packets.DataPacket> = new Map();
    private readonly handlers: Map<string, RegisteredHandler> = new Map();

    public constructor(server: Pick<Server, 'getLogger'>) {
        this.server = server;
    }

    /**
     * On enable hook.
     * @group Lifecycle
     */
    public async enable(): Promise<void> {
        await this.registerPackets();
        await this.registerHandlers();
    }

    /**
     * On disable hook.
     * @group Lifecycle
     */
    public async disable(): Promise<void> {
        this.handlers.clear();
        this.packets.clear();
    }

    /**
     * Register a packet under the wire id its name has at the newest registered protocol.
     *
     * @param packet - the packet.
     * @param name - the packet's name in the barrel, which a bundler cannot rename the way it
     *   renames a colliding class. Defaults to the class name for callers that register one
     *   packet directly.
     */
    public registerPacket(packet: typeof Packets.DataPacket, name: string = packet.name): void {
        // Resolved against the newest codec rather than 2193's: a packet a later protocol added
        // has no id at 2193, and the barrel carries it all the same so that a session which
        // negotiated the newer version can build one.
        const netId = latestCodec.netIdOf(name);
        if (netId === undefined) throw new Error(`Packet ${name} has no id in any registered codec!`);
        if (this.packets.has(netId))
            throw new Error(`Packet ${name} is trying to use id ${netId.toString(16)} which already exists!`);

        this.packets.set(netId, packet);
        this.server.getLogger().debug(`Packet with id §b${name}§r registered`);
    }

    /**
     * Get a packet by it's network ID.
     * @param id - the NetID.
     */
    public getPacket(id: number): any {
        if (!this.packets.has(id)) throw new Error(`Invalid packet with id ${id}!`);

        return this.packets.get(id)!;
    }

    /**
     * Remove a packet from the registry.
     * @param id - the NetID.
     */
    public removePacket(id: number): void {
        this.packets.delete(id);
    }

    public registerHandler(packetName: string, handler: RegisteredHandler): void {
        if (this.handlers.has(packetName)) throw new Error(`Handler for ${packetName} already exists!`);

        this.handlers.set(packetName, handler);
        this.server
            .getLogger()
            .debug(`Handler with id §b${handler.constructor.name}§r registered`, 'PacketRegistry/registerHandler');
    }

    public getHandler(packetName: string): RegisteredHandler {
        if (!this.handlers.has(packetName)) throw new Error(`Invalid handler for packet ${packetName}!`);

        return this.handlers.get(packetName)!;
    }

    /**
     * Merge two handlers.
     * This is useful if you want to extend a handler without actually replacing it.
     *
     * @param handler - the first handler, executed first.
     * @param handler2 - the second handler.
     */
    public appendHandler(handler: PacketHandler<any>, handler2: PacketHandler<any>): PacketHandler<any> {
        const res = new (class Handler {
            /** The merged handler runs where the first one did. */
            public readonly phases = handler.phases;

            public async handle(packet: any, server: Server, session: PlayerSession) {
                await handler.handle(packet, server, session);
                await handler2.handle(packet, server, session);
            }
        })();

        return res;
    }

    /**
     * Remove a handler from the registry.
     * @param packetName - the name of the packet the handler is registered for.
     */
    public removeHandler(packetName: string): void {
        this.handlers.delete(packetName);
    }

    /**
     * Dynamically register all packets exported by './Protocol'.
     */
    private async registerPackets(): Promise<void> {
        const timer = new Timer();

        // Dynamically register packets
        // We need to manually ignore DataPacket & BatchPacket
        // Keyed by the export name rather than `value.name`: a bundler renames a class whose name
        // collides with another in the same chunk (the Bun executable gets a `DeathInfoPacket2`),
        // and the wire id is looked up by name. The export key survives bundling.
        Object.entries(Packets)
            .filter(([exported]) => exported !== 'DataPacket' && exported !== 'BatchPacket')
            .map(([exported, value]) => this.registerPacket(value, exported));

        this.server
            .getLogger()
            .verbose(
                `Registered §b${this.packets.size}§r of §b${
                    Object.keys(Codec2193.ids).length
                }§r packet(s) (took §e${timer.stop()} ms§r)!`
            );
    }

    /**
     * Dynamically register all handlers exported by './Handlers'.
     */
    private async registerHandlers(): Promise<void> {
        const timer = new Timer();

        // Dynamically register handlers
        Object.values(Handlers).forEach((Handler) => this.registerHandler(Handler.PacketName, new Handler()));

        this.server
            .getLogger()
            .verbose(`Registered §b${this.handlers.size}§r packet handler(s) (took §e${timer.stop()} ms§r)!`);
    }

    /**
     * Get all packets from the registry.
     */
    public getPackets() {
        return this.packets;
    }

    /**
     * Get all handlers from the registry.
     */
    public getHandlers() {
        return this.handlers;
    }
}
