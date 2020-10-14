const fs = require('fs');
const path = require('path');
const logger = require('../utils/Logger');


export default class PacketRegistry {
    private packets: Map<Number, any> = new Map();
    private handlers: Map<number, any> = new Map()

    constructor() {
        this.loadPackets();
        this.loadHandlers();
    }

    private registerPacket(packet: any): void {
        this.packets.set(packet.NetID, packet);
    }

    private registerHandler(handler: any): void {
        this.handlers.set(handler.NetID, handler);
    }

    private loadPackets(): void {
        let dir = path.join(__dirname + '/packet');
        fs.readdir(dir, (err: Error, files: string[]) => {
            if (err) logger.error(`Cannot load packets: ${err}`);

            files = files.filter(a => !a.includes('.test.') && !a.includes('.d.ts')); // Exclude test files

            for (let i = 0; i < files.length; i++) {
                let packet = require(path.join(dir, files[i]));  // TODO: import when convert to TS
                this.registerPacket(packet.default || packet);
            }
            logger.debug(`Loaded §b${this.packets.size}§r Minecraft packets!`);
        });
    }

    private loadHandlers(): void {
        let dir = path.join(__dirname + '/handler');
        fs.readdir(dir, (err: Error, files: string[]) => {
            if (err) logger.error(`Cannot load packets: ${err}`);

            files = files.filter(a => !a.includes('.test.') && !a.includes('.d.ts')); // Exclude test files

            for (let i = 0; i < files.length; i++) {
                let handler = require(path.join(dir, files[i]));  // TODO: import when convert to TS
                this.registerHandler(handler.default || handler);
            }
            logger.debug(`Loaded §b${this.handlers.size}§r packet handlers!`);
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
