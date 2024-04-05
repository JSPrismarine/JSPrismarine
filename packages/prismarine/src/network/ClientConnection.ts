import type { Logger, Player, Server } from '../';
import { PlayerSession } from '../';

import { BatchPacket, DisconnectPacket } from './Packets';
import MinecraftSession from './MinecraftSession';
import type { RakNetSession } from '@jsprismarine/raknet';
import assert from 'assert';
import { NetworkBinaryStream } from '@jsprismarine/protocol';
import PacketRegistry2 from './PacketRegistry2';

/**
 * Handles the connection before the player creation itself, very helpful as
 * it helps to not waste resources in case the client trying to connect is simply
 * outdated or sends invalid data during the login handshake.
 */
export default class ClientConnection extends MinecraftSession {
    private playerSession: PlayerSession | null = null;
    private hasCompression = false;

    public constructor(session: RakNetSession, logger?: Logger) {
        super(session, logger);
    }

    public handleRawPacket(buffer: Buffer): void {
        const batch = new BatchPacket(buffer);
        batch.compressed = this.hasCompression;
        (async () => {
            const buffers = await batch.asyncDecode();
            for (const buffer of buffers) {
                try {
                    this.handldeNetworkPacket(buffer);
                } catch (error) {
                    throw error;
                }
            }
        }).bind(this)();
    }

    private handldeNetworkPacket(buffer: Buffer): void {
        const packet = PacketRegistry2.getPacket(buffer.readUint8());
        packet.deserialize(new NetworkBinaryStream(buffer));
        PacketRegistry2.getHandler(packet.id)?.handle(packet, Server.instance, this as any);
    }

    /**
     * @internal
     *
     * @param server - the server instance
     * @param player - the player instance
     * @returns the new player session
     */
    public initPlayerConnection(server: Server, player: Player): PlayerSession {
        assert(this.playerSession === null, 'Player session was already created');

        this.playerSession = new PlayerSession(server, this, player);
        return this.playerSession;
    }

    public disconnect(reason = 'disconnect.disconnected', hideReason = true): void {
        const packet = new DisconnectPacket();
        packet.skipMessage = hideReason;
        packet.message = reason;
        void this.sendDataPacket(packet);

        // Force RakNet to remove the session
        // so we don't have to handle the dead session
        this.rakSession.disconnect();
    }

    public getPlayerSession(): PlayerSession | null {
        return this.playerSession;
    }

    public getRakNetSession(): RakNetSession {
        return this.rakSession;
    }
}
