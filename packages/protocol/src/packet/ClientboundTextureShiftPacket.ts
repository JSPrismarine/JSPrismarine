import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The `Action ID` of a texture shift update. The values are the ones the wire carries. */
export enum TextureShiftAction {
    Invalid = 0,
    Initialize = 1,
    /** Begins a shift from `From Step` to `To Step`. `Enabled` says whether it begins enabled. */
    Start = 2,
    SetEnabled = 3,
    Sync = 4
}

/** The fields of a `ClientboundTextureShiftPacket`, in wire order. */
export interface ClientboundTextureShift {
    /** `Action ID`. */
    action: TextureShiftAction;
    /** `Collection Name`, the texture shift collection the update applies to. */
    collectionName: string;
    /** `From Step`, the step the shift starts at. */
    fromStep: string;
    /** `To Step`, the step the shift ends at. */
    toStep: string;
    /** `All Steps`, every step name of the collection. */
    allSteps: string[];
    /** `Current Length In Ticks`, how far into the shift the client should be. */
    currentLengthInTicks: bigint;
    /** `Total Length In Ticks`, how long the whole shift takes. */
    totalLengthInTicks: bigint;
    /** `Enabled`. For a {@link TextureShiftAction.Start} action, whether the shift begins enabled. */
    enabled: boolean;
}

/**
 * Updates the client's texture shift system: which step of a texture collection it shows and
 * how far along a shift between two steps it is.
 *
 * Protocol 2193 layout, in wire order: `Action ID` as one {@link TextureShiftAction} byte,
 * `Collection Name`, `From Step` and `To Step` as strings, `All Steps` as a varuint32 count
 * followed by one string per step, `Current Length In Ticks` and `Total Length In Ticks` as
 * varuint64, then `Enabled` as one byte. Strings are a varuint32 byte length followed by
 * UTF-8.
 *
 * Mojang's 1.26 release notes say the packet "remains unused", so the vanilla server does not
 * send it during a join.
 */
export default class ClientboundTextureShiftPacket extends NetworkPacket<ClientboundTextureShift> {
    public get id(): number {
        return PacketIdentifier.CLIENTBOUND_TEXTURE_SHIFT;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ClientboundTextureShift): void {
        stream.writeByte(data.action);
        stream.writeString(data.collectionName);
        stream.writeString(data.fromStep);
        stream.writeString(data.toStep);

        stream.writeUnsignedVarInt(data.allSteps.length);
        for (const step of data.allSteps) {
            stream.writeString(step);
        }

        stream.writeUnsignedVarLong(data.currentLengthInTicks);
        stream.writeUnsignedVarLong(data.totalLengthInTicks);
        stream.writeBoolean(data.enabled);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ClientboundTextureShift {
        const action: TextureShiftAction = stream.readByte();
        const collectionName = stream.readString();
        const fromStep = stream.readString();
        const toStep = stream.readString();

        const allSteps: string[] = [];
        let count = stream.readUnsignedVarInt();
        while (count-- > 0) {
            allSteps.push(stream.readString());
        }

        const currentLengthInTicks = stream.readUnsignedVarLong();
        const totalLengthInTicks = stream.readUnsignedVarLong();
        const enabled = stream.readBoolean();

        return {
            action,
            collectionName,
            fromStep,
            toStep,
            allSteps,
            currentLengthInTicks,
            totalLengthInTicks,
            enabled
        };
    }
}
