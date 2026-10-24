import { Gametype, LevelEvent } from '@jsprismarine/minecraft';

import type { PlayerSession } from '../../';
import type Server from '../../Server';
import { CREATIVE_REACH } from '../../entity/Combat';
import type BlockPosition from '../../world/BlockPosition';
import Identifiers from '../Identifiers';
import type PlayerActionPacket from '../packet/PlayerActionPacket';
import { PlayerAction } from '../packet/PlayerActionPacket';
import type PacketHandler from './PacketHandler';

/**
 * The actions whose block position is read, so the one the client sends has to be checked.
 *
 * Every other action concerns no block and arrives carrying the origin, which must not be
 * taken for a position the player is standing nowhere near.
 */
const BLOCK_ACTIONS: ReadonlySet<number> = new Set([
    PlayerAction.START_BREAK,
    PlayerAction.CONTINUE_DESTROY_BLOCK,
    PlayerAction.ABORT_BREAK,
    PlayerAction.CREATIVE_PLAYER_DESTROY_BLOCK,
    PlayerAction.STOP_BREAK,
    PlayerAction.CRACK_BLOCK
]);

/**
 * How far from the player a block action may claim to have happened.
 *
 * Acting on a block reads the world at it, which loads the chunk it falls in and generates
 * that chunk if the world has never had one there. An unchecked position therefore lets a
 * client both break what it cannot see and drive terrain generation anywhere on the map,
 * one crafted packet per chunk. `CREATIVE_REACH` is the furthest any player may reach, and
 * the extra block covers the distance from a player's feet to their eyes and from a block's
 * corner to its middle. This is a bound on nonsense rather than an anti-cheat reach check.
 */
const MAX_BLOCK_ACTION_DISTANCE = CREATIVE_REACH + 1;

/**
 * Everything a player does that is not moving, whichever packet it arrived in.
 *
 * Two packets carry these. `PlayerActionPacket` still brings the ones with no block - a jump,
 * a sprint, a respawn - and a creative break. A survival break comes as the block actions of
 * `PlayerAuthInputPacket` since movement went server authoritative: the start, every swing,
 * the abort and the stop ride with the tick's input, and `PlayerAuthInputHandler` hands each
 * to {@link handleAction} exactly as this handler does for its own packet.
 */
export default class PlayerActionHandler implements PacketHandler<PlayerActionPacket> {
    public static NetID = Identifiers.PlayerActionPacket;

    public async handle(packet: PlayerActionPacket, server: Server, session: PlayerSession): Promise<void> {
        await this.handleAction(packet.action, packet.blockPosition, packet.blockFace, server, session);
    }

