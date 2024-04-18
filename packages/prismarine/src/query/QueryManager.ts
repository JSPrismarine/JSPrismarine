import BinaryStream from '@jsprismarine/jsbinaryutils';
import type { InetAddress } from '@jsprismarine/raknet';
import type Server from '../Server';

export enum QueryType {
    Handshake = 0,
    Stats = 9
}

export class QueryManager {
    private readonly server: Server;

    public constructor(server: Server) {
        this.server = server;
    }

    public async onRaw(buffer: Buffer, rinfo: InetAddress): Promise<Buffer> {
        return new Promise(async (resolve, reject) => {
            const stream = new BinaryStream(buffer);
            const magic = stream.readUnsignedShort();
            const type: QueryType = stream.readByte();
            const sessionId = stream.readInt() & 0x0f0f0f0f;

            if (magic !== 65277) {
                reject(new Error('Invalid magic'));
                return;
            }

            switch (type) {
                case QueryType.Handshake: {
                    // Handshake
                    const res = new BinaryStream();
                    res.writeByte(9);
                    res.writeInt(sessionId);
                    res.write(Buffer.from(`9513307\0`, 'binary'));
                    this.server.getRaknet().sendBuffer(res.getBuffer(), {
                        address: rinfo.getAddress(),
                        port: rinfo.getPort(),
                        family: 'IPv4',
                        size: 0
                    });
                    resolve(res.getBuffer());
                    return;
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

                    const plugins: string[] = [];
                    res.write(
                        Buffer.from(
                            `\0${[
                                'hostname',
                                this.server.getMetadata().getMotd(),

                                'gametype',
                                'SMP',
                                'game_id',
                                'MINECRAFTPE',
                                'version',
                                this.server.getVersion(),
                                'plugins',
                                `JSPrismarine on Prismarine ${this.server.getVersion()} ${plugins.join('; ')}`, // TODO
                                'map',
                                this.server.getWorldManager().getDefaultWorld()!.getName(),
                                'numplayers',
                                this.server.getMetadata().getOnlinePlayerCount(),
                                'maxplayers',
                                this.server.getMetadata().getMaxPlayerCount(),
                                'hostport',
                                this.server.getConfig().getServerPort(),
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

                    res.write(
                        Buffer.from(
                            `${this.server
                                .getSessionManager()
                                .getAllPlayers()
                                .map((player) => `${player.getName()}\0`)}\0`,
                            'binary'
                        )
                    );
                    this.server.getRaknet().sendBuffer(res.getBuffer(), {
                        address: rinfo.getAddress(),
                        port: rinfo.getPort(),
                        family: 'IPv4',
                        size: 0
                    });

                    resolve(res.getBuffer());
                    return;
                }
                default:
                    throw new Error('Invalid QueryType');
            }
        });
    }
}
