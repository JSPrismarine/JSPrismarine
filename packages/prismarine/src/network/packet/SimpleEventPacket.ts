import DataPacket from './DataPacket';

/**
 * The requests a {@link SimpleEventPacket} can carry, as the Type uint16 numbers them.
 */
export enum SimpleEventSubtype {
    UninitializedSubtype = 0,
    EnableCommands = 1,
    DisableCommands = 2,
    UnlockWorldTemplateSettings = 3
}

/**
 * Asks the server to turn commands on or off, or to unlock the world template settings.
 *
 * **Bound To:** Server
 *
 * The client sends this when a player flips the matching switch in the world settings
 * screen. A server that accepts {@link SimpleEventSubtype.EnableCommands} answers with a
 * `SetCommandsEnabledPacket`. Unlocking the template settings both frees the interface
 * client side and changes the setting server side.
 *
 * Protocol 2193 layout (docs id 64), in wire order:
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | Type | uint16 | Little-endian; one of {@link SimpleEventSubtype} |
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/simple-event-packet/
 */
export default class SimpleEventPacket extends DataPacket {
    /** Type, the request being made. */
    public type: SimpleEventSubtype = SimpleEventSubtype.UninitializedSubtype;

    /** Reads the subtype. */
    public decodePayload(): void {
        this.type = this.readUnsignedShortLE();
    }

    /** Writes the subtype. */
    public encodePayload(): void {
        this.writeUnsignedShortLE(this.type);
    }
}
