import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/**
 * The docs' `DataDrivenScreenClosedReason`. The schema gives the field no `Enum-as-Value`
 * option, so the member name travels as a lowercase string rather than its number. The
 * datagen snapshot numbers the members 0 to 4 in this order; those numbers never reach the
 * wire. The strings match what gophertunnel and PocketMine read from real clients.
 */
export enum DataDrivenScreenClosedReason {
    /** Docs: `ProgrammaticClose` (0). The server closed this one screen. */
    ProgrammaticClose = 'programmaticclose',
    /** Docs: `ProgrammaticCloseAll` (1). The server closed every screen. */
    ProgrammaticCloseAll = 'programmaticcloseall',
    /** Docs: `ClientCanceled` (2). The player dismissed the screen. */
    ClientCanceled = 'clientcanceled',
    /** Docs: `UserBusy` (3). The client could not show the screen because another one was open. */
    UserBusy = 'userbusy',
    /** Docs: `InvalidForm` (4). The client could not show the screen it was asked for. */
    InvalidForm = 'invalidform'
}

const CLOSE_REASONS = new Set<string>(Object.values(DataDrivenScreenClosedReason));

const isCloseReason = (value: string): value is DataDrivenScreenClosedReason => CLOSE_REASONS.has(value);

/** The fields of a `ServerboundDataDrivenScreenClosedPacket`, in wire order. */
export interface ServerboundDataDrivenScreenClosed {
    /** `FormId` of the screen that closed, as `ClientboundDataDrivenUIShowScreenPacket` assigned it. */
    formId: number;
    /** `CloseReason`: why the screen went away. */
    closeReason: DataDrivenScreenClosedReason;
}

/**
 * The client's report that a data-driven UI screen closed, whether the server asked for it
 * or the player dismissed it.
 *
 * Protocol 2193 layout, in wire order: `FormId` as a little-endian uint32, then
 * `CloseReason` as a string (a varuint32 byte length followed by UTF-8) holding a
 * lowercase {@link DataDrivenScreenClosedReason} member name.
 *
 * @throws When the `CloseReason` string is not a member the schema lists.
 */
export default class ServerboundDataDrivenScreenClosedPacket extends NetworkPacket<ServerboundDataDrivenScreenClosed> {
    public get id(): number {
        return PacketIdentifier.SERVERBOUND_DATA_DRIVEN_SCREEN_CLOSED;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ServerboundDataDrivenScreenClosed): void {
        stream.writeUnsignedIntLE(data.formId);
        stream.writeString(data.closeReason);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ServerboundDataDrivenScreenClosed {
        const formId = stream.readUnsignedIntLE();
        const closeReason = stream.readString();
        if (!isCloseReason(closeReason)) {
            throw new Error(`Unknown DataDrivenScreenClosedReason "${closeReason}"`);
        }

        return { formId, closeReason };
    }
}
