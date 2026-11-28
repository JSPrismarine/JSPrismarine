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
import type { JavaPacketDefinition, JavaPayload } from '@jsprismarine/protocol/java/packet/JavaPacket';
import {
    Attack,
    BlockChangedAck,
    ChatCommand,
    ChatMessage,
    ClientCommand,
    ClientCommandAction,
    ConfirmTeleportation,
    EditBook,
    Interact,
    JavaCommandBlockFlag,
    JavaCommandBlockMode,
    JavaHand,
    JavaRecipeBookType,
    JavaStructureUpdateType,
    MOVE_ON_GROUND,
    MovePlayerPos,
    MovePlayerPosRot,
    MovePlayerRot,
    MovePlayerStatusOnly,
    PickItemFromBlock,
    PickItemFromEntity,
    PlayerAction,
    PlayerCommand,
    PlayerCommandAction,
    PlayerInput,
    PlayerInputFlag,
    PlayClientInformation,
    PlayerLoaded,
    PlayPingRequest,
    PlayPongResponse,
    PlayServerboundPluginMessage,
    RecipeBookChangeSettings,
    ServerboundKeepAlive,
    SetCarriedItem,
    SetCommandBlock,
    SetCommandMinecart,
    SetStructureBlock,
    SetCreativeModeSlot,
    UseItem,
    UseItemOn
} from '@jsprismarine/protocol/java/packet/play';

import { EYE_HEIGHT } from '../../../entity/playerEyes';
import type { CommandBlockModeName, Intent, IntentKind, RecipeBook } from '../../../input/Intent';
import type PlayerSession from '../../../player/PlayerSession';
import { javaLocaleOf, javaViewDistanceOf } from '../javaClientInformation';
import type { JavaWorldHost } from '../JavaConnections';
import { hearPluginMessage } from '../javaPlay';
import { javaCreativeSlotIntentOf, javaHotbarIntentOf } from '../javaInventory';
import { isBlockStatus, javaDropIntentOf, javaMiningIntentOf, javaReleaseIntentOf } from '../javaMining';
import { javaUseItemOnIntentOf } from '../javaUseItemOn';
import { outOfTurn } from './loginHandlers';
import type { JavaContext, JavaPacketHandler } from './JavaPacketHandler';
import { javaHandler } from './JavaPacketHandler';

/** The recipe book each of vanilla's `RecipeBookType`s is. */
const RECIPE_BOOK_OF: ReadonlyMap<number, RecipeBook> = new Map([
    [JavaRecipeBookType.Crafting, 'crafting'],
    [JavaRecipeBookType.Furnace, 'furnace'],
    [JavaRecipeBookType.BlastFurnace, 'blastFurnace'],
    [JavaRecipeBookType.Smoker, 'smoker']
]);

/** The behavior family's name for each of vanilla's command block modes. */
const COMMAND_BLOCK_MODE_OF: ReadonlyMap<number, CommandBlockModeName> = new Map([
    [JavaCommandBlockMode.Redstone, 'impulse'],
    [JavaCommandBlockMode.Auto, 'repeat'],
    [JavaCommandBlockMode.Sequence, 'chain']
]);

/** The hotbar's slots, which a Java book edit names; 40, the off hand, is no slot of the inventory's. */
const HOTBAR_SLOTS = 9;

/** The most pages vanilla's `Edit Book` codec takes. */
const MAX_JAVA_BOOK_PAGES = 100;

/** The action each of vanilla's structure block update types asks for, beside the settings every one carries. */
const STRUCTURE_OPERATION_OF: ReadonlyMap<number, string> = new Map([
    [JavaStructureUpdateType.SaveArea, 'save'],
    [JavaStructureUpdateType.LoadArea, 'load'],
    [JavaStructureUpdateType.ScanArea, 'scan']
]);

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
        const wasOnGround = pose.onGround;
        const fromY = pose.y;
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
        const { players } = world;
        connection.queue(
            players.intent(session, {
                kind: 'move',
                position: { x: pose.x, y: pose.y + EYE_HEIGHT, z: pose.z },
                pitch: pose.pitch,
                yaw: pose.yaw,
                headYaw: pose.yaw,
                onGround: pose.onGround,
                handledTeleport
            })
        );
        // A Java client sends no jump of its own: a player that left the ground going up jumped.
        // @javaSee ServerGamePacketListenerImpl.handleMovePlayer
        if (wasOnGround && !pose.onGround && pose.y > fromY)
            connection.queue(players.intent(session, { kind: 'jump' }));
    });

