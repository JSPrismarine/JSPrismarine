import { CreditsState, NetworkPacket, PacketIdentifier, layoutAt, showCreditsPacket } from '@jsprismarine/protocol';
import { EventEmitter } from 'node:events';
import { isPacket } from './net/ClientPacketRegistry';

import type { Logger } from '@jsprismarine/logger';
import type { NetworkBinaryStream, ShowCreditsPayload } from '@jsprismarine/protocol';
import type { DecodedPacket } from './net/ClientPacketRegistry';
import type ClientSession from './net/ClientSession';

/**
 * `ShowCreditsPacket` as a typed payload codec, both wire directions through the shared
 * `showCreditsPacket` definition.
 *
 * The protocol package's own `ShowCreditsPacket` is field-based, and this client's registry
 * keeps a decoded packet's payload object rather than the packet instance, so reading the
 * credits state off the wire needs the typed form.
 */
export class ShowCreditsPacket extends NetworkPacket<ShowCreditsPayload> {
    /** The default wire id, `SHOW_CREDITS`. */
    public get id(): number {
        return PacketIdentifier.SHOW_CREDITS;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ShowCreditsPayload): void {
        layoutAt(showCreditsPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ShowCreditsPayload {
        return layoutAt(showCreditsPacket, this.codecProtocol).decode(stream);
    }
}

/**
 * The client's half of the end credits.
 *
 * The server sends `ShowCredits Start` when a player first leaves the End through the exit
 * portal, and holds the dimension change until the client reports the credits over. A retail
 * client rolls the credits and answers `Finished` when they end or are skipped; this one has
 * no screen to roll them on, so it answers at once, which is the skip. The `ChangeDimension`
 * that follows the answer is `DimensionChange`'s business.
 *
 * Emits `start` as the credits arrive and `finished` once the answer has been sent, each with
 * the server's payload.
 */
export default class Credits extends EventEmitter {
    /**
     * @param runtimeEntityId - Returns the runtime id `StartGame` assigned, for the answer.
     */
    public constructor(
        private readonly session: ClientSession,
        private readonly logger: Logger,
        private readonly runtimeEntityId: () => bigint
    ) {
        super();
        this.session.on('packet', this.onPacket);
    }

    private readonly onPacket = (packet: DecodedPacket): void => {
        if (!isPacket(packet, PacketIdentifier.SHOW_CREDITS)) return;
        void this.dispatch(packet.data).catch((error: unknown) => {
            this.logger.warn(
                `Client/Credits: ${error instanceof Error ? error.message : String(error)}`,
                'Client/Credits/dispatch'
            );
        });
    };

    private async dispatch(credits: ShowCreditsPayload): Promise<void> {
        // A server-bound `Finished` echoed back, or anything else: not the start of anything.
        if (credits.creditsState !== CreditsState.Start) return;
        this.emit('start', credits);

        await this.session.send(
            new ShowCreditsPacket({ playerRuntimeId: this.runtimeEntityId(), creditsState: CreditsState.Finished })
        );

        this.logger.debug('Client/Credits: answered the end credits');
        this.emit('finished', credits);
    }
}
