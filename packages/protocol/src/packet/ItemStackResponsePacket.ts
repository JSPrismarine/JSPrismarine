import { ItemStackResponseResult } from '@jsprismarine/minecraft';
import type { FullContainerName } from '../wire/structures/ItemStackRequest';
import { NetworkUtil } from '../wire/networkUtil';
import FieldNetworkPacket from '../FieldNetworkPacket';

// `ItemStackResponseResult` is generated from Mojang's documentation, where it is
// `ItemStackNetResult`. It carries sixty-eight reasons a request can fail; this server sends
// two of them, and every refusal it makes could be naming one of the rest.
export { ItemStackResponseResult };

/** The range Durability Correction has to fit: the docs pin it to an int16 on top of its varint encoding. */
const DURABILITY_CORRECTION_MIN = -32768;
const DURABILITY_CORRECTION_MAX = 32767;

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
    /** Amount, a uint8. Zero means the slot is empty, and then no Item Stack Net Id follows. */
    count: number;
    /** Item Stack Net Id, the server's id for the stack. Written whenever Amount is above zero. */
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
    /** Containers, the containers the request changed. Only written when the result is `OK`. */
    containers: ItemStackResponseContainerInfo[];
}

/**
 * The answer to an {@link ItemStackRequestPacket}.
 *
 * A rejected request carries no containers - the client already knows what to put back - so
 * only an accepted one describes slots.
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
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/item-stack-response-packet/
 */
export default class ItemStackResponsePacket extends FieldNetworkPacket {
    public responses: ItemStackResponse[] = [];

    /**
     * Writes Responses in docs order; see the class comment for the layout.
     * @throws {RangeError} when a slot's durability correction does not fit an int16.
     */
    public encodePayload(): void {
        this.writeUnsignedVarInt(this.responses.length);
        for (const response of this.responses) {
            this.writeByte(response.result);
            this.writeVarInt(response.requestId);

            // Containers is present exactly when the request was accepted, even with nothing
            // in it. A refusal writes the presence byte and stops: leaving the byte out, as 748
            // did, hands the client the next response's count as it.
            const accepted = response.result === ItemStackResponseResult.OK;
            this.writeBoolean(accepted);
            if (!accepted) continue;

            this.writeUnsignedVarInt(response.containers.length);
            for (const container of response.containers) {
                this.writeByte(container.container.containerId);
                this.writeBoolean(container.container.dynamicId !== null);
                if (container.container.dynamicId !== null) this.writeUnsignedIntLE(container.container.dynamicId);

                this.writeUnsignedVarInt(container.slots.length);
                for (const slot of container.slots) {
                    // Requested Slot and Slot, both the slot that changed.
                    this.writeByte(slot.slot);
                    this.writeByte(slot.slot);
                    this.writeByte(slot.count);

                    // Item Stack Net Id is present exactly when the slot holds something.
                    const filled = slot.count > 0;
                    this.writeBoolean(filled);
                    if (filled) this.writeVarInt(slot.itemStackId);

                    NetworkUtil.writeString(this, slot.customName); // Custom Name: Unredacted.
                    this.writeBoolean(false); // Custom Name: no Redacted string, nothing here filters.

                    if (
                        slot.durabilityCorrection < DURABILITY_CORRECTION_MIN ||
                        slot.durabilityCorrection > DURABILITY_CORRECTION_MAX
                    ) {
                        throw new RangeError(
                            `Durability correction ${slot.durabilityCorrection} for slot ${slot.slot} does not fit an int16`
                        );
                    }
                    this.writeVarInt(slot.durabilityCorrection);
                }
            }
        }
    }

    /**
     * Reads Responses back, the mirror of {@link encodePayload}.
     *
     * The two Requested Slot / Slot bytes collapse into the one {@link ItemStackResponseSlotInfo.slot}
     * field, and the Redacted half of Custom Name is read past: the encoder never writes one.
     */
    public decodePayload(): void {
        this.responses = [];
        for (let i = 0, count = this.readUnsignedVarInt(); i < count; i++) {
            const result: ItemStackResponseResult = this.readByte();
            const requestId = this.readVarInt();

            const containers: ItemStackResponseContainerInfo[] = [];
            const accepted = this.readBoolean();
            if (!accepted) {
                this.responses.push({ result, requestId, containers });
                continue;
            }

            for (let j = 0, containerCount = this.readUnsignedVarInt(); j < containerCount; j++) {
                const containerId = this.readByte();
                const dynamicId = this.readBoolean() ? this.readUnsignedIntLE() : null;

                const slots: ItemStackResponseSlotInfo[] = [];
                for (let k = 0, slotCount = this.readUnsignedVarInt(); k < slotCount; k++) {
                    const slot = this.readByte(); // Requested Slot.
                    this.readByte(); // Slot, the same number again.
                    const count = this.readByte(); // Amount.

                    const itemStackId = this.readBoolean() ? this.readVarInt() : 0;

                    const customName = NetworkUtil.readString(this); // Custom Name: Unredacted.
                    if (this.readBoolean()) NetworkUtil.readString(this); // Custom Name: Redacted.

                    slots.push({ slot, count, itemStackId, customName, durabilityCorrection: this.readVarInt() });
                }

                containers.push({ container: { containerId, dynamicId }, slots });
            }

            this.responses.push({ result, requestId, containers });
        }
    }
}
