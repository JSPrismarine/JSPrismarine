import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The fields of a `ToastRequestPacket`, in wire order. */
export interface ToastRequest {
    /** `Title`: the heading of the toast. */
    title: string;
    /** `Content`: the body text of the toast. */
    content: string;
}

/**
 * Asks the client to show a toast notification, the small overlay the game uses for
 * achievements and friend activity.
 *
 * Protocol 2193 layout, in wire order: `Title` then `Content`, both strings. Strings are a
 * varuint32 byte length followed by UTF-8.
 */
export default class ToastRequestPacket extends NetworkPacket<ToastRequest> {
    public get id(): number {
        return PacketIdentifier.TOAST_REQUEST;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ToastRequest): void {
        stream.writeString(data.title);
        stream.writeString(data.content);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ToastRequest {
        return {
            title: stream.readString(),
            content: stream.readString()
        };
    }
}
