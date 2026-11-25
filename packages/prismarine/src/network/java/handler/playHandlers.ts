/**
 * The play phase: what a player in the world does. Each packet decodes into the intent a Bedrock
 * client's packet decodes into, run by the same handlers in the same input step, and a move goes
 * through the movement a Bedrock input applies
 * ([ADR 0027](../../../../../../docs/adr/0027-player-inputs-are-decoded-into-intents.md)).
 *
 * Each input is queued for the input step and the next packet is read at once, as a Bedrock
 * client's are: waiting a tick on each one let a lagging server fall further behind the client with
 * every packet.
 */
import { Vector3 } from '@jsprismarine/math';
import type { JavaPacketDefinition, JavaPayload } from '@jsprismarine/protocol/java/packet/JavaPacket';
import {
    BlockChangedAck,
    ChatCommand,
    ChatMessage,
    ClientCommand,
    ClientCommandAction,
    ConfirmTeleportation,
    MOVE_ON_GROUND,
    MovePlayerPos,
    MovePlayerPosRot,
    MovePlayerRot,
    MovePlayerStatusOnly,
    PlayerAction,
    PlayerLoaded,
    ServerboundKeepAlive,
    SetCarriedItem,
    SetCreativeModeSlot,
    UseItemOn
} from '@jsprismarine/protocol/java/packet/play';

import { EYE_HEIGHT } from '../../../entity/playerEyes';
import type { Intent, IntentKind } from '../../../input/Intent';
import type PlayerSession from '../../PlayerSession';
import type { JavaWorldHost } from '../JavaConnections';
import { javaCreativeSlotIntentOf, javaHotbarIntentOf } from '../javaInventory';
import { isBlockStatus, javaMiningIntentOf } from '../javaMining';
import { javaUseItemOnIntentOf } from '../javaUseItemOn';
import { outOfTurn } from './loginHandlers';
import type { JavaContext, JavaPacketHandler } from './JavaPacketHandler';
import { javaHandler } from './JavaPacketHandler';

/** The player's session and world, which every packet of a player in the world needs. */
const inWorld = (
    { connection, services }: JavaContext,
    definition: JavaPacketDefinition
): { readonly session: PlayerSession; readonly world: JavaWorldHost } => {
    const { session } = connection;
    const { world } = services.options;
    if (session === undefined || world === undefined) throw outOfTurn(connection, definition);
    return { session, world };
};

/**
 * A handler that runs the intent a packet decodes into, if it decodes into one.
 * @param packet - The packet.
 * @param intentOf - The intent, or undefined for a packet the world does nothing with.
 * @returns The handler.
 */
const intentHandler = <D extends JavaPacketDefinition, K extends IntentKind>(
    packet: D,
    intentOf: (payload: JavaPayload<D>, context: JavaContext) => Intent<K> | undefined
): JavaPacketHandler<D> =>
    javaHandler(packet, (payload, context) => {
        const { session, world } = inWorld(context, packet);
        const intent = intentOf(payload, context);
        if (intent !== undefined) context.connection.queue(world.players.intent(session, intent));
    });

/**
 * A handler of a block packet the client numbered, which the server answers with
 * `Acknowledge Block Change` once the intent it decoded into has applied. The input step applies
 * the intent and the same synchronous tick sends the blocks it changed (ADR 0015), so the answer
 * follows them, as vanilla's does. An answer before them would put the predicted block back on the
 * client's screen for a tick.
 */
const acknowledgedHandler = <D extends JavaPacketDefinition>(
    packet: D,
    of: (
        payload: JavaPayload<D>,
        session: PlayerSession
    ) => { readonly intent: Intent<IntentKind> | undefined; readonly sequence: number | undefined }
): JavaPacketHandler<D> =>
    javaHandler(packet, (payload, context) => {
        const { session, world } = inWorld(context, packet);
        const { connection } = context;
        const { intent, sequence } = of(payload, session);
        const applied = intent === undefined ? Promise.resolve() : world.players.intent(session, intent);
        connection.queue(
            sequence === undefined ? applied : applied.then(() => connection.send(BlockChangedAck, { sequence }))
        );
    });

