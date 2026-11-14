/**
 * `ItemStackResponsePacket`: the server's answers to the item stack requests a client made.
 *
 * Wire order at protocol 2193 is `Responses`, a varuint count then one `ItemStackResponseInfo`
 * each: `Result` (uint8), `Client Request Id` (varint32), and `Containers` as an optional array
 * of `ItemStackResponseContainerInfo`, each a `Full Container Name` (a uint8 and an optional
 * uint32 LE `Dynamic ID`) and a varuint counted list of `ItemStackResponseSlotInfo`. A slot is
 * `Requested Slot` (uint8), `Slot` (uint8), `Amount` (uint8), `Item Stack Net Id` (optional
 * varint32), `Custom Name` (an `Unredacted` string and an optional `Redacted` string), and
 * `Durability Correction` (varint32).
 *
 * The two optionals are tied to other fields rather than to whether there is anything to
 * write. Mojang's 2193 note: `Containers` carries a value exactly when `Result` is `Success`,
 * so an accepted request that changed nothing still carries an empty list; and `Item Stack
 * Net Id` carries a value exactly when `Amount` is above zero. The presence byte is written
 * either way. 2168 wrote each of those presence bytes twice; 2193 took the redundant one out.
 *
 * Protocol 2225 changes none of this layout: the 1.26.60 changelog for the packet lists only
 * `ContainerEnumName` renumbering and additions, which `Full Container Name` carries as a plain
 * uint8.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/item-stack-response-packet/
 */
import { ItemStackResponseResult } from '@jsprismarine/minecraft';

import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';
import type { FullContainerName } from '../structures/ItemStackRequest';

/** The range Durability Correction has to fit: the docs pin it to an int16 on top of its varint encoding. */
const DURABILITY_CORRECTION_MIN = -32768;
const DURABILITY_CORRECTION_MAX = 32767;

/**
 * What a slot holds once the request has been applied.
 *
 * The docs write two slot indices, Requested Slot and then Slot. The server answers with the
 * same number in both, the slot that actually changed - a crafting slot answered for under
 * Requested Slot 28 and Slot 0 pointed the client at the first square of the grid whichever
 * square had emptied - but a peer may send them apart, so each has its own field.
 */
export interface ItemStackResponseSlotInfo {
    /** Requested Slot, the slot index that was requested, in the client's own numbering. */
    requestedSlot: number;
    /** Slot, the actual slot index. */
    slot: number;
    /** Amount, a uint8. Zero means the slot is empty, and then no Item Stack Net Id follows. */
    count: number;
    /** Item Stack Net Id, the server's id for the stack. Written whenever Amount is above zero. */
    itemStackId: number;
    /** The Unredacted half of Custom Name. */
    customName: string;
    /** The Redacted half of Custom Name, or null when the peer sent none. The server sends none. */
    redactedCustomName: string | null;
    /** Durability Correction, a varint32 that has to fit in an int16. */
    durabilityCorrection: number;
}

/** The slots of one container that the request touched. */
export interface ItemStackResponseContainerInfo {
    /** Full Container Name: which container the slots below belong to. */
    container: FullContainerName;
    /** Slots, one entry per slot the request changed. */
    slots: ItemStackResponseSlotInfo[];
}

/** The server's answer to one request, matched to it by id. */
export interface ItemStackResponse {
    /** Result, an `ItemStackNetResult`. Anything but `OK` carries no containers. */
    result: ItemStackResponseResult;
    /** Client Request Id, the id of the request this answers. */
    requestId: number;
    /** Containers, the containers the request changed. Only written when the result is `OK`. */
    containers: ItemStackResponseContainerInfo[];
}

/**
 * `ItemStackResponseSlotInfo`, with the fields the docs tie to each other.
 *
 * Item Stack Net Id is present exactly when Amount is above zero, and the Redacted half of
 * Custom Name is an optional string. Writing throws a `RangeError` when Durability Correction
 * does not fit an int16.
 */
const slotInfo = t.custom<ItemStackResponseSlotInfo>(
    'ItemStackResponseSlotInfo',
    (stream, slot) => {
        t.uint8.write(stream, slot.requestedSlot);
        t.uint8.write(stream, slot.slot);
        t.uint8.write(stream, slot.count);

        // Item Stack Net Id is present exactly when the slot holds something.
        const filled = slot.count > 0;
        t.bool.write(stream, filled);
        if (filled) t.varint32.write(stream, slot.itemStackId);

        t.string.write(stream, slot.customName); // Custom Name: Unredacted.
        t.optional(t.string).write(stream, slot.redactedCustomName); // Custom Name: Redacted.

        if (
            slot.durabilityCorrection < DURABILITY_CORRECTION_MIN ||
            slot.durabilityCorrection > DURABILITY_CORRECTION_MAX
        ) {
            throw new RangeError(
                `Durability correction ${slot.durabilityCorrection} for slot ${slot.slot} does not fit an int16`
            );
        }
        t.varint32.write(stream, slot.durabilityCorrection);
    },
    (stream) => {
        const requestedSlot = t.uint8.read(stream);
        const slot = t.uint8.read(stream);
        const count = t.uint8.read(stream); // Amount.

        const itemStackId = t.present(t.varint32).read(stream) ?? 0;

        const customName = t.string.read(stream); // Custom Name: Unredacted.
        const redactedCustomName = t.optional(t.string).read(stream); // Custom Name: Redacted.

        return {
            requestedSlot,
            slot,
            count,
            itemStackId,
            customName,
            redactedCustomName,
            durabilityCorrection: t.varint32.read(stream)
        };
    }
);

/** `ItemStackResponseContainerInfo`: a Full Container Name, then the slots that changed in it. */
const containerInfo = t.record({
    container: t.record({ containerId: t.uint8, dynamicId: t.optional(t.lu32) }),
    slots: t.list(slotInfo)
});

const containers = t.list(containerInfo);

/**
 * `ItemStackResponseInfo`, whose Containers presence byte follows from Result.
 *
 * Containers is present exactly when the request was accepted, even with nothing in it. A
 * refusal writes the presence byte and stops: leaving the byte out, as 748 did, hands the
 * client the next response's count as it.
 */
const responseInfo = t.custom<ItemStackResponse>(
    'ItemStackResponseInfo',
    (stream, response) => {
        t.uint8.write(stream, response.result);
        t.varint32.write(stream, response.requestId);

        const accepted = response.result === ItemStackResponseResult.OK;
        t.bool.write(stream, accepted);
        if (accepted) containers.write(stream, response.containers);
    },
    (stream) => {
        const result = t.enumOf<ItemStackResponseResult>(t.uint8).read(stream);
        const requestId = t.varint32.read(stream);
        return { result, requestId, containers: t.bool.read(stream) ? containers.read(stream) : [] };
    }
);

/** The fields sent when the server answers one or more item stack requests. */
export const itemStackResponsePacket = definePacket('ItemStackResponsePacket', {
    /** `Responses`: one answer per request, each matched to its request by id. */
    responses: t.list(responseInfo)
});

/** Payload carried by `ItemStackResponsePacket`. */
export type ItemStackResponsePayload = PayloadOf<typeof itemStackResponsePacket>;
