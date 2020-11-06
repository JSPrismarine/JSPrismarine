import Prismarine from '../Prismarine';

const fs = require('fs');
const path = require('path');
const logger = require('../utils/Logger');

export default class PacketRegistry {
    private packets: Map<Number, any> = new Map();
    private handlers: Map<number, any> = new Map();

    constructor(server: Prismarine) {
        this.loadPackets(server);
        this.loadHandlers(server);
    }

    private registerPacket(packet: any): void {
        this.packets.set(packet.NetID, packet);
    }

    private registerHandler(handler: any): void {
        this.handlers.set(handler.NetID, handler);
    }

    private loadPackets(server: Prismarine): void {
        const time = Date.now();
        let dir = path.join(__dirname + '/packet');
        fs.readdir(dir, (err: Error, files: string[]) => {
            if (err)
                return server.getLogger().error(`Cannot load packets: ${err}`);

            // Exclude test files
            files = files.filter(
                (a) => !a.includes('.test.') && !a.includes('.d.ts')
            );
            for (let i = 0; i < files.length; i++) {
                let packet = require(path.join(dir, files[i]));
                this.registerPacket(packet.default || packet);
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
        fs.readdir(dir, (err: Error, files: string[]) => {
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
                this.registerHandler(handler.default || handler);
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
module.exports = PacketRegistry;
