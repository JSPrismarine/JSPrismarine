import { Gametype } from '@jsprismarine/minecraft';
import { SetTimePacket, TextPacketType } from '@jsprismarine/protocol';
import ContainerClosePacket from '@jsprismarine/protocol/bedrock/packet/ContainerClosePacket';
import SetDefaultGameTypePacket from '@jsprismarine/protocol/bedrock/packet/SetDefaultGameTypePacket';
import SetPlayerGameTypePacket from '@jsprismarine/protocol/bedrock/packet/SetPlayerGameTypePacket';
import TextPacket from '@jsprismarine/protocol/bedrock/packet/TextPacket';
import UpdateAdventureSettingsPacket from '@jsprismarine/protocol/bedrock/packet/UpdateAdventureSettingsPacket';
import UpdatePlayerGameTypePacket from '@jsprismarine/protocol/bedrock/packet/UpdatePlayerGameTypePacket';

import type ClientConnection from '../ClientConnection';
import type { AbilityTarget } from '../replica/firstSight';
import { abilitiesPacket } from '../replica/firstSight';
import type { MessageKind, SessionPresenter, ShownMessage } from './SessionPresenter';

/**
 * The `Text` type that shows each kind of message. `rawText` is `TextObject`, the one type whose
 * message the client parses as a JSON text object.
 */
const TEXT_TYPE: Readonly<Record<MessageKind, TextPacketType>> = {
    raw: TextPacketType.Raw,
    chat: TextPacketType.Chat,
    translation: TextPacketType.Translate,
    system: TextPacketType.SystemMessage,
    announcement: TextPacketType.Announcement,
    whisper: TextPacketType.Whisper,
    rawText: TextPacketType.TextObject
};

/** The part of a connection a presenter sends through. */
export type PresenterConnection = Pick<ClientConnection, 'sendDataPacket'>;

/** The outbound contract in Bedrock packets, over one client's connection. */
export class BedrockPresenter implements SessionPresenter {
    private readonly connection: PresenterConnection;

    /**
     * @param connection - The connection the session's client is on.
     */
    public constructor(connection: PresenterConnection) {
        this.connection = connection;
    }

    /** Sends `SetTime`. */
    public async sendTime(tick: number): Promise<void> {
        await this.connection.sendDataPacket(new SetTimePacket({ time: tick }));
    }

    /** Sends `SetPlayerGameType`. */
    public async sendGamemode(gamemode: Gametype): Promise<void> {
        await this.connection.sendDataPacket(new SetPlayerGameTypePacket({ gametype: gamemode }));
    }

    /** Sends `SetDefaultGameType`. */
    public async sendDefaultGameMode(gamemode: Gametype): Promise<void> {
        const reply = new SetDefaultGameTypePacket();
        reply.gamemode = gamemode;
        await this.connection.sendDataPacket(reply);
    }

    /**
     * Sends `UpdatePlayerGameType`, which the docs have the server send to every client after it
     * accepts a game type change, because each client caches the game type and permission flags
     * of every player it knows about.
     */
    public async sendPlayerGameMode(runtimeId: bigint, gamemode: Gametype, inputTick: bigint): Promise<void> {
        await this.connection.sendDataPacket(
            new UpdatePlayerGameTypePacket({ playerGameType: gamemode, targetPlayer: runtimeId, tick: inputTick })
        );
    }

    /**
     * Sends `UpdateAdventureSettings`. It names no actor and describes the client receiving it,
     * so it goes to that client alone: a spectator's `worldImmutable` sent to everyone froze the
     * world for every other client.
     */
    public async sendInteractionSettings(gamemode: Gametype): Promise<void> {
        const spectator = gamemode === Gametype.SPECTATOR;
        await this.connection.sendDataPacket(
            new UpdateAdventureSettingsPacket({
                worldImmutable: spectator,
                noAttackingPlayers: spectator,
                noAttackingMobs: spectator,
                autoJump: true,
                showNameTags: true
            })
        );
    }

    /** Sends `UpdateAbilities` (`abilitiesPacket`). */
    public async sendAbilities(target: AbilityTarget): Promise<void> {
        await this.connection.sendDataPacket(abilitiesPacket(target));
    }

    /**
     * Sends `ContainerClose` back with the id and type the client sent, and `Server Initiated
     * Close` false, since the player closed this one. A Bedrock client takes its screen down
     * first and waits for this answer before it opens the next container.
     */
    public async containerClosed(window: number, clientContainerType: number): Promise<void> {
        const pk = new ContainerClosePacket();
        pk.containerId = window;
        pk.containerType = clientContainerType;
        pk.serverInitiatedClose = false;
        await this.connection.sendDataPacket(pk);
    }

    /**
     * Sends `Text`, with `Filtered Message` empty: it is the text after chat filtering, which a
     * dedicated server leaves empty for its own messages. Repeating the message there doubled
     * the payload.
     */
    public async sendMessage({
        message,
        kind,
        parameters,
        needsTranslation,
        sourceName,
        xuid
    }: ShownMessage): Promise<void> {
        await this.connection.sendDataPacket(
            new TextPacket({
                type: TEXT_TYPE[kind],
                needsTranslation,
                sourceName,
                message,
                parameters: [...parameters],
                xuid,
                platformChatId: '',
                filtered: ''
            })
        );
    }
}
