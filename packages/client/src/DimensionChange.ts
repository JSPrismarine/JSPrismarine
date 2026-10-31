import {
    PacketIdentifier,
    PlayerActionPacket,
    PlayerActionType,
    ServerboundLoadingScreenPacket,
    ServerboundLoadingScreenPacketType
} from '@jsprismarine/protocol';
import { EventEmitter } from 'node:events';
import { isPacket } from './net/ClientPacketRegistry';

import type { Logger } from '@jsprismarine/logger';
import type { ChangeDimensionPayload } from '@jsprismarine/protocol';
import type { DecodedPacket } from './net/ClientPacketRegistry';
import type ClientSession from './net/ClientSession';

/** A dimension change the server started and this client has not yet closed the screen for. */
export interface PendingDimensionChange {
    /** The `Dimension ID` the server is moving us to. */
    readonly dimension: number;
    /** The `Loading Screen Id` the server expects back, or null when it sent none. */
    readonly loadingScreenId: number | null;
    /** Where `ChangeDimension` said we arrive. */
    readonly position: ChangeDimensionPayload['position'];
}

/** The block position a `PlayerActionPacket` carries when the action has no block. */
const NO_BLOCK = { x: 0, y: 0, z: 0 };

/**
 * The client's half of a dimension change.
 *
 * A retail client shows a loading screen when `ChangeDimension` arrives and closes it once it
 * has terrain to stand on, telling the server both edges through `ServerboundLoadingScreen`.
 * The server holds the change open until it hears `EndLoadingScreen` with the id it handed
 * out, so a client that never answers is a player stuck between worlds.
 *
 * This one reports `StartLoadingScreen` as the change arrives and `EndLoadingScreen` after
 * the first `LevelChunk` carrying the new dimension's id, with the client's own `PlayerAction
 * ChangeDimensionAck` ahead of it as the retail client sends. Waiting for a chunk rather than
 * answering at once keeps the server's chunk-first ordering honest: a server that announced
 * the change and never sent terrain leaves this client on the screen too, which is the
 * failure the retail client shows.
 */
export default class DimensionChange extends EventEmitter {
    private pending: PendingDimensionChange | null = null;

    /**
     * @param runtimeEntityId - Returns the runtime id `StartGame` assigned, for the ack.
     */
    public constructor(
        private readonly session: ClientSession,
        private readonly logger: Logger,
        private readonly runtimeEntityId: () => bigint
    ) {
        super();
        this.session.on('packet', this.onPacket);
    }

    /** The change in progress, or null when this client is settled in a dimension. */
    public getPending(): PendingDimensionChange | null {
        return this.pending;
    }

    private readonly onPacket = (packet: DecodedPacket): void => {
        void this.dispatch(packet).catch((error: unknown) => {
            this.logger.warn(
                `Client/DimensionChange: ${error instanceof Error ? error.message : String(error)}`,
                'Client/DimensionChange/dispatch'
            );
        });
    };

    private async dispatch(packet: DecodedPacket): Promise<void> {
        if (isPacket(packet, PacketIdentifier.CHANGE_DIMENSION)) {
            await this.onChangeDimension(packet.data);
        } else if (isPacket(packet, PacketIdentifier.LEVEL_CHUNK)) {
            if (this.pending !== null && packet.data.dimension === this.pending.dimension) await this.onArrived();
        }
    }

    private async onChangeDimension(change: ChangeDimensionPayload): Promise<void> {
        this.pending = {
            dimension: change.dimension,
            loadingScreenId: change.loadingScreenId,
            position: change.position
        };
        this.emit('start', this.pending);

        // The join screen has no id; a dimension change has the one the server picked, and
        // an id the server did not expect disconnects a retail client.
        if (change.loadingScreenId === null) return;
        await this.session.send(
            new ServerboundLoadingScreenPacket({
                loadingScreenType: ServerboundLoadingScreenPacketType.StartLoadingScreen,
                loadingScreenId: change.loadingScreenId
            })
        );
    }

    private async onArrived(): Promise<void> {
        const pending = this.pending;
        if (pending === null) return;
        this.pending = null;

        await this.session.send(
            new PlayerActionPacket({
                runtimeEntityId: this.runtimeEntityId(),
                action: PlayerActionType.ChangeDimensionAck,
                blockPosition: NO_BLOCK,
                resultPosition: NO_BLOCK,
                blockFace: 0
            })
        );
        await this.session.send(
            new ServerboundLoadingScreenPacket({
                loadingScreenType: ServerboundLoadingScreenPacketType.EndLoadingScreen,
                loadingScreenId: pending.loadingScreenId
            })
        );

        this.logger.debug(`Client/DimensionChange: arrived in dimension ${pending.dimension}`);
        this.emit('end', pending);
    }
}
