import { Gametype, LevelEvent } from '@jsprismarine/minecraft';

import type { PlayerSession } from '../../';
import type Server from '../../Server';
import BlockPosition from '../../world/BlockPosition';
import { PlayerActionType } from '@jsprismarine/protocol';
import type PlayerActionPacket from '@jsprismarine/protocol/packet/PlayerActionPacket';
import { MAX_BLOCK_TARGET_DISTANCE } from './BlockTarget';
import type PacketHandler from './PacketHandler';

/**
 * The actions whose block position is read, so the one the client sends has to be checked.
 *
 * Every other action concerns no block and arrives carrying the origin, which must not be
 * taken for a position the player is standing nowhere near.
 */
const BLOCK_ACTIONS: ReadonlySet<number> = new Set([
    PlayerActionType.StartDestroyBlock,
    PlayerActionType.PredictDestroyBlock,
    PlayerActionType.ContinueDestroyBlock,
    PlayerActionType.AbortDestroyBlock,
    PlayerActionType.CreativeDestroyBlock,
    PlayerActionType.StopDestroyBlock,
    PlayerActionType.CrackBlock
]);

/**
 * The actions that moved into `PlayerAuthInputPacket` and no longer arrive in a packet of
 * their own.
 *
 * The block-breaking guide puts every start, swing, abort, stop, continuation and prediction
 * of a break in the input's `Player Block Actions`, and a 1.26.51 client sends them nowhere
 * else. A `PlayerActionPacket` carrying one is not that client's doing, so it is dropped
 * before {@link PlayerActionHandler.handleAction} would sound or break anything on its say-so.
 */
const INPUT_ONLY_ACTIONS: ReadonlySet<number> = new Set([
    PlayerActionType.StartDestroyBlock,
    PlayerActionType.AbortDestroyBlock,
    PlayerActionType.StopDestroyBlock,
    PlayerActionType.CrackBlock,
    PlayerActionType.PredictDestroyBlock,
    PlayerActionType.ContinueDestroyBlock
]);

/**
 * Everything a player does that is not moving, whichever packet it arrived in.
 *
 * Two packets carry these. `PlayerActionPacket` still brings the ones the docs mark "Sent in
 * Player Action": a respawn, a creative break, a dimension change ack, a flight toggle, the
 * sleeping, swimming, gliding and spin attack pairs. A survival break comes as the block
 * actions of `PlayerAuthInputPacket` since movement went server authoritative: the start,
 * every swing, the abort and the stop ride with the tick's input, and `PlayerAuthInputHandler`
 * hands each to {@link handleAction} exactly as this handler does for its own packet.
 *
 * {@link handle} checks what only the standalone packet carries: `Player Runtime ID` has to be
 * the sender's, and a block action that belongs in the input is ignored. Neither throws.
 */
export default class PlayerActionHandler implements PacketHandler<PlayerActionPacket> {
    public static PacketName = 'PlayerActionPacket';
    public readonly phases = ['play'] as const;

    public async handle(packet: PlayerActionPacket, server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();
        const data = packet.getPacketData();

        if (data === null) return;

        if (data.runtimeEntityId !== player.getRuntimeId()) {
            server
                .getLogger()
                .debug(
                    `Dropped action ${data.action} from ${player.getName()}: it names runtime id ${data.runtimeEntityId}, not their own`,
                    'PlayerActionHandler/handle'
                );
            return;
        }

        if (INPUT_ONLY_ACTIONS.has(data.action)) {
            server
                .getLogger()
                .debug(
                    `Ignored action ${data.action} from ${player.getName()}: block actions arrive in PlayerAuthInputPacket`,
                    'PlayerActionHandler/handle'
                );
            return;
        }

        const blockPosition = new BlockPosition(data.blockPosition.x, data.blockPosition.y, data.blockPosition.z);
        await this.handleAction(data.action, blockPosition, data.blockFace, server, session);
    }

