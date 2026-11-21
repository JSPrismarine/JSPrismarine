import { BLOCK_FACES } from '@jsprismarine/blocks';
import { PrismarineNetworkErrors } from '@jsprismarine/errors/prismarine/network';
import { Gametype, LevelEvent } from '@jsprismarine/minecraft';

import { blockFromContent } from '../../block/Block';
import type { StorePlayer } from '../../entity/storePlayer';
import PlayerBlockActionEvent from '../../events/player/PlayerBlockActionEvent';
import { MAX_BLOCK_TARGET_DISTANCE } from '../../network/handler/BlockTarget';
import type { InputContext } from '../../network/handler/HandlerContext';
import type { BlockMining } from '../../world/BlockMining';
import { blockMiningOf, minimumBreakTicks, playerMiningOf } from '../../world/BlockMining';
import BlockPosition from '../../world/BlockPosition';
import type { World } from '../../world/World';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';

/**
 * A player mining a block, whichever edition's client mines it.
 *
 * Bedrock's block actions and Java's `Player Action` both decode into these steps. Two ways to
 * time a break exist, and the intent says which applies. Server-timed, as a Bedrock
 * Dedicated Server 1.26.52 runs it with `server-authoritative-block-breaking` and as every Java
 * server does: the server starts the cracks, the store's player systems animate them every tick,
 * and the client's `finish` is checked against how long the block was mined. Client-timed, a
 * Bedrock client with the setting off: the client times the break and reports it with an
 * `InventoryTransaction`, and the server only starts the crack animation, once.
 */
export default class MineBlockHandler implements IntentHandler<'mineBlock'> {
    public static readonly Kind = 'mineBlock';

