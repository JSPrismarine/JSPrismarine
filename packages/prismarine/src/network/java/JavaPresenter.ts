/**
 * The outbound contract in Java Edition packets
 * ([ADR 0026](../../../../../docs/adr/0026-java-is-a-second-protocol-family-over-one-world.md)).
 *
 * It covers what the first milestone shows a Java player: chat and system messages, its own
 * position, and its game mode. The rest of the contract has no Java packet yet and sends nothing,
 * each saying which slice of `docs/plans/java-multiprotocol.md` brings it.
 */
import { Gametype } from '@jsprismarine/minecraft';
import type { JavaPacketDefinition } from '@jsprismarine/protocol/java/packet/JavaPacket';
import type { JavaItemStack, SectionBlock } from '@jsprismarine/protocol/java/packet/play';
import {
    AddEntity,
    BlockUpdate,
    CHANGE_GAME_MODE,
    ContainerSetContent,
    ContainerSetSlot,
    PlayerCombatKill,
    Respawn,
    SetHealth,
    START_WAITING_FOR_LEVEL_CHUNKS,
    GameEvent,
    PlayerInfoAction,
    PlayerInfoAdd,
    PlayerInfoRemove,
    RemoveEntities,
    RotateHead,
    SectionBlocksUpdate,
    SetHeldSlot,
    SynchronizePlayerPosition,
    SystemChat,
    TeleportEntity
} from '@jsprismarine/protocol/java/packet/play';
import { CONFIGURATION } from '@jsprismarine/protocol/java/versions/26.3/configuration';
import type { JavaText } from '@jsprismarine/protocol/java/wire/javaTypes';
import { hyphenatedUuid } from '@jsprismarine/protocol/java/wire/javaTypes';

import { EYE_HEIGHT } from '../../entity/playerEyes';
import type {
    SessionPresenter,
    ShownBlockChange,
    ShownContainer,
    ShownDeath,
    ShownEntityMove,
    ShownInventory,
    ShownMessage,
    ShownMove,
    ShownStack,
    ShownVitals
} from '../presenter/SessionPresenter';
import type { ShownEntity } from '../../world/ShownActor';
import type { EditionTranslation } from './editionTranslation';
import { javaBlockTranslation, javaEntityTranslation, javaItemTranslation } from './editionTranslation';

/** A UUID for an entity that has none of its own to show, made from its id so it stays the same. */
const entityUuidOf = (runtimeId: bigint): string => hyphenatedUuid(runtimeId.toString(16).padStart(32, '0'));

/** The player's own inventory window, which the client always has. */
const INVENTORY_WINDOW = 0;

/** The slots of the player's inventory window: the crafting result, its grid, armor, the inventory and the off hand. */
const WINDOW_SLOTS = 46;

/**
 * Where a slot of the player's containers sits in its Java inventory window: armor from 5, head
 * first, the 27 slots above the hotbar from 9, the hotbar from 36, and the off hand at 45.
 * @param container - The container.
 * @param slot - The slot within it, numbered as the server numbers it.
 */
export const javaWindowSlotOf = (container: ShownContainer, slot: number): number => {
    if (container === 'armor') return 5 + slot;
    if (container === 'offhand') return 45;
    return slot < 9 ? 36 + slot : slot;
};

/** Sends one Java packet to the session's client. */
export type JavaSend = <T>(definition: JavaPacketDefinition<T>, value: T) => void;

/** Java's game modes, by Bedrock's numbers: Bedrock's spectator is 6, Java's is 3. */
export const javaGameModeOf = (gamemode: Gametype): number =>
    gamemode === Gametype.SPECTATOR ? 3 : gamemode === Gametype.CREATIVE ? 1 : gamemode === Gametype.ADVENTURE ? 2 : 0;

/** The dimension type registry a client was configured with, in network id order. */
const DIMENSION_TYPES: readonly string[] =
    CONFIGURATION.registries.find(({ registry }) => registry === 'minecraft:dimension_type')?.entries ?? [];

