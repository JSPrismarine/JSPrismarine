import FieldNetworkPacket from '../FieldNetworkPacket';
import { layoutAt } from '../wire/WireLayout';
import { containerSetDataPacket } from '../wire/definitions/containers';

/**
 * Sets one numbered property on an open container screen.
 *
 * **Bound To:** Client
 *
 * This is how a furnace's progress arrow and a brewing stand's bubbles move: the server
 * sends a new Value for the property named by ID every time the cooking state changes. The
 * same ID means different things in different containers, so the client reads it against the
 * container that Container ID has open.
 *
 * Protocol 2193 layout (docs id 51), in wire order:
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | Container ID | uint8 | The open container the property belongs to |
 * | ID | varint32 | Which property to set |
 * | Value | varint32 | The property's new value |
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/container-set-data-packet/
 */
export default class ContainerSetDataPacket extends FieldNetworkPacket {
    /** Container ID, the window the client has open. Nothing happens if it has no such window. */
    public containerId = 0;

    /** ID, the property to set. Its meaning depends on the container's type. */
    public id = 0;

    /** Value, the property's new value. */
    public value = 0;

    /** Reads the container, the property, and its value. */
    public decodePayload(): void {
        const read = layoutAt(containerSetDataPacket, this.codecProtocol).decode(this);
        this.containerId = read.containerId;
        this.id = read.id;
        this.value = read.value;
    }

    /** Writes the container, the property, and its value. */
    public encodePayload(): void {
        layoutAt(containerSetDataPacket, this.codecProtocol).encode(this, {
            containerId: this.containerId,
            id: this.id,
            value: this.value
        });
    }
}