/**
 * What a player in the world sends that the server reads. The rest, such as the client's tick end,
 * waits for the slices of `docs/plans/java-multiprotocol.md` that bring it.
 */
export const PLAY_HANDLERS: readonly JavaPacketHandler[] = [
    javaHandler(ServerboundKeepAlive, ({ id }, { connection }) => {
        connection.keepAlive?.answered(id);
    }),
    // The ping chart on the client's debug screen times this round trip.
    javaHandler(PlayPingRequest, (ping, { connection }) => connection.send(PlayPongResponse, ping)),
    javaHandler(PlayServerboundPluginMessage, (message, context) => hearPluginMessage(message, context)),
    // A changed setting: the language a script reads, and the view distance, which the session
    // grants as it grants a Bedrock client's radius request. One changed while the player is
    // still joining is kept for the join, which reads it once the player is in the world.
    javaHandler(PlayClientInformation, (information, context) => {
        context.connection.information = information;
        if (context.connection.session === undefined) return;
        const { session, world } = inWorld(context, PlayClientInformation);
        session.getPlayer().locale = javaLocaleOf(information.language);
        // Against the last radius asked for rather than the session's, which an earlier request
        // still waiting for the input step has yet to change.
        const radius = javaViewDistanceOf(information.viewDistance, world.viewDistance());
        if (radius === context.connection.viewDistance) return;
        context.connection.viewDistance = radius;
        context.connection.queue(world.players.intent(session, { kind: 'setViewDistance', radius, maxRadius: 0 }));
    }),
    // The position the client accepted, which a respawn or a teleport moved it to, is where its
    // next move that leaves the position out starts from.
    javaHandler(ConfirmTeleportation, ({ x, y, z, yaw, pitch }, { connection }) => {
        connection.teleportHandled = true;
        if (connection.pose !== undefined) Object.assign(connection.pose, { x, y, z, yaw, pitch });
    }),
    // The client loaded the world around its player, which ends its join.
    intentHandler(PlayerLoaded, (_, { connection }) => {
        connection.loaded = true;
        return { kind: 'playerInitialized' };
    }),
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
    intentHandler(SetCreativeModeSlot, (stack, { services }) =>
        javaCreativeSlotIntentOf(stack, services.items, services.options.customItems)
    ),
    // The death screen's button; statistics are not kept.
    intentHandler(ClientCommand, ({ action }) =>
        action === ClientCommandAction.PerformRespawn ? { kind: 'pressRespawn' } : undefined
    ),
    // Sprinting starts and stops by command; getting out of bed is one too. The rest, a riding
    // jump, a ridden inventory and a glide, wait for riding and elytra.
    intentHandler(PlayerCommand, ({ action }) => {
        switch (action) {
            case PlayerCommandAction.StartSprinting:
                return { kind: 'setSprinting', sprinting: true };
            case PlayerCommandAction.StopSprinting:
                return { kind: 'setSprinting', sprinting: false };
            case PlayerCommandAction.StopSleeping:
                return { kind: 'setSleeping', sleeping: false };
            default:
                return undefined;
        }
    }),
    // The held keys, each time they change: the jump and sneak buttons scripts hear of, and the
    // sneak itself, which a Java client says only here.
    javaHandler(PlayerInput, ({ flags }, context) => {
        const { session, world } = inWorld(context, PlayerInput);
        const sneak = (flags & PlayerInputFlag.Shift) !== 0;
        const { connection } = context;
        connection.queue(
            world.players.intent(session, { kind: 'holdButtons', jump: (flags & PlayerInputFlag.Jump) !== 0, sneak })
        );
        connection.queue(world.players.intent(session, { kind: 'setSneaking', sneaking: sneak }));
    }),
    // A middle click. Java's entity ids are the server's runtime ids.
    intentHandler(PickItemFromBlock, ({ position, includeData }) => ({
        kind: 'pickBlock',
        position,
        withData: includeData
    })),
    intentHandler(PickItemFromEntity, ({ entityId, includeData }) => ({
        kind: 'pickEntity',
        target: BigInt(entityId),
        withData: includeData
    })),
    // A use at nothing. As with a use on a block, a Java client sends the off hand's only when the
    // main hand's did nothing, and the server uses what the main hand holds either way.
    acknowledgedHandler(UseItem, ({ hand, sequence }) => ({
        intent: hand === JavaHand.Main ? { kind: 'useItem', held: false } : undefined,
        sequence
    })),
    intentHandler(Attack, ({ entityId }) => ({ kind: 'attackEntity', target: BigInt(entityId) })),
    // The off hand's interaction follows the main hand's that did nothing, as a use's does.
    intentHandler(Interact, ({ entityId, hand }) =>
        hand === JavaHand.Main ? { kind: 'interactEntity', target: BigInt(entityId) } : undefined
    ),
    // A recipe book opened, closed or filtered. An ordinal past the four books is no book.
    intentHandler(RecipeBookChangeSettings, ({ bookType, isOpen, isFiltering }) => {
        const book = RECIPE_BOOK_OF.get(bookType);
        return book === undefined ? undefined : { kind: 'setRecipeBook', book, open: isOpen, filtering: isFiltering };
    }),
    // The whole book, signed when it carries a title. An off-hand book, slot 40, is not one the
    // server's inventory holds, and more pages than vanilla's codec takes is no client's.
    intentHandler(EditBook, ({ slot, pages, title }) =>
        slot >= 0 && slot < HOTBAR_SLOTS && pages.length <= MAX_JAVA_BOOK_PAGES
            ? { kind: 'editBook', slot, edit: { kind: 'setPages', pages, title } }
            : undefined
    ),
    // A Java screen sends no name, tick delay or first-tick setting, so the block keeps its own.
    intentHandler(SetCommandBlock, ({ position, command, mode, flags }) => {
        const named = COMMAND_BLOCK_MODE_OF.get(mode);
        return named === undefined
            ? undefined
            : {
                  kind: 'editCommandBlock',
                  position,
                  mode: named,
                  conditional: (flags & JavaCommandBlockFlag.Conditional) !== 0,
                  needsRedstone: (flags & JavaCommandBlockFlag.Automatic) === 0,
                  command,
                  trackOutput: (flags & JavaCommandBlockFlag.TrackOutput) !== 0
              };
    }),
    intentHandler(SetCommandMinecart, ({ entityId, command, trackOutput }) => ({
        kind: 'editCommandMinecart',
        target: BigInt(entityId),
        command,
        trackOutput
    })),
    // Every update stores the screen's settings, and a save, a load or a scan then acts on the
    // area, as vanilla's `handleSetStructureBlock` does.
    javaHandler(SetStructureBlock, ({ position, name, updateType }, context) => {
        const { session, world } = inWorld(context, SetStructureBlock);
        const { connection } = context;
        connection.queue(world.players.intent(session, { kind: 'editStructureBlock', position, structure: name }));
        const operation = STRUCTURE_OPERATION_OF.get(updateType);
        if (operation !== undefined) {
            connection.queue(
                world.players.intent(session, { kind: 'useStructureBlock', position, structure: name, operation })
            );
        }
    }),
    acknowledgedHandler(UseItemOn, (use) => ({ intent: javaUseItemOnIntentOf(use), sequence: use.sequence })),
    acknowledgedHandler(PlayerAction, (action, session) => ({
        intent:
            javaMiningIntentOf(action, session.getPlayer().gamemode) ??
            javaDropIntentOf(action.status) ??
            javaReleaseIntentOf(action.status),
        // Only the block statuses are numbered for an answer, whether the server acted on them or not.
        sequence: isBlockStatus(action.status) ? action.sequence : undefined
    }))
];
