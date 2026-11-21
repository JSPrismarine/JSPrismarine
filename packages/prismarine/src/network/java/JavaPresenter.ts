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
    CHANGE_GAME_MODE,
    GameEvent,
    SynchronizePlayerPosition,
    SystemChat
} from '@jsprismarine/protocol/java/packet/play';
import type { JavaText } from '@jsprismarine/protocol/java/wire/javaTypes';

import { EYE_HEIGHT } from '../../entity/playerEyes';
import type { SessionPresenter, ShownMessage, ShownMove } from '../presenter/SessionPresenter';

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
    /** The id the next server-initiated move carries; the join's position took 1. */
    private nextTeleport = 2;

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

    /** Not shown yet: the player list comes with other players in PR 10. */
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

    /** Sends `System Chat Message` with the message as Java text; see {@link javaTextOf}. */
    public async sendMessage(message: ShownMessage): Promise<void> {
        this.send(SystemChat, { content: javaTextOf(message), overlay: false });
    }
}
