import type RespawnPacket from '@jsprismarine/protocol/packet/RespawnPacket';
import { PlayerRespawnState } from '@jsprismarine/minecraft';
import type { InputContext } from './HandlerContext';
import type { InputLaneHandler } from './SessionHandler';

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
 *    see `PlayerSession.respawn`.
 *
 * When the spawn is in another world, a Nether death with an Overworld bed, step 3 opens with
 * a `ChangeDimension` carrying `Respawn` set, which is what the client asks for in that case
 * (gophertunnel, `DimensionChangeRequest`), and the two answers follow in the new world.
 *
 * Getting step 3 wrong leaves the client frozen. Answered with `ReadyToSpawn` alone, at the
 * spawn block's height rather than the eyes', and followed by the dead player's health, the
 * client sent nothing more: no movement, no input, for as long as it stayed connected.
 * @see https://github.com/pmmp/PocketMine-MP/blob/stable/src/network/mcpe/handler/DeathPacketHandler.php
 */
export default class RespawnHandler implements InputLaneHandler<RespawnPacket> {
    public static PacketName = 'RespawnPacket';
    public readonly takes = 'context';
    public readonly phases = ['play'] as const;
    public readonly lane = 'input';

    public handle(packet: RespawnPacket, { session, log, step }: InputContext): undefined {
        const player = session.getPlayer();
        const data = packet.getPacketData();
        if (data === null) throw new Error('Cannot handle RespawnPacket without decoded data');

        // `Player Runtime Id` names the player respawning, and a client only respawns itself.
        if (data.runtimeEntityId !== session.runtimeId) {
            log.debug(`${session.identity.name} sent a Respawn for runtime id ${data.runtimeEntityId}, dropped`);
            return;
        }

        // The other two states are the server's own; a client echoing one back is not asking
        // for anything.
        if (data.state !== PlayerRespawnState.CLIENT_READY_TO_SPAWN) return;

        if (player.getHealth() <= 0) {
            // Deferred until slice 9 makes the respawn search a request whose answer is an input:
            // the search reads blocks that may not be loaded, and the change of world loads chunks.
            step.defer(async () => {
                // Where the player comes back: the spawn block and the eyes above it, in the world
                // the spawn is in. `PlayerSession.getRespawnPoint` asks the level's search and
                // clears a spawn point that no longer holds.
                const point = await session.getRespawnPoint();
                // The dead body moves world first, facing as it fell; `PlayerSession.respawn` then
                // stands it at the eyes once the client's `Respawn` action arrives, as in one world.
                if (point.world !== session.getWorld()) {
                    await session.changeWorld({
                        world: point.world,
                        position: point.block,
                        yaw: player.yaw,
                        pitch: player.pitch,
                        respawn: true,
                        closesLoadingScreen: false
                    });
                }
                await session.sendRespawn(point.block, PlayerRespawnState.SEARCHING_FOR_SPAWN);
                await session.sendRespawn(point.eyes, PlayerRespawnState.READY_TO_SPAWN);
            });
            return;
        }

        // Already alive: the respawn action came first. How a Bedrock Dedicated Server answers
        // this order has not been recorded, so the player is told where they stand and
        // described again, as this server did before. One output, so the packets keep their order.
        const position = player.getPosition();
        step.output(
            (async () => {
                await session.sendRespawn(position, PlayerRespawnState.READY_TO_SPAWN);
                await session.sendAttributes();
                await session.sendMetadata();
                await session.sendAbilities();
                await session.sendInventory();
            })()
        );
    }
}
