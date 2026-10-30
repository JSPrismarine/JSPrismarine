/**
 * `InventoryTransactionPacket`: the client's item use, attack, release or container move,
 * described as a declarative field list.
 *
 * The transaction body depends on the variant index that precedes it, so the body travels as
 * one named custom wire type built from the hand-written readers `structures/InventoryTransaction.ts` keeps
 * (`PlayerAuthInputPacket` shares the use-item half). Protocol 2225 added a `Hand` uint8 to
 * two of the typed bodies - into the use-item-on-actor body between the hotbar slot and the
 * item, and at the end of the release-item body after the player position - verified against
 * the v1.26.60 `metadata.zip` (`ItemUseOnActorInventoryTransaction.json`,
 * `ItemReleaseInventoryTransaction.json`) and gophertunnel's
 * `UseItemOnEntityTransactionData.Marshal` / `ReleaseItemTransactionData.Marshal` at v1.63.0,
 * which agree. The gates cannot reach inside a variant body, so the move is expressed as a
 * gated pair of body types: the 2193 body up to 2225, the hand-carrying body from 2225 on.
 */
import { Vector3 } from '@jsprismarine/math';

import { definePacket, gated } from '../define';
import * as t from '../fieldTypes';
import { NetworkUtil } from '../networkUtil';
import {
    hasLegacyRequest,
    LegacySlotChange,
    MAX_INVENTORY_ACTIONS,
    readInventoryAction,
    readUseItemData,
    TransactionType,
    writeInventoryAction,
    writeUseItemData
} from '../structures/InventoryTransaction';
import { readItemStackDescriptor, writeItemStackDescriptor } from '../structures/ItemStackDescriptor';
import { SINCE_2225, UNTIL_2225 } from '../wireGates';

import type { PayloadOf } from '../define';
import type {
    InventoryActionData,
    LegacyTransactionRequest,
    TransactionPayload
} from '../structures/InventoryTransaction';

/**
 * `Legacy Request ID` plus `Legacy Set Item Slots`, as one value: a valid id always carries
 * the list, even an empty one, and an invalid id never does. The reader trusts the presence
 * byte on the wire over the id.
 */
const legacyTransactionRequest = t.custom<LegacyTransactionRequest>(
    'LegacyTransactionRequest',
    (stream, value) => {
        stream.writeVarInt(value.legacyRequestId);
        const hasLegacySlots = hasLegacyRequest(value.legacyRequestId);
        stream.writeBoolean(hasLegacySlots);
        if (!hasLegacySlots) return;

        stream.writeUnsignedVarInt(value.legacySlotChanges.length);
        for (const change of value.legacySlotChanges) change.toNetwork(stream);
    },
    (stream) => ({
        legacyRequestId: stream.readVarInt(),
        legacySlotChanges: stream.readBoolean()
            ? Array.from({ length: stream.readUnsignedVarInt() }, () => LegacySlotChange.fromNetwork(stream))
            : []
    })
);

/**
 * The transaction after the legacy request: variant index, Actions, then the selected body.
 *
 * One reader-writer pair serves both versions; `carriesHand` is the one thing 2225 changed.
 * An unknown variant index has a body of unknown length, so reading stops after the Actions
 * and `transactionData` stays null; the handler drops the packet at debug level.
 */