    /**
     * Acts on one action.
     * @param {number} action - a {@link PlayerAction}.
     * @param {BlockPosition} blockPosition - the block it concerns, or the origin for those that concern none.
     * @param {number} blockFace - the face of that block.
     * @param {Server} server - the server.
     * @param {PlayerSession} session - who did it.
     */
    public async handleAction(
        action: number,
        blockPosition: BlockPosition,
        blockFace: number,
        server: Server,
        session: PlayerSession
    ): Promise<void> {
        const player = session.getPlayer();
        const world = player.getWorld();

        if (BLOCK_ACTIONS.has(action)) {
            // Spectators pass through the world without touching it. `InventoryTransactionHandler`
            // has always refused them; the actions that arrive here never did, so a spectator
            // could sound a block, animate its cracks and break it outright.
            if (player.gamemode === Gametype.SPECTATOR) return;

            const distance = player.getPosition().distanceTo(blockPosition);
            if (!Number.isFinite(distance) || distance > MAX_BLOCK_ACTION_DISTANCE) {
                server
                    .getLogger()
                    .verbose(
                        `Dropped action ${action} from ${player.getName()} on a block ${distance.toFixed(1)} away`,
                        'PlayerActionHandler/handleAction'
                    );
                return;
            }
        }

        switch (action) {
            // Mining has begun on a block. `CONTINUE_DESTROY_BLOCK` is the same thing for a
            // player who dragged onto another block without letting go of the button, so the
            // animation simply starts again on the new one - it does *not* mean a block
            // broke, which is what it used to be treated as, sounding a full break for every
            // block merely swept over.
            case PlayerAction.START_BREAK:
            case PlayerAction.CONTINUE_DESTROY_BLOCK: {
                // The only action here that needs the block. Reading it up front, as this
                // used to, meant every jump, sprint and sneak - which carry no block position
                // and so ask for (0, 0, 0) - loaded, and on a fresh world generated, the
                // chunk at the origin.
                const block = await world.getBlock(blockPosition.getX(), blockPosition.getY(), blockPosition.getZ());

                // The first swing sounds like every one after it; the rest arrive as
                // `CRACK_BLOCK`.
                await world.hitBlock(blockPosition, blockFace);

                // Bare-handed, always. Known gap: `getBreakTime` takes the tool as its first
                // argument and is passed none, so a pickaxe animates at a fist's pace. The
                // held item is `player.getInventory().getItemInHand()`; what is missing is
                // the tool-to-block speed table it would be looked up in.
                const breakTime = Math.ceil(block.getBreakTime(null, server) * 20);

                // A block that gives way instantly has no progress to animate, and the
                // 65535/0 the client would be handed is not a number this packet can carry.
                if (breakTime <= 0) return;

                // The client is told how much progress a tick is worth, not how long the
                // block takes, so this is only ever as right as `getBreakTime` is.
                await world.sendWorldEvent(
                    blockPosition,
                    LevelEvent.START_BLOCK_CRACKING,
                    Math.floor(65535 / breakTime)
                );
                return;
            }

            case PlayerAction.ABORT_BREAK: {
                await world.sendWorldEvent(blockPosition, LevelEvent.STOP_BLOCK_CRACKING, 0);
                return;
            }

            // Creative's route into a break: it destroys the block on the client and says so
            // here, without the InventoryTransaction survival sends. Handling only that
            // transaction left creative silent, and - worse - left the block standing in the
            // server's copy of the world, gone only on the screen of whoever broke it.
            case PlayerAction.CREATIVE_PLAYER_DESTROY_BLOCK: {
                // Creative's route, and creative's alone. A survival client that sends this
                // action breaks the block outright: no break time, no tool, and none of the
                // `InventoryTransaction` accounting the survival route goes through.
                if (player.gamemode !== Gametype.CREATIVE) {
                    server
                        .getLogger()
                        .verbose(
                            `Dropped a creative break from ${player.getName()}, who is not in creative`,
                            'PlayerActionHandler/handleAction'
                        );
                    return;
                }

                await world.breakBlock(blockPosition, player);
                return;
            }

            // The end of a survival break. The InventoryTransaction that comes with it is
            // what carries the block, so there is nothing to do here - and `breakBlock` would
            // ignore a second attempt anyway.
            case PlayerAction.STOP_BREAK: {
                return;
            }

            // Every swing after the first. The client sends one per punch for as long as the
            // button is held, and each is a hit to be heard - this is the sound of digging.
            case PlayerAction.CRACK_BLOCK: {
                await world.hitBlock(blockPosition, blockFace);
                return;
            }

            case PlayerAction.RESPAWN: {
                await player.respawn();
                return;
            }

            case PlayerAction.JUMP: {
                player.addJumpExhaustion();
                return;
            }

            case PlayerAction.START_SPRINT: {
                await player.setSprinting(true);
                return;
            }
            case PlayerAction.STOP_SPRINT: {
                await player.setSprinting(false);
                return;
            }

            case PlayerAction.START_SNEAK: {
                await player.setSneaking(true);
                return;
            }
            case PlayerAction.STOP_SNEAK: {
                await player.setSneaking(false);
                return;
            }

            default: {
                server.getLogger().verbose(`Unhandled player action: ${action}`);
                break;
            }
        }
    }
}
