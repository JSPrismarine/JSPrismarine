import type Prismarine from "../Prismarine";
import BinaryStream from "@jsprismarine/jsbinaryutils";
import udp from 'dgram';
import git from 'git-rev-sync';
import type PluginFile from "../plugin/PluginFile";

export default class QueryManager {
    private server?: udp.Socket;

    constructor(server: Prismarine) {
        if (!server.getConfig().getEnableQuery())
            return;

        const port = server.getConfig().getQueryPort()
        const git_rev = git.short() || 'unknown';
        this.server = udp.createSocket('udp4');

        // TODO: https://wiki.vg/Server_List_Ping
        this.server?.on('message', (data, info) => {
            const buffer = new BinaryStream(Buffer.from(data.buffer))
            const magic = buffer.readShort();
            const type = buffer.readByte();
            const sessionId = buffer.readInt() & 0x0F0F0F0F;

            if (magic !== 65277)
                return server.getLogger().silly(`Query ${magic} !== 65277. ${JSON.stringify(info)}`);

            switch (type) {
                case 0: { // Stats
                    const padding = buffer.readRemaining();
                    if (padding.length < 8) {
                        const res = new BinaryStream();
                        res.writeByte(0);
                        res.writeInt(sessionId);
                        res.append(Buffer.from(`${[
                            server.getRaknet().getName().getMotd(),
                            'SMP',
                            server.getWorldManager().getDefaultWorld()?.getName(),
                            server.getRaknet().getName().getOnlinePlayerCount(),
                            server.getRaknet().getName().getMaxPlayerCount(),
                        ].join('\0')}\0`, 'binary'));
                        this.server?.send(res.getBuffer(), info.port, info.address);
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

                        const plugins = server.getPluginManager().getPlugins().map((plugin: PluginFile) => `${plugin.getDisplayName()} ${plugin.getVersion()}`);
                        res.append(Buffer.from(`\0${[
                            'hostname',
                            server.getRaknet().getName().getMotd(),
                            'gametype',
                            'SMP',
                            'game_id',
                            'MINECRAFTPE',
                            'version',
                            server.getRaknet().getName().getVersion(),
                            'plugins',
                            `JSPrismarine on Prismarine ${server.getConfig().getVersion()}-${git_rev}${plugins.length && ': ' || ''}${plugins.join('; ')}`, // TODO
                            'map',
                            server.getWorldManager().getDefaultWorld()?.getName(),
                            'numplayers',
                            server.getRaknet().getName().getOnlinePlayerCount(),
                            'maxplayers',
                            server.getRaknet().getName().getMaxPlayerCount(),
                            'hostport',
                            server.getConfig().getPort(),
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

                        res.append(Buffer.from(`${server.getOnlinePlayers().map(player => `${player.getUsername()}\0`)}\0`, 'binary'));
                        this.server?.send(res.getBuffer(), info.port, info.address);
                    }
                    break;
                } case 9: { // Handshake
                    const res = new BinaryStream();
                    res.writeByte(9);
                    res.writeInt(sessionId);
                    res.append(Buffer.from(`9513307\0`, 'binary'));
                    this.server?.send(res.getBuffer(), info.port, info.address);
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
