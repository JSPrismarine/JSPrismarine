import { Gametype, LevelEvent } from '@jsprismarine/minecraft';

import { blockFromContent } from '../../block/Block';
import BlockPosition from '../../world/BlockPosition';
import { PlayerActionType } from '@jsprismarine/protocol';
import type PlayerActionPacket from '@jsprismarine/protocol/packet/PlayerActionPacket';
import { MAX_BLOCK_TARGET_DISTANCE } from './BlockTarget';
import { blockMiningOf, minimumBreakTicks, playerMiningOf } from '../../world/BlockMining';
import type { BlockMining } from '../../world/BlockMining';
import type { StorePlayer } from '../../entity/storePlayer';
import type { World } from '../../world/World';
import type { InputContext } from './HandlerContext';
import type { InputLaneHandler } from './SessionHandler';

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
export default class PlayerActionHandler implements InputLaneHandler<PlayerActionPacket> {
    public static PacketName = 'PlayerActionPacket';
    public readonly phases = ['play'] as const;
    public readonly lane = 'input';

    public handle(packet: PlayerActionPacket, context: InputContext): undefined {
        const { session, log } = context;
        const data = packet.getPacketData();

        if (data === null) return;

        if (data.runtimeEntityId !== session.runtimeId) {
            log.debug(
                `Dropped action ${data.action} from ${session.identity.name}: it names runtime id ${data.runtimeEntityId}, not their own`,
                'PlayerActionHandler/handle'
            );
            return;
        }

        if (INPUT_ONLY_ACTIONS.has(data.action)) {
            log.debug(
                `Ignored action ${data.action} from ${session.identity.name}: block actions arrive in PlayerAuthInputPacket`,
                'PlayerActionHandler/handle'
            );
            return;
        }

        const blockPosition = new BlockPosition(data.blockPosition.x, data.blockPosition.y, data.blockPosition.z);
        this.handleAction(data.action, blockPosition, data.blockFace, context);
    }

    /**
     * Acts on one action.
     *
     * Synchronous, as the input step needs. A block it acts on has to be in a loaded chunk, and
     * the world's calls that still wait before they write or tell anyone go to `step.defer`,
     * each beside the slice that removes the wait.
     * @param {number} action - a {@link PlayerActionType}.
     * @param {BlockPosition} blockPosition - the block it concerns, or the origin for those that concern none.
     * @param {number} blockFace - the face of that block.
     * @param {InputContext} context - who did it, and the input step that applies it.
     */
    public handleAction(
        action: number,
        blockPosition: BlockPosition,
        blockFace: number,
        { session, log, config, services, step }: InputContext
    ): undefined {
        // The state an action reads, and the runtime that takes the inputs. Hitting and breaking
        // a block take the store player as the one who struck, and a sprint, a flight toggle and a
        // respawn go through the session, which posts their events and orders the respawn's parts.
        const player = session.getPlayer();
        const inputs = session.inputs();
        const world = session.getWorld();

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
                log.verbose(
                    `Dropped action ${action} from ${session.identity.name} on a block ${distance.toFixed(1)} away`,
                    'PlayerActionHandler/handleAction'
                );
                return;
            }