/**
 * The world a Java player spawns into, as `Login (play)` and `Respawn` both carry it: the
 * overworld, where every Java player is until dimensions reach Java clients.
 * @param gamemode - The player's game mode.
 * @returns The spawn fields.
 */
export const overworldSpawnInfo = (gamemode: Gametype) => ({
    dimensionType: Math.max(0, DIMENSION_TYPES.indexOf('minecraft:overworld')),
    dimension: 'minecraft:overworld',
    hashedSeed: 0n,
    gameMode: javaGameModeOf(gamemode),
    previousGameMode: null,
    isDebug: false,
    isFlat: false,
    deathLocation: null,
    portalCooldown: 0,
    seaLevel: 63
});

/**
 * A message as Java text. A player's chat takes vanilla's `chat.type.text` translation, which
 * draws `<name> message`; a Bedrock translation key loses the `%` Bedrock marks it with; a
 * `rawtext` object, which `/tellraw` sends, is read for its text.
 * @param message - The message.
 * @returns The text.
 */
export const javaTextOf = ({ message, kind, parameters, needsTranslation, sourceName }: ShownMessage): JavaText => {
    if (kind === 'chat' && sourceName !== '') return { translate: 'chat.type.text', with: [sourceName, message] };
    if (needsTranslation || kind === 'translation') {
        return {
            translate: message.replace(/^%/, ''),
            with: parameters.map((parameter) => parameter.replace(/^%/, ''))
        };
    }
    if (kind === 'rawText') {
        try {
            // A command's argument, parsed for its text and never run.
            const parsed: unknown = JSON.parse(message);
            const rawtext =
                typeof parsed === 'object' && parsed !== null && 'rawtext' in parsed ? parsed.rawtext : undefined;
            if (Array.isArray(rawtext)) {
                return rawtext
                    .map((part: unknown) =>
                        typeof part === 'object' && part !== null && 'text' in part && typeof part.text === 'string'
                            ? part.text
                            : ''
                    )
                    .join('');
            }
        } catch {
            // Not JSON after all; it is shown as written.
        }
    }
    return message;
};

/** One Java client's half of a session. */
export class JavaPresenter implements SessionPresenter {
    public readonly edition = 'java';
    /** The id the next server-initiated move carries; the join's position took 1. */
    private nextTeleport = 2;
    /** The players the client was shown, by entity, whose profiles leave its tab list with them. */
    private readonly shownPlayers = new Map<bigint, string>();
    private readonly entities = javaEntityTranslation();

    /**
     * @param send - Sends to the session's client.
     * @param ownRuntimeId - The session's own player, whose moves its client is told.
     * @param blocks - Bedrock runtime ids to Java state ids, which every Java session can share.
     * @param items - Bedrock item identifiers to Java item ids, which every Java session can share.
     */
    public constructor(
        private readonly send: JavaSend,
        private readonly ownRuntimeId: bigint,
        private readonly blocks: EditionTranslation<number, number> = javaBlockTranslation(),
        private readonly items: EditionTranslation<string, number | undefined> = javaItemTranslation()
    ) {}

    /**
     * The window's state id, which the client echoes with each click so the server can tell a click
     * made on a stale screen. Moved on with every change the server sends.
     */
    private stateId = 0;

    /** A stack in Java's terms; an item Java has nothing for shows as an empty slot. */
    private javaStackOf(stack: ShownStack | null): JavaItemStack | null {
        const item = stack === null ? undefined : this.items.toJava(stack.name);
        return stack === null || item === undefined ? null : { item, count: stack.count };
    }

    /** Not shown yet: the time of day comes with the world state slice, PR 10. */
    public async sendTime(): Promise<void> {}

    /** Sends `Game Event` 3, which sets the client's own game mode. */
    public async sendGamemode(gamemode: Gametype): Promise<void> {
        this.send(GameEvent, { event: CHANGE_GAME_MODE, value: javaGameModeOf(gamemode) });
    }

