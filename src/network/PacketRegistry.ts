import fs from 'fs';
import path from 'path';
import type Prismarine from '../Prismarine';

export default class PacketRegistry {
    private packets: Map<number, any> = new Map();
    private handlers: Map<number, any> = new Map();

    constructor(server: Prismarine) {
        this.loadPackets(server);
        this.loadHandlers(server);
    }

    private registerPacket(packet: any, server: Prismarine): void {
        this.packets.set(packet.NetID, packet);
        server
            .getLogger()
            .silly(`Packet with id §b${packet.name}§r registered`);
    }

    private registerHandler(handler: any, server: Prismarine): void {
        this.handlers.set(handler.NetID, handler);
        server
            .getLogger()
            .silly(`Handler with id §b${handler.name}§r registered`);
    }

    private loadPackets(server: Prismarine): void {
        const time = Date.now();
        let dir = path.join(__dirname + '/packet');
        fs.readdir(dir, (err: Error | null, files: string[]) => {
            if (err)
                return server.getLogger().error(`Cannot load packets: ${err}`);

            // Exclude test files
            files = files.filter(
                (a) => !a.includes('.test.') && !a.includes('.d.ts')
            );
            for (let i = 0; i < files.length; i++) {
                let packet = require(path.join(dir, files[i]));
                this.registerPacket(packet.default || packet, server);
            }
            server
                .getLogger()
                .debug(
                    `Registered §b${this.packets.size}§r packet(s) (took ${
                        Date.now() - time
                    } ms)!`
                );
        });
    }

    private loadHandlers(server: Prismarine): void {
        const time = Date.now();
        let dir = path.join(__dirname + '/handler');
        fs.readdir(dir, (err: Error | null, files: string[]) => {
            if (err)
                return server
                    .getLogger()
                    .error(`Cannot load packet handlers: ${err}`);

            // Exclude test files
            files = files.filter(
                (a) => !a.includes('.test.') && !a.includes('.d.ts')
            );

            for (let i = 0; i < files.length; i++) {
                let handler = require(path.join(dir, files[i]));
                this.registerHandler(handler.default || handler, server);
            }
            server
                .getLogger()
                .debug(
                    `Registered §b${
                        this.handlers.size
                    }§r packet handler(s) (took ${Date.now() - time} ms)!`
                );
        });
    }

    public getPackets() {
        return this.packets;
    }

    public getHandlers() {
        return this.handlers;
    }
}