    /**
     * Acts on one step. Synchronous, as the input step needs. A block it acts on has to be in a
     * loaded chunk, and the world's calls that still wait before they write or tell anyone go to
     * `step.defer`, each beside the slice that removes the wait.
     */
    public handle(
        { step: miningStep, position, face: blockFace, serverTimed, breaksIfInstant }: Intent<'mineBlock'>,
        { session, log, services, step }: InputContext
    ): undefined {
        // Hitting and breaking a block take the store player as the one who struck.
        const player = session.getPlayer();
        const inputs = session.inputs();
        const world = session.getWorld();
        const blockPosition = new BlockPosition(position.x, position.y, position.z);

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
                `Dropped mining step ${miningStep} from ${session.identity.name} on a block ${distance.toFixed(1)} away`
            );
            return;
        }

        // And only in a chunk the world already holds, as ADR 0014 has an input do: the
        // input step cannot wait for a chunk to load, and a block nobody can see is not one
        // a client can be acting on.
        if (world.getLoadedChunk(blockPosition.getX() >> 4, blockPosition.getZ() >> 4) === null) {
            log.verbose(
                `Dropped mining step ${miningStep} from ${session.identity.name} on a block in a chunk that is not loaded`
            );
            return;
        }

        if (miningStep === 'start' || miningStep === 'abort') {
            const face = BLOCK_FACES[blockFace];
            const x = blockPosition.getX();
            const y = blockPosition.getY();
            const z = blockPosition.getZ();
            const block = world.loadedBlockAt(x, y, z);
            if (face !== undefined && block !== undefined && block.name !== 'minecraft:air') {
                const held = player.getInventory().equipment('mainhand');
                const mining = player.getComponents().get('mining.block');
                const progress =
                    mining === null || !Number.isFinite(mining.breakTicks) || mining.breakTicks <= 0
                        ? 0
                        : Math.min(1, Math.max(0, (step.tick - mining.startedAt) / mining.breakTicks));
                services.events.post(
                    'playerBlockAction',
                    new PlayerBlockActionEvent(
                        session.runtimeId,
                        world,
                        miningStep,
                        { x, y, z, name: block.name, states: block.states },
                        face,
                        held,
                        miningStep === 'abort' ? progress : 0
                    )
                );
            }
        }

        switch (miningStep) {
            // Mining has begun on a block. `continue` is the same thing for a player who dragged
            // onto another block without letting go of the button, so the animation simply
            // starts again on the new one - it does *not* mean a block broke, which is what it
            // used to be treated as, sounding a full break for every block merely swept over.
            case 'start':
            case 'continue': {
                // Creative breaks are immediate. Sending survival crack timing here makes
                // blocks such as bamboo visibly mine at a survival speed in creative mode.
                if (player.gamemode === Gametype.CREATIVE) return;

                // The held item, so a pickaxe animates at a pickaxe's pace. This passed null
                // for as long as it existed, which made every block crack at a fist's rate
                // and left Efficiency with nothing to speed up.
                const tool = player.getInventory().equipment('mainhand');

                if (serverTimed) {
                    // The block is read from its loaded chunk; one nobody has loaded starts nothing.
                    const mining = player.getComponents().get('mining.block');
                    const started = world.startBlockCracking(
                        blockPosition,
                        blockFace,
                        tool,
                        blockMiningOf(mining),
                        session.handledInputs()
                    );
                    inputs.setPlayerMining(player, playerMiningOf(started));

                    // A Java client breaks a block that gives way at once on the start alone, and
                    // the server breaks it too, as vanilla's does when the first hit finishes it.
                    if (breaksIfInstant && player.gamemode !== Gametype.ADVENTURE) {
                        const block = world.loadedBlock(
                            blockPosition.getX(),
                            blockPosition.getY(),
                            blockPosition.getZ()
                        );
                        if (block !== undefined && block.getBreakTicks(tool) <= 0) {
                            inputs.setPlayerMining(player, null);
                            world.breakBlock(blockPosition, player);
                        }
                    }
                    return;
                }

                // The only step here that needs the block, read from its loaded chunk.
                const x = blockPosition.getX();
                const y = blockPosition.getY();
                const z = blockPosition.getZ();
                const state = world.loadedBlockAt(x, y, z);
                if (state === undefined) return;
                const block = blockFromContent(state.name, services.content, state.states);
                if (block === null) throw new PrismarineNetworkErrors.UnknownHeldBlock({ name: state.name, x, y, z });

                // A block that gives way instantly has no progress to animate, and the
                // 65535/0 the client would be handed is not a number this packet can carry.
                const breakTime = block.getBreakTicks(tool);

                // The first swing, heard by everyone near but the player, whose client plays its
                // own. The rest arrive as `swing`.
                world.hitBlock(blockPosition, blockFace, player);
                if (breakTime <= 0) return;

                // The client is told how much progress a tick is worth, not how long the block
                // takes, so this is only ever as right as `getBreakTicks` is.
                world.sendWorldEvent(blockPosition, LevelEvent.START_BLOCK_CRACKING, Math.floor(65535 / breakTime));
                return;
            }

            case 'abort': {
                world.stopBlockCracking(blockPosition);
                inputs.setPlayerMining(player, null);
                return;
            }

            // The end of a server-timed break: the client predicted that the block it was mining
            // gave way. A Bedrock client sends it inside `PlayerAuthInput`, often in the same
            // packet as the `continue` that last restarted the cracks, and BDS breaks the block
            // for it. A survival break drops what the block yields; `breakBlock` leaves that out
            // for creative. With the client timing breaks the transaction is what breaks a block,
            // and this is not sent.
            //
            // The prediction is the client's word, so it is checked before anything breaks: the
            // block has to be the one the server is timing, breakable, and mined for long enough
            // (see `minimumBreakTicks`). A block that breaks at once has no mining to time and
            // only has to be one that breaks at once. A refused prediction puts the block back
            // on the client's screen.
            case 'finish': {
                if (!serverTimed) return;

                const mining = blockMiningOf(player.getComponents().get('mining.block'));
                inputs.setPlayerMining(player, null);

                // Adventure mode breaks nothing, but the client has already taken the block
                // off its screen, so it is told what is still there.
                if (player.gamemode === Gametype.ADVENTURE) {
                    world.resendBlock(blockPosition.getX(), blockPosition.getY(), blockPosition.getZ());
                    return;
                }

                const refusal = refusePrediction(blockPosition, mining, world, player, {
                    tick: step.tick,
                    input: session.handledInputs()
                });
                if (refusal !== null) {
                    log.verbose(
                        `Refused a predicted break from ${session.identity.name} at ${blockPosition}: ${refusal}`
                    );
                    if (mining !== null) world.stopBlockCracking(mining.position);
                    world.resendBlock(blockPosition.getX(), blockPosition.getY(), blockPosition.getZ());
                    return;
                }

                // The break reads and writes the loaded chunk only, in this unit, and leaves a block
                // whose chunk is not loaded alone.
                world.breakBlock(blockPosition, player);
                return;
            }

            // Creative's route into a break: it destroys the block on the client and says so
            // here, without the InventoryTransaction a Bedrock survival client sends. Handling
            // only that transaction left creative silent, and - worse - left the block standing
            // in the server's copy of the world, gone only on the screen of whoever broke it.
            case 'instant': {
                // Creative's route, and creative's alone. A survival client that sends this
                // breaks the block outright: no break time, no tool, and none of the
                // `InventoryTransaction` accounting the survival route goes through.
                if (player.gamemode !== Gametype.CREATIVE) {
                    log.verbose(`Dropped a creative break from ${session.identity.name}, who is not in creative`);
                    world.resendBlock(blockPosition.getX(), blockPosition.getY(), blockPosition.getZ());
                    return;
                }

                // In this unit, as the predicted break above.
                world.breakBlock(blockPosition, player);
                return;
            }

            // The end of a survival break. The `finish` or the InventoryTransaction that comes
            // with it, depending on the breaking mode, is what carries the block, so there is
            // nothing to do here - and `breakBlock` would ignore a second attempt anyway.
            case 'stop': {
                return;
            }

            // Every swing after the first. The client sends one per punch for as long as the
            // button is held, and each is a hit to be heard - this is the sound of digging.
            case 'swing': {
                world.hitBlock(blockPosition, blockFace, player);
                return;
            }
        }
    }
}

