import { CreditsState, NetworkPacket, PacketIdentifier, layoutAt, showCreditsPacket } from '@jsprismarine/protocol';
import { EventEmitter } from 'node:events';

import type { NetworkBinaryStream, ShowCreditsPayload } from '@jsprismarine/protocol';
import type { ClientPacketHandler } from './net/ClientHandler';
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
     * Registers the answer on the session, for the life of the session.
     * @param session - The session whose `ShowCredits` this answers.
     * @param runtimeEntityId - Returns the runtime id `StartGame` assigned, for the answer.
     */
    public constructor(
        session: ClientSession,
        private readonly runtimeEntityId: () => bigint
    ) {
        super();
        session.registerHandler(ShowCreditsPacket, this.showCredits);
    }

    /**
     * Answers `ShowCredits Start` with `Finished`, in either phase, as it did when it listened
     * to every packet the session read.
     */
    private readonly showCredits: ClientPacketHandler<ShowCreditsPayload> = {
        phases: ['login', 'play'],
        handle: async (credits, { session, log }) => {
            // A server-bound `Finished` echoed back, or anything else: not the start of anything.
            if (credits.creditsState !== CreditsState.Start) return;
            this.emit('start', credits);

            await session.send(
                new ShowCreditsPacket({ playerRuntimeId: this.runtimeEntityId(), creditsState: CreditsState.Finished })
            );

            log.debug('Client/Credits: answered the end credits');
            this.emit('finished', credits);
        }
    };
}
