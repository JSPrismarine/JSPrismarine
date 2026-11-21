import type { Gametype } from '@jsprismarine/minecraft';
import { SetTimePacket } from '@jsprismarine/protocol';
import ContainerClosePacket from '@jsprismarine/protocol/bedrock/packet/ContainerClosePacket';
import SetDefaultGameTypePacket from '@jsprismarine/protocol/bedrock/packet/SetDefaultGameTypePacket';
import SetPlayerGameTypePacket from '@jsprismarine/protocol/bedrock/packet/SetPlayerGameTypePacket';

import type ClientConnection from '../ClientConnection';
import type { SessionPresenter } from './SessionPresenter';

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
}