    /** Not shown: a Java client is not told the server's default game mode. */
    public async sendDefaultGameMode(): Promise<void> {}

    /** Nothing to answer: a Java client does not wait for the server to confirm a close. */
    public async containerClosed(): Promise<void> {}

    /** Not shown yet: other players' game modes come with the player list in PR 10. */
    public async sendPlayerGameMode(): Promise<void> {}

    /** Not shown: Java has no packet of its own for these; its abilities carry what it needs. */
    public async sendInteractionSettings(): Promise<void> {}

    /** Not shown yet: abilities come with PR 10's player state, and a client keeps its own meanwhile. */
    public async sendAbilities(): Promise<void> {}

    /** Not sent: a Java client's tab list fills as players come into view, from {@link showEntity}. */
    public async sendPlayerList(): Promise<void> {}

    /**
     * Moves the client's own player, whose feet Java places where the contract names its eyes,
     * less the eye height. Another player's move comes with other players in PR 10.
     */
    public async sendMove({ runtimeId, position, yaw, pitch }: ShownMove): Promise<void> {
        if (runtimeId !== this.ownRuntimeId) return;
        this.send(SynchronizePlayerPosition, {
            teleportId: this.nextTeleport++,
            x: position.getX(),
            y: position.getY() - EYE_HEIGHT,
            z: position.getZ(),
            velocityX: 0,
            velocityY: 0,
            velocityZ: 0,
            yaw,
            pitch,
            flags: 0
        });
    }

    /**
     * Shows an entity by its plain facts: a player's profile first, which a player entity needs
     * in the client's tab list, then `Spawn Entity` and the head's facing. An entity with no facts,
     * or of a type Java has no entity for, is not shown.
     */
    public async showEntity(entity: ShownEntity): Promise<void> {
        const facts = entity.describe?.();
        const type = facts === undefined ? undefined : this.entities.toJava(facts.type);
        if (facts === undefined || type === undefined) return;
        const runtimeId = entity.getRuntimeId();
        if (facts.player !== undefined) {
            this.send(PlayerInfoAdd, {
                actions: PlayerInfoAction.AddPlayer | PlayerInfoAction.UpdateListed,
                players: [{ uuid: facts.player.uuid, name: facts.player.name, properties: [], listed: true }]
            });
            this.shownPlayers.set(runtimeId, facts.player.uuid);
        }
        this.send(AddEntity, {
            entityId: Number(runtimeId),
            uuid: facts.player?.uuid ?? entityUuidOf(runtimeId),
            type,
            x: facts.feet.x,
            y: facts.feet.y,
            z: facts.feet.z,
            velocity: null,
            pitch: facts.pitch,
            yaw: facts.yaw,
            headYaw: facts.headYaw,
            data: 0
        });
        this.send(RotateHead, { entityId: Number(runtimeId), headYaw: facts.headYaw });
    }

    /** Sends `Remove Entities`, and takes a player off the tab list too. */
    public async hideEntity(runtimeId: bigint): Promise<void> {
        this.send(RemoveEntities, { entityIds: [Number(runtimeId)] });
        const uuid = this.shownPlayers.get(runtimeId);
        if (uuid === undefined) return;
        this.shownPlayers.delete(runtimeId);
        this.send(PlayerInfoRemove, { uuids: [uuid] });
    }

    /** Sends each move as `Teleport Entity` and the head's facing; a player's eyes become its feet. */
    public async moveEntities(moves: readonly ShownEntityMove[]): Promise<void> {
        for (const { runtimeId, position, yaw, pitch, headYaw, onGround } of moves) {
            const lift = this.shownPlayers.has(runtimeId) ? EYE_HEIGHT : 0;
            this.send(TeleportEntity, {
                entityId: Number(runtimeId),
                x: position.x,
                y: position.y - lift,
                z: position.z,
                velocityX: 0,
                velocityY: 0,
                velocityZ: 0,
                yaw,
                pitch,
                flags: 0,
                onGround
            });
            this.send(RotateHead, { entityId: Number(runtimeId), headYaw });
        }
    }

