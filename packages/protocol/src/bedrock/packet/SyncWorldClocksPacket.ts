import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { syncWorldClocksPacket } from '../wire/definitions/syncWorldClocks';
import { layoutAt } from '../../wire/WireLayout';
import { SyncWorldClocksDataType } from './SyncWorldClocksDataType';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { SyncWorldClocksPayload } from '../wire/definitions/syncWorldClocks';

export { SyncWorldClocksDataType };

/** One `TimeMarkerData`: a named point on a clock that repeats every `Period` ticks. */
export interface TimeMarker {
    /** `Id`, a varuint64. */
    id: bigint;
    /** `Name`, at most 128 characters. */
    name: string;
    /** `Time` in ticks at which the marker fires, a ZigZag varint32. */
    time: number;
    /**
     * `Period` in ticks between two firings, an optional little-endian int32: a presence byte,
     * then the value. `null` when absent. The 1.26.50 page prints it as plain, and the 1.26.60
     * page as optional with the changelog row "is now optional"; Mojang's own note for that build
     * says the docs were corrected to the engine's real optionality, so the presence byte is
     * written at every protocol version (see `docs/research/protocol-2225-delta.md`).
     */
    period: number | null;
}

/** One `WorldClockData` of an `InitializeRegistryData`: a clock's full definition. */
export interface WorldClock {
    /** `Id`, a varuint64. */
    id: bigint;
    /** `Name`, at most 128 characters. */
    name: string;
    /** `Time` in ticks, a ZigZag varint32. */
    time: number;
    /** `IsPaused`. */
    isPaused: boolean;
    /** `TimeMarkers` defined on the clock. */
    timeMarkers: TimeMarker[];
}

/** One `SyncWorldClockStateData` of a `SyncStateData`: a clock's current time and paused flag. */
export interface WorldClockState {
    /** `ClockId`, a varuint64. */
    clockId: bigint;
    /** `Time` in ticks, a ZigZag varint32. */
    time: number;
    /** `IsPaused`. */
    isPaused: boolean;
}

/** The `Data` variant of a `SyncWorldClocksPacket`. `type` picks the alternative and its fields. */
export type SyncWorldClocksData =
    | {
          type: SyncWorldClocksDataType.SyncState;
          /** `ClockData`, one `SyncWorldClockStateData` per clock. */
          clocks: WorldClockState[];
      }
    | {
          type: SyncWorldClocksDataType.InitializeRegistry;
          /** `ClockData`, one `WorldClockData` per clock. */
          clocks: WorldClock[];
      }
    | {
          type: SyncWorldClocksDataType.AddTimeMarker;
          /** `ClockId` the markers belong to, a varuint64. */
          clockId: bigint;
          /** `TimeMarkers` added to the clock. */
          timeMarkers: TimeMarker[];
      }
    | {
          type: SyncWorldClocksDataType.RemoveTimeMarker;
          /** `ClockId` the markers belonged to, a varuint64. */
          clockId: bigint;
          /** `TimeMarkerIds` removed from the clock, each a varuint64. */
          timeMarkerIds: bigint[];
      };

/** The fields of a `SyncWorldClocksPacket`, in wire order. */
export type SyncWorldClocks = SyncWorldClocksPayload;

/**
 * Initializes and keeps in sync the world clocks a server defines beyond the day-night cycle.
 *
 * Protocol 2193 layout, in wire order: `Data` as a Cereal tagged variant, a varuint32 selector
 * (the {@link SyncWorldClocksDataType} value) followed by the alternative's fields. Every list
 * is a varuint32 count then its items. `SyncStateData` is a list of `ClockId` (varuint64),
 * `Time` (ZigZag varint32) and `IsPaused` (byte). `InitializeRegistryData` is a list of `Id`
 * (varuint64), `Name` (string), `Time` (ZigZag varint32), `IsPaused` (byte) and `TimeMarkers`,
 * each marker an `Id` (varuint64), `Name` (string), `Time` (ZigZag varint32) and `Period`
 * (optional little-endian int32). `AddTimeMarkerData` is `ClockId` (varuint64) then `TimeMarkers`.
 * `RemoveTimeMarkerData` is `ClockId` (varuint64) then `TimeMarkerIds`, each a varuint64.
 *
 * Mojang describes the packet as sent on join to initialize every clock, periodically to all
 * clients to keep them in sync, and whenever a clock's paused state changes or markers are
 * added or removed. The 1.26.51 schema also marks it "Currently disabled"; `SetTime` still
 * carries the day-night cycle on its own. The packet arrived at protocol 2193. `Period`
 * is optional at both protocol versions.
 *
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/sync-world-clocks-packet/
 */
export default class SyncWorldClocksPacket extends NetworkPacket<SyncWorldClocks> {
    public get id(): number {
        return PacketIdentifier.SYNC_WORLD_CLOCKS;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: SyncWorldClocks): void {
        layoutAt(syncWorldClocksPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): SyncWorldClocks {
        return layoutAt(syncWorldClocksPacket, this.codecProtocol).decode(stream);
    }
}
