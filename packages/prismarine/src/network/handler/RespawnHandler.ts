import type Server from '../../Server';
import type PlayerSession from '../PlayerSession';
import type RespawnPacket from '../packet/RespawnPacket';
import { PlayerRespawnState } from '../packet/RespawnPacket';
import type PacketHandler from './PacketHandler';

/**
 * The client's half of the respawn exchange.
 *
 * Three states across two sides. The docs number them `SearchingForSpawn` (0) and
 * `ReadyToSpawn` (1) for the server and `ClientReadyToSpawn` (2) for the client. A Bedrock
 * Dedicated Server 1.26.52 runs a death like this, recorded through the proxy:
 *
 * 1. the player dies, and the server sends `SearchingForSpawn` with where they will
 *    reappear - the client will not offer the respawn button until it has this;
 * 2. the player presses it, and the client sends `ClientReadyToSpawn`;
 * 3. the server answers at once with `SearchingForSpawn` at the spawn block, then
 *    `ReadyToSpawn` at the eyes above it, and the client puts its player there;
 * 4. the client sends a `Respawn` player action, and the server sends the living player:
 *    see `Player.respawn`.
 *
 * Getting step 3 wrong leaves the client frozen. Answered with `ReadyToSpawn` alone, at the
 * spawn block's height rather than the eyes', and followed by the dead player's health, the
 * client sent nothing more: no movement, no input, for as long as it stayed connected.
 * @see https://github.com/pmmp/PocketMine-MP/blob/stable/src/network/mcpe/handler/DeathPacketHandler.php
 */
export default class RespawnHandler implements PacketHandler<RespawnPacket> {
    public static PacketName = 'RespawnPacket';
    public readonly phases = ['play'] as const;

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
        if (packet.state !== PlayerRespawnState.ClientReadyToSpawn) return;

        if (!player.isAlive()) {
            const point = await player.getRespawnPoint();
            await session.sendRespawn(point.block, PlayerRespawnState.SearchingForSpawn);
            await session.sendRespawn(point.eyes, PlayerRespawnState.ReadyToSpawn);
            return;
        }

        // Already alive: the respawn action came first. How a Bedrock Dedicated Server answers
        // this order has not been recorded, so the player is told where they stand and
        // described again, as this server did before.
        await session.sendRespawn(player.getPosition(), PlayerRespawnState.ReadyToSpawn);
        await session.sendAttributes();
        await session.sendMetadata();
        await session.sendAbilities();
        await session.sendInventory();
    }
}
