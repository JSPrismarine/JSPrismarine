import * as Handlers from './Handlers';
import * as Packets from './Packets';

import Identifiers from './Identifiers';
import type PacketHandler from './handler/PacketHandler';
import type { PlayerSession } from '../';
import type PreLoginPacketHandler from './handler/PreLoginPacketHandler';
import type Server from '../Server';
import Timer from '../utils/Timer';

export default class PacketRegistry {
    private server: Server;
    private readonly packets: Map<number, typeof Packets.DataPacket> = new Map();
    private readonly handlers: Map<number, PacketHandler<any>> = new Map();

    public constructor(server: Server) {
        this.server = server;
    }

    public async onEnable() {
        await this.registerPackets();
        await this.registerHandlers();
    }

    public async onDisable() {
        this.handlers.clear();
        this.packets.clear();
    }

    /**
     * Register a packet.
     * @param packet - the packet.
     */
    public registerPacket(packet: typeof Packets.DataPacket): void {
        if (this.packets.has(packet.NetID))
            throw new Error(
                `Packet ${packet.name} is trying to use id ${packet.NetID.toString(16)} which already exists!`
            );

        this.packets.set(packet.NetID, packet);
        this.server.getLogger().debug(`Packet with id §b${packet.name}§r registered`);
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

    public registerHandler(id: number, handler: PacketHandler<any>): void {
        if (this.handlers.has(id)) throw new Error(`Handler with id ${id} already exists!`);

        this.handlers.set(id, handler);
        this.server
            .getLogger()
            .debug(`Handler with id §b${handler.constructor.name}§r registered`, 'PacketRegistry/registerHandler');
    }

    public getHandler(id: number): PacketHandler<any> | PreLoginPacketHandler<any> {
        if (!this.handlers.has(id)) throw new Error(`Invalid handler with id ${id.toString(16)}!`);

        return this.handlers.get(id)!;
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
            public async handle(packet: any, server: Server, session: PlayerSession) {
                await handler.handle(packet, server, session);
                await handler2.handle(packet, server, session);
            }
        })();

        return res as PacketHandler<any>;
    }

    /**
     * Remove a handler from the registry.
     * @param id - the handler id.
     */
    public removeHandler(id: number): void {
        this.handlers.delete(id);
    }

    /**
     * Dynamically register all packets exported by './Protocol'.
     */
    private async registerPackets(): Promise<void> {
        const timer = new Timer();

        // Dynamically register packets
        // We need to manually ignore DataPacket & BatchPacket
        Object.entries(Packets)
            .filter(([, value]) => value.name !== 'DataPacket' && value.name !== 'BatchPacket')
            .map(([, value]) => this.registerPacket(value));

        this.server
            .getLogger()
            .verbose(
                `Registered §b${this.packets.size}§r of §b${
                    Array.from(Object.keys(Identifiers)).length - 2
                }§r packet(s) (took §e${timer.stop()} ms§r)!`
            );
    }

    /**
     * Dynamically register all handlers exported by './Handlers'.
     */
    private async registerHandlers(): Promise<void> {
        const timer = new Timer();

        // Dynamically register handlers
        Object.entries(Handlers).map(([, value]) => this.registerHandler(value.NetID!, new (value as any)()));

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
