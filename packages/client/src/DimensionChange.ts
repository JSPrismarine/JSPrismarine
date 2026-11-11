import {
    ChangeDimensionPacket,
    LevelChunkPacket,
    PlayerActionPacket,
    PlayerActionType,
    ServerboundLoadingScreenPacket,
    ServerboundLoadingScreenPacketType
} from '@jsprismarine/protocol';
import { EventEmitter } from 'node:events';

import type { ChangeDimensionPayload, LevelChunk } from '@jsprismarine/protocol';
import type { ClientContext, ClientPacketHandler, ClientPhase } from './net/ClientHandler';
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
 * The phases both handlers run in: both, as when this listened to every packet the session read.
 * A change that arrives while the spawn answer is still being sent, before the session moves to
 * `play`, is answered all the same.
 */
const PHASES: readonly ClientPhase[] = ['login', 'play'];

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
     * Registers the two handlers on the session, for the life of the session.
     * @param session - The session whose dimension changes this answers.
     * @param runtimeEntityId - Returns the runtime id `StartGame` assigned, for the ack.
     */
    public constructor(
        session: ClientSession,
        private readonly runtimeEntityId: () => bigint
    ) {
        super();
        session.registerHandler(ChangeDimensionPacket, this.changeDimension);
        session.registerHandler(LevelChunkPacket, this.levelChunk);
    }

    /** The change in progress, or null when this client is settled in a dimension. */
    public getPending(): PendingDimensionChange | null {
        return this.pending;
    }

    /** Opens the loading screen for the change the server started. */
    private readonly changeDimension: ClientPacketHandler<ChangeDimensionPayload> = {
        phases: PHASES,
        handle: async (change, { session }) => {
            this.pending = {
                dimension: change.dimension,
                loadingScreenId: change.loadingScreenId,
                position: change.position
            };
            this.emit('start', this.pending);

            // The join screen has no id; a dimension change has the one the server picked, and
            // an id the server did not expect disconnects a retail client.
            if (change.loadingScreenId === null) return;
            await session.send(
                new ServerboundLoadingScreenPacket({
                    loadingScreenType: ServerboundLoadingScreenPacketType.StartLoadingScreen,
                    loadingScreenId: change.loadingScreenId
                })
            );
        }
    };

    /**
     * Closes the screen on the first chunk of the dimension the change is to. Not asynchronous
     * itself, so the chunks that arrive with no change pending leave nothing to wait for.
     */
    private readonly levelChunk: ClientPacketHandler<LevelChunk> = {
        phases: PHASES,
        handle: (chunk, context) => {
            if (this.pending === null || chunk.dimension !== this.pending.dimension) return;
            return this.onArrived(context);
        }
    };

    private async onArrived({ session, log }: ClientContext): Promise<void> {
        const pending = this.pending;
        if (pending === null) return;
        this.pending = null;

        await session.send(
            new PlayerActionPacket({
                runtimeEntityId: this.runtimeEntityId(),
                action: PlayerActionType.ChangeDimensionAck,
                blockPosition: NO_BLOCK,
                resultPosition: NO_BLOCK,
                blockFace: 0
            })
        );
        await session.send(
            new ServerboundLoadingScreenPacket({
                loadingScreenType: ServerboundLoadingScreenPacketType.EndLoadingScreen,
                loadingScreenId: pending.loadingScreenId
            })
        );

        log.debug(`Client/DimensionChange: arrived in dimension ${pending.dimension}`);
        this.emit('end', pending);
    }
}
