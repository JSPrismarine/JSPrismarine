import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/**
 * Which alternative of the `Data` variant a `SyncWorldClocksPacket` carries. The value is the
 * alternative's index in the schema's `oneOf`, written as the varuint32 selector on the wire.
 */
export enum SyncWorldClocksDataType {
    /** `SyncStateData`: the current time and paused flag of every clock. */
    SyncState = 0,
    /** `InitializeRegistryData`: the full definition of every clock, sent on join. */
    InitializeRegistry = 1,
    /** `AddTimeMarkerData`: new time markers for one clock. */
    AddTimeMarker = 2,
    /** `RemoveTimeMarkerData`: time marker ids removed from one clock. */
    RemoveTimeMarker = 3
}

/** One `TimeMarkerData`: a named point on a clock that repeats every `Period` ticks. */
export interface TimeMarker {
    /** `Id`, a varuint64. */
    id: bigint;
    /** `Name`, at most 128 characters. */
    name: string;
    /** `Time` in ticks at which the marker fires, a ZigZag varint32. */
    time: number;
    /** `Period` in ticks between two firings, a little-endian int32. */
    period: number;
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
export interface SyncWorldClocks {
    /** `Data`, the one alternative this packet carries. */
    data: SyncWorldClocksData;
}

/**
 * Initializes and keeps in sync the world clocks a server defines beyond the day-night cycle.
 *
 * Protocol 2193 layout, in wire order: `Data` as a Cereal tagged variant, a varuint32 selector
 * (the {@link SyncWorldClocksDataType} value) followed by the alternative's fields. Every list
 * is a varuint32 count then its items. `SyncStateData` is a list of `ClockId` (varuint64),
 * `Time` (ZigZag varint32) and `IsPaused` (byte). `InitializeRegistryData` is a list of `Id`
 * (varuint64), `Name` (string), `Time` (ZigZag varint32), `IsPaused` (byte) and `TimeMarkers`,
 * each marker an `Id` (varuint64), `Name` (string), `Time` (ZigZag varint32) and `Period`
 * (little-endian int32). `AddTimeMarkerData` is `ClockId` (varuint64) then `TimeMarkers`.
 * `RemoveTimeMarkerData` is `ClockId` (varuint64) then `TimeMarkerIds`, each a varuint64.
 *
 * Mojang describes the packet as sent on join to initialize every clock, periodically to all
 * clients to keep them in sync, and whenever a clock's paused state changes or markers are
 * added or removed. The 1.26.51 schema also marks it "Currently disabled"; `SetTime` still
 * carries the day-night cycle on its own. The packet arrived at protocol 2193 and `Period`
 * becomes optional at 2207.
 */
export default class SyncWorldClocksPacket extends NetworkPacket<SyncWorldClocks> {
    public get id(): number {
        return PacketIdentifier.SYNC_WORLD_CLOCKS;
    }

    private static writeTimeMarkers(stream: NetworkBinaryStream, markers: TimeMarker[]): void {
        stream.writeUnsignedVarInt(markers.length);
        for (const marker of markers) {
            stream.writeUnsignedVarLong(marker.id);
            stream.writeString(marker.name);
            stream.writeVarInt(marker.time);
            stream.writeIntLE(marker.period);
        }
    }

    private static readTimeMarkers(stream: NetworkBinaryStream): TimeMarker[] {
        const markers: TimeMarker[] = [];
        let count = stream.readUnsignedVarInt();
        while (count-- > 0) {
            markers.push({
                id: stream.readUnsignedVarLong(),
                name: stream.readString(),
                time: stream.readVarInt(),
                period: stream.readIntLE()
            });
        }
        return markers;
    }

    protected serializePayload(stream: NetworkBinaryStream, { data }: SyncWorldClocks): void {
        stream.writeUnsignedVarInt(data.type);

        switch (data.type) {
            case SyncWorldClocksDataType.SyncState:
                stream.writeUnsignedVarInt(data.clocks.length);
                for (const clock of data.clocks) {
                    stream.writeUnsignedVarLong(clock.clockId);
                    stream.writeVarInt(clock.time);
                    stream.writeBoolean(clock.isPaused);
                }
                break;

            case SyncWorldClocksDataType.InitializeRegistry:
                stream.writeUnsignedVarInt(data.clocks.length);
                for (const clock of data.clocks) {
                    stream.writeUnsignedVarLong(clock.id);
                    stream.writeString(clock.name);
                    stream.writeVarInt(clock.time);
                    stream.writeBoolean(clock.isPaused);
                    SyncWorldClocksPacket.writeTimeMarkers(stream, clock.timeMarkers);
                }
                break;

            case SyncWorldClocksDataType.AddTimeMarker:
                stream.writeUnsignedVarLong(data.clockId);
                SyncWorldClocksPacket.writeTimeMarkers(stream, data.timeMarkers);
                break;

            case SyncWorldClocksDataType.RemoveTimeMarker:
                stream.writeUnsignedVarLong(data.clockId);
                stream.writeUnsignedVarInt(data.timeMarkerIds.length);
                for (const id of data.timeMarkerIds) {
                    stream.writeUnsignedVarLong(id);
                }
                break;
        }
    }

    protected deserializePayload(stream: NetworkBinaryStream): SyncWorldClocks {
        const type = stream.readUnsignedVarInt();

        switch (type) {
            case SyncWorldClocksDataType.SyncState: {
                const clocks: WorldClockState[] = [];
                let count = stream.readUnsignedVarInt();
                while (count-- > 0) {
                    clocks.push({
                        clockId: stream.readUnsignedVarLong(),
                        time: stream.readVarInt(),
                        isPaused: stream.readBoolean()
                    });
                }
                return { data: { type, clocks } };
            }

            case SyncWorldClocksDataType.InitializeRegistry: {
                const clocks: WorldClock[] = [];
                let count = stream.readUnsignedVarInt();
                while (count-- > 0) {
                    clocks.push({
                        id: stream.readUnsignedVarLong(),
                        name: stream.readString(),
                        time: stream.readVarInt(),
                        isPaused: stream.readBoolean(),
                        timeMarkers: SyncWorldClocksPacket.readTimeMarkers(stream)
                    });
                }
                return { data: { type, clocks } };
            }

            case SyncWorldClocksDataType.AddTimeMarker:
                return {
                    data: {
                        type,
                        clockId: stream.readUnsignedVarLong(),
                        timeMarkers: SyncWorldClocksPacket.readTimeMarkers(stream)
                    }
                };

            case SyncWorldClocksDataType.RemoveTimeMarker: {
                const clockId = stream.readUnsignedVarLong();
                const timeMarkerIds: bigint[] = [];
                let count = stream.readUnsignedVarInt();
                while (count-- > 0) {
                    timeMarkerIds.push(stream.readUnsignedVarLong());
                }
                return { data: { type, clockId, timeMarkerIds } };
            }

            default:
                throw new Error(`Unknown SyncWorldClocksPacket data variant ${type}`);
        }
    }
}
