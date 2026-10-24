import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import Identifiers from '../Identifiers';
import { ContainerUiId, ItemStackRequestActionType } from '../type/ItemStackRequest';
import ItemStackRequestPacket from './ItemStackRequestPacket';

/**
 * The packet as a client writes it, built from the layout rather than from the reader.
 *
 * Protocol 2193's, from Mojang's docs and gophertunnel's `protocol/item_stack.go`: the
 * header, a varuint request count, then each request as Client Request Id, Actions,
 * Strings To Filter and StringsToFilterOrigin. Every byte is written by hand so the test
 * knows the layout instead of trusting the reader to agree with itself.
 */
const oneTake = (): Buffer => {
    const out = new BinaryStream();
    out.writeUnsignedVarInt(Identifiers.ItemStackRequestPacket); // Header.
    out.writeUnsignedVarInt(1); // Requests.
    out.writeVarInt(-3); // Client Request Id, negative like the client sends.
    out.writeUnsignedVarInt(1); // Actions.
    out.writeUnsignedVarInt(0); // Variant index: take.
    out.writeByte(ItemStackRequestActionType.TAKE); // Action type.
    out.writeByte(12); // Amount.
    out.writeByte(ContainerUiId.CURSOR); // Source: Container Name.
    out.writeBoolean(false); // Source: no Dynamic ID.
    out.writeByte(0); // Source: Slot.
    out.writeIntLE(70000); // Source: Net Id Variant, four fixed bytes.
    out.writeByte(ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY); // Destination: Container Name.
    out.writeBoolean(false); // Destination: no Dynamic ID.
    out.writeByte(5); // Destination: Slot.
    out.writeIntLE(0); // Destination: Net Id Variant.
    out.writeUnsignedVarInt(0); // Strings To Filter.
    out.writeIntLE(0); // StringsToFilterOrigin.

    return out.getBuffer();
};

const decode = (buffer: Buffer): ItemStackRequestPacket => {
    const packet = new ItemStackRequestPacket(buffer);
    packet.decode();
    return packet;
};

describe('ItemStackRequestPacket', () => {
    it('reads one take request laid out as 2193 specifies and consumes every byte', () => {
        const packet = decode(oneTake());

        expect(packet.requests).toHaveLength(1);
        const request = packet.requests[0]!;
        expect(request.requestId).toBe(-3);
        expect(request.actions).toHaveLength(1);
        expect(request.actions[0]!.type).toBe(ItemStackRequestActionType.TAKE);
        expect(request.actions[0]!.count).toBe(12);
        expect(request.actions[0]!.source).toEqual({
            container: { containerId: ContainerUiId.CURSOR, dynamicId: null },
            slotId: 0,
            stackNetId: 70000
        });
        expect(request.actions[0]!.destination).toEqual({
            container: { containerId: ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY, dynamicId: null },
            slotId: 5,
            stackNetId: 0
        });
        expect(request.filterStrings).toEqual([]);
        expect(request.filterStringCause).toBe(0);
        // Nothing left over is what says the layout is right.
        expect(packet.feof()).toBe(true);
    });
});
