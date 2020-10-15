import Prismarine from "../prismarine";
import udp from 'dgram';

export default class QueryManager {
    private server?: udp.Socket;

    constructor(server?: Prismarine) {
        if (!server)
            return;
        if (!server.getConfig().get('enable-query', true))
            return;

        // TODO: setup query
        const port = server.getConfig().get('query-port', 25565)
        this.server = udp.createSocket('udp4');

        this.server?.on('message', (message, info) => {
            const buffer = Buffer.from(message.buffer);
            const magic = buffer.readUInt16BE(0);
            const type = buffer.readUInt8(2);
            const sessionId = buffer.readInt32BE();
            // TODO: Safeguard trying to read full stat
            // TODO: handle full stat by reading padding

            if (magic !== 65277)
                return server.getLogger().silly(`Query ${magic} !== 65277. ${JSON.stringify(info)}`);

            switch (type) {
                case 0: { // Stats
                    let res = Buffer.alloc(5);
                    res.writeUInt8(0);
                    res.writeInt32BE(0);
                    res = Buffer.concat([res, Buffer.from(`${server.getRaknet().name.getMotd()}\0`, 'binary')]);
                    res = Buffer.concat([res, Buffer.from('SMP\0', 'binary')]);
                    res = Buffer.concat([res, Buffer.from(`${server.getWorldManager().getDefaultWorld()?.getName()}\0`, 'binary')]);
                    res = Buffer.concat([res, Buffer.from(`${server.getRaknet().name.getOnlinePlayerCount()}\0`, 'binary')]);
                    res = Buffer.concat([res, Buffer.from(`${server.getRaknet().name.getMaxPlayerCount()}\0`, 'binary')]);
                    this.server?.send(res, info.port, info.address);
                    break;
                } case 9: { // Handshake
                    const buffer = Buffer.alloc(7);
                    buffer.writeUInt8(9);
                    buffer.writeInt32BE(sessionId);
                    buffer.writeInt32BE(9513307);
                    this.server?.send(buffer, info.port, info.address);
                    break;
                }
            };
        });

        this.server.bind(port);
        server.getLogger().info(`JSPrismarine query is now listening port §b${port}`);
    }
};