            // And only in a chunk the world already holds, as ADR 0014 has an input do: the
            // input step cannot wait for a chunk to load, and a block nobody can see is not one
            // a client can be acting on.
            if (world.getLoadedChunk(blockPosition.getX() >> 4, blockPosition.getZ() >> 4) === null) {
                log.verbose(
                    `Dropped action ${action} from ${session.identity.name} on a block in a chunk that is not loaded`,
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
            // stops the cracks on the block mined before, starts them on this one, and the
            // store's player systems animate them every tick. The client predicts the break and
            // reports it as `PREDICT_DESTROY_BLOCK`.
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

                if (config.getServerAuthoritativeBlockBreaking()) {
                    // The block is read from its loaded chunk; one nobody has loaded starts nothing.
                    const mining = player.getComponents().get('mining.block');
                    const started = world.startBlockCracking(blockPosition, blockFace, tool, blockMiningOf(mining));
                    inputs.setPlayerMining(player, playerMiningOf(started));
                    return;
                }

                // The only action here that needs the block, read from its loaded chunk. Reading
                // it up front, as this used to, meant every jump, sprint and sneak - which carry
                // no block position and so ask for (0, 0, 0) - loaded, and on a fresh world
                // generated, the chunk at the origin.
                const x = blockPosition.getX();
                const y = blockPosition.getY();
                const z = blockPosition.getZ();
                const state = world.loadedBlockAt(x, y, z);
                if (state === undefined) return;
                const block = blockFromContent(state.name, services.content, state.states);
                if (block === null) throw new Error(`No block named ${state.name}, held at ${x} ${y} ${z}`);

                // A block that gives way instantly has no progress to animate, and the
                // 65535/0 the client would be handed is not a number this packet can carry.
                const breakTime = Math.ceil(block.getBreakTime(tool) * 20);

                // The first swing, heard by everyone near but the player, whose client plays its
                // own. The rest arrive as `CRACK_BLOCK`.
                world.hitBlock(blockPosition, blockFace, session.getPlayer());
                if (breakTime <= 0) return;

                // The client is told how much progress a tick is worth, not how long the block
                // takes, so this is only ever as right as `getBreakTime` is.
                world.sendWorldEvent(blockPosition, LevelEvent.START_BLOCK_CRACKING, Math.floor(65535 / breakTime));
                return;
            }

            case PlayerActionType.AbortDestroyBlock: {
                world.stopBlockCracking(blockPosition);
                inputs.setPlayerMining(player, null);
                return;
            }

            // The end of a break with server-authoritative block breaking: the client predicted
            // that the block it was mining gave way. It arrives inside `PlayerAuthInput`, often
            // in the same packet as the `CONTINUE_DESTROY_BLOCK` that last restarted the
            // cracks, and BDS breaks the block for it. A survival break drops what the block
            // yields; `breakBlock` leaves that out for creative. With the client timing breaks
            // the transaction is what breaks a block, and this is not sent.
            //
            // The prediction is the client's word, so it is checked before anything breaks: the
            // block has to be the one the server is timing, breakable, and mined for long enough
            // (see `minimumBreakTicks`). A block that breaks at once has no mining to time and
            // only has to be one that breaks at once. A refused prediction puts the block back
            // on the client's screen.
            case PlayerActionType.PredictDestroyBlock: {
                if (!config.getServerAuthoritativeBlockBreaking()) return;

                const mining = blockMiningOf(player.getComponents().get('mining.block'));
                inputs.setPlayerMining(player, null);

                // Adventure mode breaks nothing, but the client has already taken the block
                // off its screen, so it is told what is still there.
                if (player.gamemode === Gametype.ADVENTURE) {
                    world.resendBlock(blockPosition.getX(), blockPosition.getY(), blockPosition.getZ());
                    return;
                }

                const refusal = refusePrediction(blockPosition, mining, world, player, step.tick);
                if (refusal !== null) {
                    log.verbose(
                        `Refused a predicted break from ${session.identity.name} at ${blockPosition}: ${refusal}`,
                        'PlayerActionHandler/handleAction'
                    );
                    if (mining !== null) world.stopBlockCracking(mining.position);
                    world.resendBlock(blockPosition.getX(), blockPosition.getY(), blockPosition.getZ());
                    return;
                }

                // The break reads and writes the loaded chunk only, in this unit, and leaves a block
                // whose chunk is not loaded alone.
                world.breakBlock(blockPosition, session.getPlayer());
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
                    log.verbose(
                        `Dropped a creative break from ${session.identity.name}, who is not in creative`,
                        'PlayerActionHandler/handleAction'
                    );
                    return;
                }

                // In this unit, as the predicted break above.
                world.breakBlock(blockPosition, session.getPlayer());
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
                world.hitBlock(blockPosition, blockFace, session.getPlayer());
                return;
            }

