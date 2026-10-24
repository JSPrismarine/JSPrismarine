import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** A `CodeBuilderStorageQueryOptions::Operation`, written as one byte. */
export enum CodeBuilderOperation {
    /** Docs: `None`. */
    None = 0,
    /** Docs: `Get`. */
    Get = 1,
    /** Docs: `Set`. */
    Set = 2,
    /** Docs: `Reset`. */
    Reset = 3
}

/** A `CodeBuilderStorageQueryOptions::Category`, written as one byte. */
export enum CodeBuilderCategory {
    /** Docs: `None`. */
    None = 0,
    /** Docs: `CodeStatus`. */
    CodeStatus = 1,
    /** Docs: `Instantiation`. */
    Instantiation = 2
}

/** A `CodeBuilderExecutionState::CodeStatus`, written as one byte. */
export enum CodeBuilderCodeStatus {
    /** Docs: `None`. */
    None = 0,
    /** Docs: `NotStarted`. */
    NotStarted = 1,
    /** Docs: `InProgress`. */
    InProgress = 2,
    /** Docs: `Paused`. */
    Paused = 3,
    /** Docs: `Error`. */
    Error = 4,
    /** Docs: `Succeeded`. */
    Succeeded = 5
}

/** The fields of a `CodeBuilderSourcePacket`, in wire order. */
export interface CodeBuilderSource {
    /** `Operation`: what the client asks the code builder storage to do. */
    operation: CodeBuilderOperation;
    /** `Category`: which stored value the operation targets. */
    category: CodeBuilderCategory;
    /** `CodeStatus`: the execution state the client reports or sets. */
    codeStatus: CodeBuilderCodeStatus;
}

/**
 * An Education Edition request from the client's Code Builder webview to the server.
 *
 * Protocol 2193 layout, in wire order: `Operation`, `Category` and `CodeStatus`, each an enum
 * written as one uint8 with the numeric values of {@link CodeBuilderOperation},
 * {@link CodeBuilderCategory} and {@link CodeBuilderCodeStatus}. Mojang's schema notes the
 * packet is EDU exclusive and comes from `getInterface()` of the `WebviewSystem`.
 */
export default class CodeBuilderSourcePacket extends NetworkPacket<CodeBuilderSource> {
    public get id(): number {
        return PacketIdentifier.CODE_BUILDER_SOURCE;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: CodeBuilderSource): void {
        stream.writeByte(data.operation);
        stream.writeByte(data.category);
        stream.writeByte(data.codeStatus);
    }

    protected deserializePayload(stream: NetworkBinaryStream): CodeBuilderSource {
        return {
            operation: stream.readByte(),
            category: stream.readByte(),
            codeStatus: stream.readByte()
        };
    }
}
