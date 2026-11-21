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
import {
    AddEntity,
    CHANGE_GAME_MODE,
    GameEvent,
    PlayerInfoAction,
    PlayerInfoAdd,
    PlayerInfoRemove,
    RemoveEntities,
    RotateHead,
    SynchronizePlayerPosition,
    SystemChat,
    TeleportEntity
} from '@jsprismarine/protocol/java/packet/play';
import type { JavaText } from '@jsprismarine/protocol/java/wire/javaTypes';
import { hyphenatedUuid } from '@jsprismarine/protocol/java/wire/javaTypes';

import { EYE_HEIGHT } from '../../entity/playerEyes';
import type { SessionPresenter, ShownEntityMove, ShownMessage, ShownMove } from '../presenter/SessionPresenter';
import type { ShownEntity } from '../../world/ShownActor';
import { javaEntityTranslation } from './editionTranslation';

/** A UUID for an entity that has none of its own to show, made from its id so it stays the same. */
const entityUuidOf = (runtimeId: bigint): string => hyphenatedUuid(runtimeId.toString(16).padStart(32, '0'));

/** Sends one Java packet to the session's client. */
export type JavaSend = <T>(definition: JavaPacketDefinition<T>, value: T) => void;

/** Java's game modes, by Bedrock's numbers: Bedrock's spectator is 6, Java's is 3. */
export const javaGameModeOf = (gamemode: Gametype): number =>
    gamemode === Gametype.SPECTATOR ? 3 : gamemode === Gametype.CREATIVE ? 1 : gamemode === Gametype.ADVENTURE ? 2 : 0;

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
     */
    public constructor(
        private readonly send: JavaSend,
        private readonly ownRuntimeId: bigint
    ) {}

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

    /** Sends `System Chat Message` with the message as Java text; see {@link javaTextOf}. */
    public async sendMessage(message: ShownMessage): Promise<void> {
        this.send(SystemChat, { content: javaTextOf(message), overlay: false });
    }
}
