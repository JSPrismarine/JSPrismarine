import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The fields of a `ScriptMessagePacket`, in wire order. */
export interface ScriptMessage {
    /** `Message Id`: the event name a script listens for, by convention `namespace:name`. */
    messageId: string;
    /** `Message Value`: the payload, an arbitrary string the scripts on both ends agree on. */
    messageValue: string;
}

/**
 * A custom message between the client's and the server's scripts.
 *
 * Protocol 2193 layout, in wire order: `Message Id` then `Message Value`, each a varuint32
 * byte length followed by UTF-8.
 *
 * Either side may send it. It carries what the Script API calls a script event: a server
 * script's `sendScriptEvent` call, or the `/scriptevent` command, surfaces on the other side as
 * a `scriptEventReceive` with this id and value.
 */
export default class ScriptMessagePacket extends NetworkPacket<ScriptMessage> {
    public get id(): number {
        return PacketIdentifier.SCRIPT_MESSAGE;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ScriptMessage): void {
        stream.writeString(data.messageId);
        stream.writeString(data.messageValue);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ScriptMessage {
        return {
            messageId: stream.readString(),
            messageValue: stream.readString()
        };
    }
}
