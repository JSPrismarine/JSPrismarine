import BinaryStream from '@jsprismarine/jsbinaryutils';
import git from 'git-rev-sync';
import type InetAddress from '../network/raknet/utils/InetAddress';
import PluginFile from '../plugin/PluginFile';
import Server from '../Server';

export enum QueryType {
    Handshake = 0,
    Stats = 9
}

export default class QueryManager {
    private readonly server: Server;
    public git_rev: string;

    constructor(server: Server) {
        this.server = server;

        try {
            this.git_rev = git.short() || 'unknown';
        } catch {
            this.git_rev = 'unknown;';
        }
    }

    public async onRaw(buffer: Buffer, rinfo: InetAddress): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const stream = new BinaryStream(buffer);
            const magic = stream.readShort();
            const type: QueryType = stream.readByte();
            const sessionId = stream.readInt() & 0x0f0f0f0f;

            if (magic !== 65277) return reject(new Error('Invalid magic'));

            switch (type) {
                case QueryType.Handshake: {
                    // Handshake
                    const res = new BinaryStream();
                    res.writeByte(9);
                    res.writeInt(sessionId);
                    res.append(Buffer.from(`9513307\0`, 'binary'));
                    this.server
                        .getRaknet()
                        .sendBuffer(
                            res.getBuffer(),
                            rinfo.getAddress(),
                            rinfo.getPort()
                        );
                    return resolve(res.getBuffer());
                }

                case QueryType.Stats: {
                    const res = new BinaryStream();
                    res.writeByte(0);
                    // Padding
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

                    const plugins = this.server
                        .getPluginManager()
                        .getPlugins()
                        .map(
                            (plugin: PluginFile) =>
                                `${plugin.getDisplayName()} ${plugin.getVersion()}`
                        );
                    res.append(
                        Buffer.from(
                            `\0${[
                                'hostname',
                                this.server.getRaknet().getName().getMotd(),
                                'gametype',
                                'SMP',
                                'game_id',
                                'MINECRAFTPE',
                                'version',
                                this.server.getRaknet().getName().getVersion(),
                                'plugins',
                                `JSPrismarine on Prismarine ${this.server
                                    .getConfig()
                                    .getVersion()}-${this.git_rev}${
                                    (plugins.length && ': ') || ''
                                }${plugins.join('; ')}`, // TODO
                                'map',
                                this.server
                                    .getWorldManager()
                                    .getDefaultWorld()
                                    ?.getName(),
                                'numplayers',
                                this.server
                                    .getRaknet()
                                    .getName()
                                    .getOnlinePlayerCount(),
                                'maxplayers',
                                this.server
                                    .getRaknet()
                                    .getName()
                                    .getMaxPlayerCount(),
                                'hostport',
                                this.server.getConfig().getPort(),
                                'hostip',
                                this.server.getConfig().getServerIp()
                            ].join('\0')}\0\0`,
                            'binary'
                        )
                    );

                    // Padding
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

                    res.append(
                        Buffer.from(
                            `${this.server
                                .getOnlinePlayers()
                                .map(
                                    (player) => `${player.getUsername()}\0`
                                )}\0`,
                            'binary'
                        )
                    );
                    this.server
                        .getRaknet()
                        .sendBuffer(
                            res.getBuffer(),
                            rinfo.getAddress(),
                            rinfo.getPort()
                        );

                    return resolve(res.getBuffer());
                }

                default:
                    throw new Error('Invalid QueryType');
            }
        });
    }
}
