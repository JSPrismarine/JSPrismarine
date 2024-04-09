import type { Logger, Player } from '../';
import { Server } from '../';
import { PlayerSession } from '../';

import MinecraftSession from './MinecraftSession';
import type { RakNetSession } from '@jsprismarine/raknet';
import assert from 'assert';
import type { NetworkPacket } from '@jsprismarine/protocol';
import { DisconnectPacket } from '@jsprismarine/protocol';
import PacketRegistry2 from './PacketRegistry2';
import { DisconnectReason } from '@jsprismarine/minecraft';

/**
 * Handles the connection before the player creation itself, very helpful as
 * it helps to not waste resources in case the client trying to connect is simply
 * outdated or sends invalid data during the login handshake.
 */
export default class ClientConnection extends MinecraftSession {
    private playerSession: PlayerSession | null = null;

    public constructor(session: RakNetSession, logger?: Logger) {
        super(session, logger);
    }

    public tick(): void {
        // process underlying network layer
        super.tick();

        while (this.inPacketQueue.length > 0) {
            let packet = this.inPacketQueue.shift()!;
            this.handleNetworkPacket(packet);
        }
    }

    private handleNetworkPacket(packet: { id: number; packetData: unknown }): void {
        // TODO: proper registry impelmantation
        PacketRegistry2.getHandler(packet.id)?.handle(packet.packetData, Server.instance, this as any);
    }

    public sendNetworkPacket(packet: NetworkPacket<unknown>): void {
        this.outPacketQueue.push(packet);
        this.triggerOutputProcessing();
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

    public disconnect(message: string, reason = DisconnectReason.DISCONNECTED): void {
        // TODO: rethink this
        if (this.playerSession !== null) {
            this.playerSession.getPlayer().onDisable();
        }

        this.sendNetworkPacket(new DisconnectPacket({ reason, skipMessage: false, message }));

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
