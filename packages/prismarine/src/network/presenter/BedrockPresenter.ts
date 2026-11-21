import type { Gametype } from '@jsprismarine/minecraft';
import { SetTimePacket, TextPacketType } from '@jsprismarine/protocol';
import ContainerClosePacket from '@jsprismarine/protocol/bedrock/packet/ContainerClosePacket';
import SetDefaultGameTypePacket from '@jsprismarine/protocol/bedrock/packet/SetDefaultGameTypePacket';
import SetPlayerGameTypePacket from '@jsprismarine/protocol/bedrock/packet/SetPlayerGameTypePacket';
import TextPacket from '@jsprismarine/protocol/bedrock/packet/TextPacket';

import type ClientConnection from '../ClientConnection';
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