            case PlayerActionType.Respawn: {
                // The respawn search reads chunks that may not be loaded, so the respawn is a
                // request that the input step with the search's answer applies.
                session.requestRespawn();
                return;
            }

            case PlayerActionType.StartJump: {
                inputs.playerJumped(player);
                return;
            }

            // `setSprinting` waits for nothing; it is asynchronous only by its signature.
            case PlayerActionType.StartSprinting: {
                step.output(session.setSprinting(true));
                return;
            }
            case PlayerActionType.StopSprinting: {
                step.output(session.setSprinting(false));
                return;
            }

            case PlayerActionType.StartSneaking: {
                inputs.setPlayerSneaking(player, true);
                return;
            }
            case PlayerActionType.StopSneaking: {
                inputs.setPlayerSneaking(player, false);
                return;
            }

            case PlayerActionType.StartSleeping: {
                player.getComponents().set('movement.sleeping', true);
                return;
            }
            case PlayerActionType.StopSleeping: {
                player.getComponents().set('movement.sleeping', false);
                return;
            }

            // The docs expect an `UpdateAbilitiesPacket` back, accepting or refusing the
            // toggle. `setFlying` sends one either way: the new abilities when the player may
            // fly, the old ones when they may not. It writes the flight before its first send.
            case PlayerActionType.StartFlying: {
                step.output(session.setFlying(true));
                return;
            }
            case PlayerActionType.StopFlying: {
                step.output(session.setFlying(false));
                return;
            }

            // Accepted, and nothing done. The client has already done what each of these
            // says, and the server keeps no swimming, gliding, crawling or spin attack state
            // to bring up to date; the docs' expected answers (a `SetActorDataPacket` flag for
            // most) wait on that state existing. `ChangeDimensionAck` is the client echoing
            // the one the server sent in `PlayerSession.changeWorld`; the change itself ends
            // on the `EndLoadingScreen` that follows it. `DenyDestroyBlock` is EDU only.
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
                log.verbose(
                    `Dropped action ${action} from ${session.identity.name}: not one a client sends`,
                    'PlayerActionHandler/handleAction'
                );
                break;
            }
        }
    }
}

/**
 * Why a survival player's prediction that a block broke is not to be believed, or null when it is.
 *
 * Reads the loaded chunk only; the action was dropped before this for a block in one that is not.
 * @param blockPosition - The block the client says gave way.
 * @param mining - What the server was timing the player mining, before the prediction.
 * @param world - The player's world.
 * @param player - Who predicted it, whose tool and effects the break time allows for.
 * @param tick - The tick the prediction is applied in, on the clock mining was started on.
 */
const refusePrediction = (
    blockPosition: BlockPosition,
    mining: BlockMining | null,
    world: Pick<World, 'loadedBlockRuntimeIdAt' | 'loadedBlock'>,
    player: Pick<StorePlayer, 'getInventory' | 'getStatusEffects'>,
    tick: number
): string | null => {
    const x = blockPosition.getX();
    const y = blockPosition.getY();
    const z = blockPosition.getZ();

    if (mining !== null && mining.position.equals(blockPosition)) {
        // The time was measured for the block mining started on. Something else standing there
        // now, put down since, has not been mined at all.
        if (world.loadedBlockRuntimeIdAt(x, y, z) !== mining.runtimeId) return 'the block changed since mining began';

        const needed = minimumBreakTicks(mining, player.getStatusEffects());
        const took = tick - mining.startedAt;
        if (!Number.isFinite(needed)) return 'the block cannot be broken';
        return took >= needed ? null : `it was mined for ${took} of the ${needed} ticks it needs`;
    }

    // No mining to time, which is right only for a block that gives way at once.
    const block = world.loadedBlock(x, y, z);
    if (block === undefined) return 'the block is not loaded';
    const breakTicks = Math.ceil(block.getBreakTime(player.getInventory().getItemInHand()) * 20);
    return breakTicks <= 0 ? null : 'it is not the block being mined';
};
