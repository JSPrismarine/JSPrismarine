import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import type RespawnPacket from '../packet/RespawnPacket';
import { RespawnState } from '../packet/RespawnPacket';
import type PacketHandler from './PacketHandler';

/**
 * The client's half of the respawn exchange, and the end of it.
 *
 * Three states across two sides. The docs number them `SearchingForSpawn` (0) and
 * `ReadyToSpawn` (1) for the server and `ClientReadyToSpawn` (2) for the client:
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
 *
 * Steps 2 and 3 are the client's to order, so the answer does not assume one. Its `Position`
 * is where the player comes back: where they stand once `Player.respawn` has moved them, and
 * the world spawn while they are still dead.
 * @see https://github.com/pmmp/PocketMine-MP/blob/stable/src/network/mcpe/handler/DeathPacketHandler.php
 */
export default class RespawnHandler implements PacketHandler<RespawnPacket> {
    public static NetID = Identifiers.RespawnPacket;

    public async handle(packet: RespawnPacket, server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();

        // `Player Runtime Id` names the player respawning, and a client only respawns itself.
        if (packet.runtimeEntityId !== player.getRuntimeId()) {
            server
                .getLogger()
                .debug(`${player.getName()} sent a Respawn for runtime id ${packet.runtimeEntityId}, dropped`);
            return;
        }

        // The other two states are the server's own; a client echoing one back is not asking
        // for anything.
        if (packet.state !== RespawnState.CLIENT_READY_TO_SPAWN) return;

        const position = player.isAlive() ? player.getPosition() : await player.getWorld().getSpawnPosition();
        await session.sendRespawn(position, RespawnState.SERVER_READY_TO_SPAWN);

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
