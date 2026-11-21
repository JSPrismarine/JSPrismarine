/**
 * `UpdateBlockSyncedPacket`: synchronizes a moving block actor with a block change at the same
 * position.
 *
 * Protocol 2193 layout: `Block Position` as three ZigZag varint32 values, then `Block Runtime
 * ID`, `Flags`, and `Layer` as varuint32 values, `Unique Actor Id` as a varuint64, and
 * `Actor Sync Message` as a varuint64.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/update-block-synced-packet/
 */
import { definePacket } from '../../../wire/define';
import * as t from '../../../wire/fieldTypes';
import { blockPosStructure } from '../structureTypes';

import type { PayloadOf } from '../../../wire/define';

/** How the client synchronizes a moving block actor with its block form. */
export enum ActorSyncMessage {
    /** No actor synchronization accompanies the block update. */
    None = 0,
    /** The block becomes an actor at this position. */
    BlockToEntity = 1,
    /** The actor becomes a block at this position. */
    EntityToBlock = 2
}

/**
 * `Actor Sync Message`: an {@link ActorSyncMessage} carried as a varuint64.
 *
 * The wire value is 64 bits wide while the enum is a plain number, so the type converts between
 * the two; the layout does not validate the number against the enum.
 */
const actorSyncMessage = t.custom<ActorSyncMessage>(
    'varint64',
    (stream, value) => stream.writeUnsignedVarLong(BigInt(value)),
    // The wire carries a bare number; the layout does not validate it against the enum.
    (stream) => Number(stream.readUnsignedVarLong()) as ActorSyncMessage
);

/** The fields sent when a block update travels with the moving actor that changes into or out of it. */
export const updateBlockSyncedPacket = definePacket('UpdateBlockSyncedPacket', {
    /** `Block Position`: the position of the changed block. */
    blockPosition: blockPosStructure,
    /** `Block Runtime ID`: the runtime id of the block state after the update. */
    blockRuntimeId: t.varuint32,
    /** `Flags`: `BlockUpdateFlag` bits that control how the client applies the change. */
    flags: t.varuint32,
    /** `Layer`: 0 for the block, or 1 for its waterlogging layer. */
    layer: t.varuint32,
    /** `Unique Actor Id`: the runtime id of the moving block actor. */
    uniqueActorId: t.varuint64,
    /** `Actor Sync Message`: whether the actor appears or disappears with this block update. */
    actorSyncMessage
});

/** Payload carried by `UpdateBlockSyncedPacket`. */
export type UpdateBlockSyncedPayload = PayloadOf<typeof updateBlockSyncedPacket>;
