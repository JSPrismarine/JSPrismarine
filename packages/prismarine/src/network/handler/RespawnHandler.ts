import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import type RespawnPacket from '../packet/RespawnPacket';
import { RespawnState } from '../packet/RespawnPacket';
import type PacketHandler from './PacketHandler';

/**
 * The client's half of the respawn exchange, and the end of it.
 *
 * Three states across two sides, in this order:
 *
 * 1. the player dies, and the server sends `SERVER_SEARCHING_FOR_SPAWN` with where they will
 *    reappear - the client will not offer the respawn button until it has this;
 * 2. the player presses it, and the client sends a `RESPAWN` player action, which is where
 *    the server puts them back together;
 * 3. the client sends `CLIENT_READY_TO_SPAWN` once it has loaded, and the server answers
 *    `SERVER_READY_TO_SPAWN` - which is this, and which is what lets go of the screen.
 *
 * Getting the order wrong is not a small mistake. Sending the third at step one leaves the
 * client on "Respawning" for ever, and sending nothing at step three leaves it there too,
 * repeating the request once a second.
 * @see https://github.com/pmmp/PocketMine-MP/blob/stable/src/network/mcpe/handler/DeathPacketHandler.php
 */
export default class RespawnHandler implements PacketHandler<RespawnPacket> {
    public static NetID = Identifiers.RespawnPacket;

    public async handle(packet: RespawnPacket, _server: Server, session: PlayerSession): Promise<void> {
        // The other two states are the server's own; a client echoing one back is not asking
        // for anything.
        if (packet.state !== RespawnState.CLIENT_READY_TO_SPAWN) return;

        await session.sendRespawn(session.getPlayer().getPosition(), RespawnState.SERVER_READY_TO_SPAWN);

        // And then the player, described again from scratch.
        //
        // The client rebuilds its local player across this exchange and comes back with the
        // one it had before - which is a corpse: no health, no held item, lying down. What was
        // sent when the button was pressed went to a client that was still on its death screen
        // and threw it away. This is the first moment it will keep any of it.
        await session.sendAttributes();
        await session.sendMetadata();
        await session.sendAbilities();
        await session.sendInventory();
    }
}