/**
 * One move packet, as the movement a Bedrock input reports; the session brings the chunks it moves
 * the player toward into view, as it does a Bedrock player's.
 * Each move packet carries part of the pose, and the rest is the last move's.
 */
const moveHandler = <D extends JavaPacketDefinition>(
    packet: D,
    read: (payload: JavaPayload<D>) => {
        readonly position?: { readonly x: number; readonly y: number; readonly z: number };
        readonly rotation?: { readonly yaw: number; readonly pitch: number };
        readonly flags: number;
    }
): JavaPacketHandler<D> =>
    javaHandler(packet, (payload, context) => {
        const { session, world } = inWorld(context, packet);
        const { connection } = context;
        const pose = connection.pose!;
        const { position, rotation, flags } = read(payload);
        if (position !== undefined) {
            pose.x = position.x;
            pose.y = position.y;
            pose.z = position.z;
        }
        if (rotation !== undefined) {
            pose.yaw = rotation.yaw;
            pose.pitch = rotation.pitch;
        }
        pose.onGround = (flags & MOVE_ON_GROUND) !== 0;
        const handledTeleport = connection.teleportHandled === true;
        connection.teleportHandled = false;
        connection.queue(
            world.players.move(session, {
                position: new Vector3(pose.x, pose.y + EYE_HEIGHT, pose.z),
                pitch: pose.pitch,
                yaw: pose.yaw,
                headYaw: pose.yaw,
                onGround: pose.onGround,
                handledTeleport
            })
        );
    });

/**
 * What a player in the world sends that the server reads. The rest, such as the client's tick end,
 * waits for the slices of `docs/plans/java-multiprotocol.md` that bring it.
 */
export const PLAY_HANDLERS: readonly JavaPacketHandler[] = [
    javaHandler(ServerboundKeepAlive, ({ id }, { connection }) => {
        connection.keepAlive?.answered(id);
    }),
    // The position the client accepted, which a respawn or a teleport moved it to, is where its
    // next move that leaves the position out starts from.
    javaHandler(ConfirmTeleportation, ({ x, y, z, yaw, pitch }, { connection }) => {
        connection.teleportHandled = true;
        if (connection.pose !== undefined) Object.assign(connection.pose, { x, y, z, yaw, pitch });
    }),
    intentHandler(PlayerLoaded, () => ({ kind: 'playerInitialized' })),
    intentHandler(ChatMessage, ({ message }) => ({ kind: 'chat', message })),
    intentHandler(ChatCommand, ({ command }) => ({ kind: 'runCommand', command })),
    moveHandler(MovePlayerPos, ({ x, y, z, flags }) => ({ position: { x, y, z }, flags })),
    moveHandler(MovePlayerPosRot, ({ x, y, z, yaw, pitch, flags }) => ({
        position: { x, y, z },
        rotation: { yaw, pitch },
        flags
    })),
    moveHandler(MovePlayerRot, ({ yaw, pitch, flags }) => ({ rotation: { yaw, pitch }, flags })),
    moveHandler(MovePlayerStatusOnly, ({ flags }) => ({ flags })),
    intentHandler(SetCarriedItem, ({ slot }) => javaHotbarIntentOf(slot)),
    intentHandler(SetCreativeModeSlot, (stack, { services }) => javaCreativeSlotIntentOf(stack, services.items)),
    // The death screen's button; statistics are not kept.
    intentHandler(ClientCommand, ({ action }) =>
        action === ClientCommandAction.PerformRespawn ? { kind: 'pressRespawn' } : undefined
    ),
    acknowledgedHandler(UseItemOn, (use) => ({ intent: javaUseItemOnIntentOf(use), sequence: use.sequence })),
    acknowledgedHandler(PlayerAction, (action, session) => ({
        intent: javaMiningIntentOf(action, session.getPlayer().gamemode),
        // Only the block statuses are numbered for an answer, whether the server acted on them or not.
        sequence: isBlockStatus(action.status) ? action.sequence : undefined
    }))
];
