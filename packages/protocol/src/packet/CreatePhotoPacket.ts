import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The fields of a `CreatePhotoPacket`, in wire order. */
export interface CreatePhoto {
    /** `Raw ID`, the unique id of the player whose portfolio holds the photo. */
    rawId: bigint;
    /** `Photo Name`, the file name the photo is stored under. */
    photoName: string;
    /** `Photo Item Name`, the display name the new photo item gets. */
    photoItemName: string;
}

/**
 * A request to turn a portfolio photo into a photo item in the player's inventory.
 *
 * Docs packet 171, Education Edition only. The client sends it when a player exports a photo
 * from their portfolio.
 *
 * Protocol 2193 layout, in wire order: `Raw ID` as a little-endian uint64, then `Photo Name`
 * and `Photo Item Name` as strings (a varuint32 byte length followed by UTF-8).
 */
export default class CreatePhotoPacket extends NetworkPacket<CreatePhoto> {
    public get id(): number {
        return PacketIdentifier.CREATE_PHOTO;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: CreatePhoto): void {
        stream.writeUnsignedLongLE(data.rawId);
        stream.writeString(data.photoName);
        stream.writeString(data.photoItemName);
    }

    protected deserializePayload(stream: NetworkBinaryStream): CreatePhoto {
        return {
            rawId: stream.readUnsignedLongLE(),
            photoName: stream.readString(),
            photoItemName: stream.readString()
        };
    }
}