    /**
     * Acts on one action.
     * @param {number} action - a {@link PlayerActionType}.
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

            // Acting on a block reads the world at it, which loads the chunk it falls in and
            // generates that chunk if the world has never had one there. Unchecked, a client
            // could both break what it cannot see and drive terrain generation anywhere on
            // the map, one crafted packet per chunk.
            const distance = player.getPosition().distanceTo(blockPosition);
            if (!Number.isFinite(distance) || distance > MAX_BLOCK_TARGET_DISTANCE) {
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
            //
            // Two ways to run a break, one per `server-authoritative-block-breaking` setting.
            //
            // Server-authoritative, as a Bedrock Dedicated Server 1.26.52 runs it: the server
            // stops the cracks on the block mined before, starts them on this one, and animates
            // them every tick from `Player.update`. The client predicts the break and reports
            // it as `PREDICT_DESTROY_BLOCK`.
            //
            // Client-authoritative: the client times the break itself and reports it with an
            // `InventoryTransaction`, and the server only starts the crack animation, once.
            case PlayerActionType.StartDestroyBlock:
            case PlayerActionType.ContinueDestroyBlock: {
                // Creative breaks are immediate. Sending survival crack timing here makes
                // blocks such as bamboo visibly mine at a survival speed in creative mode.
                if (player.gamemode === Gametype.CREATIVE) return;

                // The held item, so a pickaxe animates at a pickaxe's pace. This passed null
                // for as long as it existed, which made every block crack at a fist's rate
                // and left Efficiency with nothing to speed up.
                const tool = player.getInventory().getItemInHand();

                if (server.getConfig().getServerAuthoritativeBlockBreaking()) {
                    player.setMining(
                        await world.startBlockCracking(blockPosition, blockFace, tool, player.getMining())
                    );
                    return;
                }

                // The only action here that needs the block. Reading it up front, as this
                // used to, meant every jump, sprint and sneak - which carry no block position
                // and so ask for (0, 0, 0) - loaded, and on a fresh world generated, the
                // chunk at the origin.
                const block = await world.getBlock(blockPosition.getX(), blockPosition.getY(), blockPosition.getZ());

                // The first swing, heard by everyone near but the player, whose client plays
                // its own. The rest arrive as `CRACK_BLOCK`.
                await world.hitBlock(blockPosition, blockFace, player);

                const breakTime = Math.ceil(block.getBreakTime(tool, server) * 20);

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

            case PlayerActionType.AbortDestroyBlock: {
                await world.stopBlockCracking(blockPosition);
                player.setMining(null);
                return;
            }

            // The end of a break with server-authoritative block breaking: the client predicted
            // that the block it was mining gave way. It arrives inside `PlayerAuthInput`, often
            // in the same packet as the `CONTINUE_DESTROY_BLOCK` that last restarted the
            // cracks, and BDS breaks the block for it. A survival break drops what the block
            // yields; `breakBlock` leaves that out for creative. With the client timing breaks
            // the transaction is what breaks a block, and this is not sent.
            //
            // Known gap: BDS checks that the mining took long enough, and this does not. The
            // haste, efficiency, underwater and off-ground modifiers would need measuring
            // against BDS first, or the check would refuse breaks a real client times right.
            case PlayerActionType.PredictDestroyBlock: {
                if (!server.getConfig().getServerAuthoritativeBlockBreaking()) return;

                player.setMining(null);

                // Adventure mode breaks nothing, but the client has already taken the block
                // off its screen, so it is told what is still there.
                if (player.gamemode === Gametype.ADVENTURE) {
                    world.resendBlock(blockPosition.getX(), blockPosition.getY(), blockPosition.getZ());
                    return;
                }

                await world.breakBlock(blockPosition, player);
                return;
            }

            // Creative's route into a break: it destroys the block on the client and says so
            // here, without the InventoryTransaction survival sends. Handling only that
            // transaction left creative silent, and - worse - left the block standing in the
            // server's copy of the world, gone only on the screen of whoever broke it.
            case PlayerActionType.CreativeDestroyBlock: {
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

            // The end of a survival break. The `PREDICT_DESTROY_BLOCK` or the
            // InventoryTransaction that comes with it, depending on the breaking mode, is what
            // carries the block, so there is nothing to do here - and `breakBlock` would ignore
            // a second attempt anyway.
            case PlayerActionType.StopDestroyBlock: {
                return;
            }

            // Every swing after the first. The client sends one per punch for as long as the
            // button is held, and each is a hit to be heard - this is the sound of digging.
            case PlayerActionType.CrackBlock: {
                await world.hitBlock(blockPosition, blockFace, player);
                return;
            }

            case PlayerActionType.Respawn: {
                await player.respawn();
                return;
            }

            case PlayerActionType.StartJump: {
                player.addJumpExhaustion();
                return;
            }

            case PlayerActionType.StartSprinting: {
                await player.setSprinting(true);
                return;
            }
            case PlayerActionType.StopSprinting: {
                await player.setSprinting(false);
                return;
            }

            case PlayerActionType.StartSneaking: {
                await player.setSneaking(true);
                return;
            }
            case PlayerActionType.StopSneaking: {
                await player.setSneaking(false);
                return;
            }

            case PlayerActionType.StartSleeping: {
                player.setSleeping(true);
                return;
            }
            case PlayerActionType.StopSleeping: {
                player.setSleeping(false);
                return;
            }

            // The docs expect an `UpdateAbilitiesPacket` back, accepting or refusing the
            // toggle. `setFlying` sends one either way: the new abilities when the player may
            // fly, the old ones when they may not.
            case PlayerActionType.StartFlying: {
                await player.setFlying(true);
                return;
            }
            case PlayerActionType.StopFlying: {
                await player.setFlying(false);
                return;
            }

            // Accepted, and nothing done. The client has already done what each of these
            // says, and the server keeps no swimming, gliding, crawling, spin attack
            // or dimension change state to bring up to date; the docs' expected answers (a
            // `SetActorDataPacket` flag for most) wait on that state existing.
            // `DenyDestroyBlock` is EDU only.
            case PlayerActionType.ChangeDimensionAck:
            case PlayerActionType.StartSwimming:
            case PlayerActionType.StopSwimming:
            case PlayerActionType.StartGliding:
            case PlayerActionType.StopGliding:
            case PlayerActionType.StartCrawling:
            case PlayerActionType.StopCrawling:
            case PlayerActionType.StartSpinAttack:
            case PlayerActionType.StopSpinAttack:
            case PlayerActionType.StartItemUseOn:
            case PlayerActionType.StopItemUseOn:
            case PlayerActionType.StartUsingItem:
            case PlayerActionType.MissedSwing:
            case PlayerActionType.HandledTeleport:
            case PlayerActionType.InternalUpdate:
            case PlayerActionType.DenyDestroyBlock: {
                return;
            }

            default: {
                server
                    .getLogger()
                    .verbose(
                        `Dropped action ${action} from ${player.getName()}: not one a client sends`,
                        'PlayerActionHandler/handleAction'
                    );
                break;
            }
        }
    }
}
