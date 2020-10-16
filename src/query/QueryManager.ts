import type Prismarine from "../Prismarine";
import BinaryStream from "@jsprismarine/jsbinaryutils";
import udp from 'dgram';

export default class QueryManager {
    private server?: udp.Socket;

    constructor(server: Prismarine) {
        if (!server.getConfig().getEnableQuery())
            return;

        // TODO: setup query
        const port = server.getConfig().getQueryPort()
        this.server = udp.createSocket('udp4');

        // TODO: https://wiki.vg/Server_List_Ping
        this.server?.on('message', (data, info) => {
            const buffer = new BinaryStream(Buffer.from(data.buffer))
            const magic = buffer.readShort();
            const type = buffer.readByte();
            const sessionId = buffer.readInt();

            console.log({ magic, type, sessionId });

            if (magic !== 65277)
                return server.getLogger().silly(`Query ${magic} !== 65277. ${JSON.stringify(info)}`);

            switch (type) {
                case 0: { // Stats
                    const padding = buffer.readRemaining();
                    if (padding.length < 8) {
                        // TODO: use bonary stream
                        let res = Buffer.alloc(5);
                        res.writeUInt8(0);
                        res.writeInt32BE(0);
                        res = Buffer.concat([res, Buffer.from(`${server.getRaknet().name.getMotd()}\0`, 'binary')]);
                        res = Buffer.concat([res, Buffer.from('SMP\0', 'binary')]);
                        res = Buffer.concat([res, Buffer.from(`${server.getWorldManager().getDefaultWorld()?.getName()}\0`, 'binary')]);
                        res = Buffer.concat([res, Buffer.from(`${server.getRaknet().name.getOnlinePlayerCount()}\0`, 'binary')]);
                        res = Buffer.concat([res, Buffer.from(`${server.getRaknet().name.getMaxPlayerCount()}\0`, 'binary')]);
                        this.server?.send(res, info.port, info.address);
                    } else {
                        const res = new BinaryStream();
                        res.writeByte(0);
                        // padding
                        res.writeByte(115);
                        res.writeByte(112);
                        res.writeByte(108);
                        res.writeByte(105);
                        res.writeByte(116);
                        res.writeByte(110);
                        res.writeByte(117);
                        res.writeByte(109);
                        res.writeByte(0);
                        res.writeByte(128);
                        res.writeByte(0);

                        // End padding
                        res.append(Buffer.from(`\0${[
                            'hostname',
                            server.getRaknet().name.getMotd(),
                            'gametype',
                            'SMP',
                            'game_id',
                            'MINECRAFT',
                            'version',
                            '', // TODO
                            'plugins',
                            'JSPrismarine:', // TODO
                            'map',
                            server.getWorldManager().getDefaultWorld()?.getName(),
                            'numplayers',
                            server.getRaknet().name.getOnlinePlayerCount(),
                            'maxplayers',
                            server.getRaknet().name.getMaxPlayerCount(),
                            'hostport',
                            server.getConfig().getQueryPort(),
                            'hostip',
                            server.getConfig().getServerIp()
                        ].join('\0')}\0\0`, 'binary'));

                        // padding
                        res.writeByte(1);
                        res.writeByte(112);
                        res.writeByte(108);
                        res.writeByte(97);
                        res.writeByte(121);
                        res.writeByte(101);
                        res.writeByte(114);
                        res.writeByte(95);
                        res.writeByte(0);
                        res.writeByte(0);
                        // End padding

                        res.append(Buffer.from(`${server.getOnlinePlayers().map(player => `${player.name}\0`)}\0\0`, 'binary'));
                        this.server?.send(res.getBuffer(), info.port, info.address);
                    }
                    break;
                } case 9: { // Handshake
                    // TODO: use binary stream
                    const buffer = Buffer.alloc(7);
                    buffer.writeUInt8(9);
                    buffer.writeInt32BE(sessionId);
                    buffer.writeInt32BE(9513307);
                    this.server?.send(buffer, info.port, info.address);
                    break;
                }
            };
        });

        try {
            this.server.bind(port, server.getConfig().getServerIp());
            server.getLogger().info(`JSPrismarine query is now listening port §b${port}`);
        } catch (err) {
            server.getLogger().warn(`Failed to bind port ${port} for query: ${err}`);
        }
    }
};
