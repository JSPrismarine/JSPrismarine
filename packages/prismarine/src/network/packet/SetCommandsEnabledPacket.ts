import { layoutAt, setCommandsEnabledPacket } from '@jsprismarine/protocol';

import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/**
 * Turns command execution on or off for one client.
 *
 * **Bound To:** Client
 *
 * The client enforces it locally: with commands disabled it stops running them itself and
 * greys out the parts of the interface that need them. The world settings screen, the cheats
 * toggle and the Education Edition teacher tools all go through this, usually as the reply
 * to a `SimpleEventPacket` the client sent.
 *
 * Protocol 2193 layout (docs id 59), in wire order:
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | Commands Enabled | boolean | |
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/set-commands-enabled-packet/
 */
export default class SetCommandsEnabledPacket extends FieldNetworkPacket {
    /** Commands Enabled, whether the client may run commands. */
    public commandsEnabled = false;

    /** Reads the flag. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(setCommandsEnabledPacket, this.codecProtocol).decode(this));
    }

    /** Writes the flag. */
    public encodePayload(): void {
        layoutAt(setCommandsEnabledPacket, this.codecProtocol).encode(this, this);
    }
}
