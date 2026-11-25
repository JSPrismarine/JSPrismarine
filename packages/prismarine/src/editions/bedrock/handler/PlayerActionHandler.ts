import { PlayerActionType } from '@jsprismarine/protocol';
import type PlayerActionPacket from '@jsprismarine/protocol/bedrock/packet/PlayerActionPacket';

import type { Intent, MiningStep } from '../../../input/Intent';
import BlockPosition from '../../../world/BlockPosition';
import type { InputContext } from '../../../player/context/HandlerContext';
import type { InputLaneHandler } from '../../../player/context/SessionHandler';

/**
 * The actions that are movement, and the intent each one is. A jump, a sprint and a sneak also
 * arrive as flags of `PlayerAuthInput`, which `PlayerAuthInputHandler` hands to the same intents.
 */
export const MOVEMENT_INTENTS_OF: ReadonlyMap<number, Intent<MovementIntentKind>> = new Map<
    number,
    Intent<MovementIntentKind>
>([
    [PlayerActionType.StartJump, { kind: 'jump' }],
    [PlayerActionType.StartSprinting, { kind: 'setSprinting', sprinting: true }],
    [PlayerActionType.StopSprinting, { kind: 'setSprinting', sprinting: false }],
    [PlayerActionType.StartSneaking, { kind: 'setSneaking', sneaking: true }],
    [PlayerActionType.StopSneaking, { kind: 'setSneaking', sneaking: false }],
    [PlayerActionType.StartFlying, { kind: 'setFlying', flying: true }],
    [PlayerActionType.StopFlying, { kind: 'setFlying', flying: false }],
    [PlayerActionType.StartSleeping, { kind: 'setSleeping', sleeping: true }],
    [PlayerActionType.StopSleeping, { kind: 'setSleeping', sleeping: false }]
]);

/** The intents a movement action decodes into. */
type MovementIntentKind = 'jump' | 'setSprinting' | 'setSneaking' | 'setFlying' | 'setSleeping';

/**
 * The actions that are steps of mining a block, as the `mineBlock` intent names them. Only these
 * read the block position; every other action concerns no block and arrives carrying the origin,
 * which must not be taken for a position the player is standing nowhere near.
 */
const MINING_STEPS_OF: ReadonlyMap<number, MiningStep> = new Map([
    [PlayerActionType.StartDestroyBlock, 'start'],
    [PlayerActionType.ContinueDestroyBlock, 'continue'],
    [PlayerActionType.AbortDestroyBlock, 'abort'],
    [PlayerActionType.StopDestroyBlock, 'stop'],
    [PlayerActionType.CrackBlock, 'swing'],
    [PlayerActionType.PredictDestroyBlock, 'finish'],
    [PlayerActionType.CreativeDestroyBlock, 'instant']
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
                `Dropped action ${data.action} from ${session.identity.name}: it names runtime id ${data.runtimeEntityId}, not their own`
            );
            return;
        }

        if (INPUT_ONLY_ACTIONS.has(data.action)) {
            log.debug(
                `Ignored action ${data.action} from ${session.identity.name}: block actions arrive in PlayerAuthInputPacket`
            );
            return;
        }

        const blockPosition = new BlockPosition(data.blockPosition.x, data.blockPosition.y, data.blockPosition.z);
        this.handleAction(data.action, blockPosition, data.blockFace, context);
    }

    /**
     * Acts on one action.
     *
     * Synchronous, as the input step needs. A step of mining a block goes to the `mineBlock`
     * intent's handlers.
     * @param {number} action - a {@link PlayerActionType}.
     * @param {BlockPosition} blockPosition - the block it concerns, or the origin for those that concern none.
     * @param {number} blockFace - the face of that block.
     * @param {InputContext} context - who did it, and the input step that applies it.
     */
    public handleAction(
        action: number,
        blockPosition: BlockPosition,
        blockFace: number,
        context: InputContext
    ): undefined {
        const { session, log, config, services, step } = context;

        // Movement goes to the intents both editions decode into.
        const movement = MOVEMENT_INTENTS_OF.get(action);
        if (movement !== undefined) {
            const moved = services.intents.handle(movement, context);
            if (moved instanceof Promise) step.output(moved);
            return;
        }

        // Mining goes to the intent both editions decode into, through the handlers plugins merge with.
        const miningStep = MINING_STEPS_OF.get(action);
        if (miningStep !== undefined) {
            const mined = services.intents.handle(
                {
                    kind: 'mineBlock',
                    step: miningStep,
                    position: { x: blockPosition.getX(), y: blockPosition.getY(), z: blockPosition.getZ() },
                    face: blockFace,
                    serverTimed: config.getServerAuthoritativeBlockBreaking(),
                    breaksIfInstant: false
                },
                context
            );
            if (mined instanceof Promise) step.output(mined);
            return;
        }

        switch (action) {
            case PlayerActionType.Respawn: {
                const pressed = services.intents.handle({ kind: 'pressRespawn' }, context);
                if (pressed instanceof Promise) step.output(pressed);
                return;
            }

            // Accepted, and nothing done. The client has already done what each of these
            // says, and the server keeps no swimming, gliding, crawling or spin attack state
            // to bring up to date; the docs' expected answers (a `SetActorDataPacket` flag for
            // most) wait on that state existing. `ChangeDimensionAck` is the client echoing
            // the one the server sent in `PlayerSession.changeWorld`; the change itself ends
            // on the `EndLoadingScreen` that follows it. `DenyDestroyBlock` is EDU only.
            // `HandledTeleport` was how a client that moved with `MovePlayer` acknowledged a
            // teleport. That movement mode is gone (protocol 818), and a client now says so
            // with the input flag of the same name, which `holdsMovementForTeleport` reads.
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
                log.verbose(`Dropped action ${action} from ${session.identity.name}: not one a client sends`);
                break;
            }
        }
    }
}