    /**
     * Sends a section's one changed block as `Block Update`, and a section's several as one
     * `Update Section Blocks`, as vanilla does. A later change to a block in the same tick wins.
     */
    public async showBlocks(changes: readonly ShownBlockChange[]): Promise<void> {
        const sections = new Map<string, { x: number; y: number; z: number; blocks: Map<number, SectionBlock> }>();
        for (const { x, y, z, runtimeId } of changes) {
            const key = `${x >> 4},${y >> 4},${z >> 4}`;
            let section = sections.get(key);
            if (section === undefined) {
                section = { x: x >> 4, y: y >> 4, z: z >> 4, blocks: new Map() };
                sections.set(key, section);
            }
            const block = { state: this.blocks.toJava(runtimeId), x: x & 15, y: y & 15, z: z & 15 };
            section.blocks.set((block.x << 8) | (block.z << 4) | block.y, block);
        }
        for (const section of sections.values()) {
            const blocks = [...section.blocks.values()];
            const [only] = blocks;
            if (blocks.length === 1 && only !== undefined) {
                this.send(BlockUpdate, {
                    position: { x: section.x * 16 + only.x, y: section.y * 16 + only.y, z: section.z * 16 + only.z },
                    state: only.state
                });
            } else this.send(SectionBlocksUpdate, { section: { x: section.x, y: section.y, z: section.z }, blocks });
        }
    }

    /** Sends the inventory window's whole content, then the hotbar slot the hand holds. */
    public async showInventory({ inventory, armor, offhand, handSlot }: ShownInventory): Promise<void> {
        const items = new Array<JavaItemStack | null>(WINDOW_SLOTS).fill(null);
        inventory.forEach((stack, slot) => (items[javaWindowSlotOf('inventory', slot)] = this.javaStackOf(stack)));
        armor.forEach((stack, slot) => (items[javaWindowSlotOf('armor', slot)] = this.javaStackOf(stack)));
        items[javaWindowSlotOf('offhand', 0)] = this.javaStackOf(offhand);
        this.send(ContainerSetContent, { window: INVENTORY_WINDOW, stateId: ++this.stateId, items, carried: null });
        this.send(SetHeldSlot, { slot: handSlot });
    }

    /** Sends one slot of the inventory window. */
    public async showOwnSlot(container: ShownContainer, slot: number, stack: ShownStack | null): Promise<void> {
        this.send(ContainerSetSlot, {
            window: INVENTORY_WINDOW,
            stateId: ++this.stateId,
            slot: javaWindowSlotOf(container, slot),
            item: this.javaStackOf(stack)
        });
    }

    /** Sends `Set Health`: Java's food level is a whole number, as the hunger bar's halves are. */
    public async showVitals({ health, food, saturation }: ShownVitals): Promise<void> {
        this.send(SetHealth, { health, food: Math.round(food), saturation });
    }

    /** Sends `Combat Death` for the client's own player, which opens its death screen with the message. */
    public async showDeath({ key, parameters }: ShownDeath): Promise<void> {
        this.send(PlayerCombatKill, {
            playerId: Number(this.ownRuntimeId),
            message: { translate: key, with: [...parameters] }
        });
    }

    /**
     * Sends `Respawn` into the overworld the client already holds, keeping nothing of the dead
     * player, and the event that has it wait for the chunks around where it comes back, as vanilla
     * does. The position follows from the session.
     */
    public async showRespawn(gamemode: Gametype): Promise<void> {
        this.send(Respawn, { ...overworldSpawnInfo(gamemode), dataToKeep: 0 });
        this.send(GameEvent, { event: START_WAITING_FOR_LEVEL_CHUNKS, value: 0 });
    }

    /** Sends `System Chat Message` with the message as Java text; see {@link javaTextOf}. */
    public async sendMessage(message: ShownMessage): Promise<void> {
        this.send(SystemChat, { content: javaTextOf(message), overlay: false });
    }
}