const transactionBody = (carriesHand: boolean) =>
    t.custom<TransactionPayload | null>(
        carriesHand ? 'ComplexInventoryTransaction[hand]' : 'ComplexInventoryTransaction',
        (stream, value) => {
            if (value === null) throw new TypeError('An inventory transaction needs its transaction payload');

            stream.writeUnsignedVarInt(value.transactionType);
            stream.writeUnsignedVarInt(value.inventoryActions.length);
            for (const action of value.inventoryActions) writeInventoryAction(stream, action);

            const data = value.transactionData;
            switch (value.transactionType) {
                case TransactionType.NORMAL:
                case TransactionType.MISMATCH:
                    break;
                case TransactionType.USE_ITEM: {
                    if (data?.kind !== 'useItem') throw new TypeError('A use-item transaction needs use-item data');
                    writeUseItemData(stream, data);
                    break;
                }
                case TransactionType.USE_ITEM_ON_ENTITY: {
                    if (data?.kind !== 'useItemOnEntity') {
                        throw new TypeError('A use-item-on-entity transaction needs use-item-on-entity data');
                    }
                    stream.writeUnsignedVarLong(data.entityRuntimeId);
                    stream.writeVarInt(data.actionType);
                    stream.writeVarInt(data.hotbarSlot);
                    if (carriesHand) stream.writeByte(value.hand);
                    writeItemStackDescriptor(stream, data.itemInHand);
                    NetworkUtil.writeVector3(stream, data.playerPosition);
                    NetworkUtil.writeVector3(stream, data.clickPosition);
                    break;
                }
                case TransactionType.RELEASE_ITEM: {
                    if (data?.kind !== 'releaseItem') {
                        throw new TypeError('A release-item transaction needs release-item data');
                    }
                    stream.writeVarInt(data.actionType);
                    stream.writeVarInt(data.hotbarSlot);
                    writeItemStackDescriptor(stream, data.itemInHand);
                    NetworkUtil.writeVector3(stream, data.playerPosition);
                    // The release-item body gained a trailing Hand; it is the packet's last field.
                    if (carriesHand) stream.writeByte(value.hand);
                    break;
                }
                default:
                    throw new TypeError(`Unknown transaction type ${value.transactionType}`);
            }
        },
        (stream) => {
            const transactionType = stream.readUnsignedVarInt();

            const actionsCount = stream.readUnsignedVarInt();
            if (actionsCount > MAX_INVENTORY_ACTIONS) {
                throw new RangeError(
                    `An inventory transaction carried ${actionsCount} actions; the docs allow ${MAX_INVENTORY_ACTIONS}`
                );
            }
            const inventoryActions: InventoryActionData[] = Array.from({ length: actionsCount }, () =>
                readInventoryAction(stream)
            );

            let transactionData: TransactionPayload['transactionData'] = null;
            let hand = 0;
            switch (transactionType) {
                case TransactionType.NORMAL:
                case TransactionType.MISMATCH:
                    break;
                case TransactionType.USE_ITEM:
                    transactionData = readUseItemData(stream);

                    // A layout that has drifted from the client's does not fail. It hands back
                    // plausible looking values, and acting on those means destroying a block at
                    // a position nobody touched. Leftover bytes mean the layout is wrong, and
                    // saying so is worth more than the guess.
                    if (!stream.feof()) {
                        throw new Error(
                            `UseItem transaction left ${stream.readRemaining().byteLength} bytes unread: the packet layout does not match the client's`
                        );
                    }
                    break;
                case TransactionType.USE_ITEM_ON_ENTITY: {
                    const entityRuntimeId = stream.readUnsignedVarLong();
                    const actionType = stream.readVarInt();
                    const hotbarSlot = stream.readVarInt();
                    if (carriesHand) hand = stream.readByte();
                    transactionData = {
                        kind: 'useItemOnEntity',
                        entityRuntimeId,
                        actionType,
                        hotbarSlot,
                        itemInHand: readItemStackDescriptor(stream),
                        playerPosition: new Vector3(stream.readFloatLE(), stream.readFloatLE(), stream.readFloatLE()),
                        clickPosition: new Vector3(stream.readFloatLE(), stream.readFloatLE(), stream.readFloatLE())
                    };
                    break;
                }
                case TransactionType.RELEASE_ITEM:
                    transactionData = {
                        kind: 'releaseItem',
                        actionType: stream.readVarInt(),
                        hotbarSlot: stream.readVarInt(),
                        itemInHand: readItemStackDescriptor(stream),
                        playerPosition: new Vector3(stream.readFloatLE(), stream.readFloatLE(), stream.readFloatLE())
                    };
                    if (carriesHand) hand = stream.readByte();
                    break;
                default:
                    // Nothing more can be read: the body's length depends on the type. See
                    // the comment above for why this is not a throw.
                    break;
            }

            return { transactionType, inventoryActions, transactionData, hand };
        }
    );

/** The `InventoryTransactionPacket` field list; the module doc carries the wire provenance. */
export const inventoryTransactionPacket = definePacket('InventoryTransactionPacket', {
    /** `Legacy Request ID` and `Legacy Set Item Slots`; see {@link LegacyTransactionRequest}. */
    legacyRequest: legacyTransactionRequest,
    /** The 2193 transaction: no packet-level `Hand` in any body. */
    transaction: gated<TransactionPayload | null>(UNTIL_2225, transactionBody(false), null),
    /** The 2225 transaction: `Hand` inside use-on-actor, trailing on release-item. */
    transactionWithHand: gated<TransactionPayload | null>(SINCE_2225, transactionBody(true), null)
});

/** What `InventoryTransactionPacket` carries, at every version; derived from the field list. */
export type InventoryTransactionPayload = PayloadOf<typeof inventoryTransactionPacket>;
