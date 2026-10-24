import { ItemStackResponseResult } from '@jsprismarine/minecraft';
import Identifiers from '../Identifiers';
import type { FullContainerName } from '../type/ItemStackRequest';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

// `ItemStackResponseResult` is generated from Mojang's documentation, where it is
// `ItemStackNetResult`. It carries sixty-eight reasons a request can fail; this server sends
// two of them, and every refusal it makes could be naming one of the rest.
export { ItemStackResponseResult };

/**
 * What a slot holds once the request has been applied.
 *
 * The docs write two slot indices, Requested Slot and then Slot, and they carry the same
 * number: the slot that actually changed. One field rather than two so they cannot drift -
 * they did, and a crafting slot answered for under Requested Slot 28 and Slot 0 pointed the
 * client at the first square of the grid whichever square had emptied.
 */
export interface ItemStackResponseSlotInfo {
    /** Requested Slot and Slot, the slot this answers for, in the client's own numbering. */
    slot: number;
    /** Amount, a uint8. Zero means the slot is empty and no stack net id follows. */
    count: number;
    /** Item Stack Net Id, written only when positive. */
    itemStackId: number;
    /** The Unredacted half of Custom Name. */
    customName: string;
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
    /** Containers, the containers the request changed. */
    containers: ItemStackResponseContainerInfo[];
}

/**
 * The answer to an {@link ItemStackRequestPacket}.
 *
 * A rejected request carries no containers - the client already knows what to put back - so
 * only an accepted one describes slots.
 *
 * Wire order at protocol 2193 is Responses, a varuint count then one `ItemStackResponseInfo`
 * each: Result (uint8), Client Request Id (varint32), and Containers as an optional array of
 * `ItemStackResponseContainerInfo`, each a Full Container Name and a varuint counted list of
 * `ItemStackResponseSlotInfo`. A slot is Requested Slot (uint8), Slot (uint8), Amount (uint8),
 * Item Stack Net Id (optional varint32), Custom Name (a string and an optional redacted
 * string), and Durability Correction (varint32).
 *
 * Three of those are optionals, which 748 did not have: the container list has a presence byte
 * written false, not left out, for a refusal; a slot's stack net id is sent only when it is
 * positive; and a filtered custom name follows the custom name, absent unless the server
 * filtered it. 2168 wrote each of those presence bytes twice; 2193 took the redundant one out.
 *
 * **Bound To:** Client
 */
export default class ItemStackResponsePacket extends DataPacket {
    public static NetID = Identifiers.ItemStackResponsePacket;

    public responses: ItemStackResponse[] = [];

    /** Writes Responses in docs order; see the class comment for the layout. */
    public encodePayload(): void {
        this.writeUnsignedVarInt(this.responses.length);
        for (const response of this.responses) {
            this.writeByte(response.result);
            this.writeVarInt(response.requestId);

            const containers = response.result === ItemStackResponseResult.OK ? response.containers : [];
            this.writeBoolean(containers.length > 0);
            if (containers.length === 0) continue;

            this.writeUnsignedVarInt(containers.length);
            for (const container of containers) {
                this.writeByte(container.container.containerId);
                this.writeBoolean(container.container.dynamicId !== null);
                if (container.container.dynamicId !== null) this.writeIntLE(container.container.dynamicId);

                this.writeUnsignedVarInt(container.slots.length);
                for (const slot of container.slots) {
                    // Requested Slot and Slot, both the slot that changed.
                    this.writeByte(slot.slot);
                    this.writeByte(slot.slot);
                    this.writeByte(slot.count);
                    this.writeBoolean(slot.itemStackId > 0);
                    if (slot.itemStackId > 0) this.writeVarInt(slot.itemStackId);
                    NetworkUtil.writeString(this, slot.customName);
                    this.writeBoolean(false); // No filtered custom name: nothing here filters.
                    this.writeVarInt(slot.durabilityCorrection);
                }
            }
        }
    }
}