/**
 * Why a survival player's prediction that a block broke is not to be believed, or null when it is.
 *
 * Reads the loaded chunk only; the step was dropped before this for a block in one that is not.
 * @param blockPosition - The block the client says gave way.
 * @param mining - What the server was timing the player mining, before the prediction.
 * @param world - The player's world.
 * @param player - Who predicted it, whose tool and effects the break time allows for.
 * @param now - The tick the prediction is applied in, on the clock mining was started on, and the
 *   client's input count, on the clock of `BlockMining.startedAtInput`.
 */
const refusePrediction = (
    blockPosition: BlockPosition,
    mining: BlockMining | null,
    world: Pick<World, 'loadedBlockRuntimeIdAt' | 'loadedBlock'>,
    player: Pick<StorePlayer, 'getInventory' | 'getStatusEffects'>,
    now: { readonly tick: number; readonly input: number }
): string | null => {
    const x = blockPosition.getX();
    const y = blockPosition.getY();
    const z = blockPosition.getZ();

    if (mining !== null && mining.position.equals(blockPosition)) {
        // The time was measured for the block mining started on. Something else standing there
        // now, put down since, has not been mined at all.
        if (world.loadedBlockRuntimeIdAt(x, y, z) !== mining.runtimeId) return 'the block changed since mining began';

        const needed = minimumBreakTicks(mining, player.getStatusEffects());
        // The longer of the server's ticks and the client's. A server that falls behind skips
        // ticks to catch up, and a break the client mined in real time then spans fewer server
        // ticks than it took; the client's inputs kept coming one a tick all the while.
        const took = Math.max(
            now.tick - mining.startedAt,
            mining.startedAtInput === undefined ? 0 : now.input - mining.startedAtInput
        );
        if (!Number.isFinite(needed)) return 'the block cannot be broken';
        return took >= needed ? null : `it was mined for ${took} of the ${needed} ticks it needs`;
    }

    // No mining to time, which is right only for a block that gives way at once.
    const block = world.loadedBlock(x, y, z);
    if (block === undefined) return 'the block is not loaded';
    const breakTicks = block.getBreakTicks(player.getInventory().equipment('mainhand'));
    return breakTicks <= 0 ? null : 'it is not the block being mined';
};
