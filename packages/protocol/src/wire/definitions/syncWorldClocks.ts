/**
 * The world clocks a server defines beyond the day-night cycle.
 *
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/#packets}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import { SyncWorldClocksDataType } from '../../packet/SyncWorldClocksPacket';

import type { SyncWorldClocksData, TimeMarker, WorldClock, WorldClockState } from '../../packet/SyncWorldClocksPacket';
import type { PayloadOf } from '../define';

const timeMarker = t.custom<TimeMarker>(
    'TimeMarkerData',
    (s, v) => {
        t.varuint64.write(s, v.id);
        t.string.write(s, v.name);
        t.varint32.write(s, v.time);
        t.li32.write(s, v.period);
    },
    (s) => ({ id: t.varuint64.read(s), name: t.string.read(s), time: t.varint32.read(s), period: t.li32.read(s) })
);

const worldClock = t.custom<WorldClock>(
    'WorldClockData',
    (s, v) => {
        t.varuint64.write(s, v.id);
        t.string.write(s, v.name);
        t.varint32.write(s, v.time);
        t.bool.write(s, v.isPaused);
        t.list(timeMarker).write(s, v.timeMarkers);
    },
    (s) => ({
        id: t.varuint64.read(s),
        name: t.string.read(s),
        time: t.varint32.read(s),
        isPaused: t.bool.read(s),
        timeMarkers: t.list(timeMarker).read(s)
    })
);

const worldClockState = t.custom<WorldClockState>(
    'SyncWorldClockStateData',
    (s, v) => {
        t.varuint64.write(s, v.clockId);
        t.varint32.write(s, v.time);
        t.bool.write(s, v.isPaused);
    },
    (s) => ({ clockId: t.varuint64.read(s), time: t.varint32.read(s), isPaused: t.bool.read(s) })
);

/** `Data`: a Cereal tagged variant, a varuint32 selector then the chosen alternative's fields. */
export const worldClocksData = t.custom<SyncWorldClocksData>(
    'WorldClocksData',
    (s, v) => {
        t.varuint32.write(s, v.type);
        switch (v.type) {
            case SyncWorldClocksDataType.SyncState:
                t.list(worldClockState).write(s, v.clocks);
                break;
            case SyncWorldClocksDataType.InitializeRegistry:
                t.list(worldClock).write(s, v.clocks);
                break;
            case SyncWorldClocksDataType.AddTimeMarker:
                t.varuint64.write(s, v.clockId);
                t.list(timeMarker).write(s, v.timeMarkers);
                break;
            case SyncWorldClocksDataType.RemoveTimeMarker:
                t.varuint64.write(s, v.clockId);
                t.list(t.varuint64).write(s, v.timeMarkerIds);
                break;
        }
    },
    (s): SyncWorldClocksData => {
        const type = t.varuint32.read(s);
        switch (type) {
            case SyncWorldClocksDataType.SyncState:
                return { type, clocks: t.list(worldClockState).read(s) };
            case SyncWorldClocksDataType.InitializeRegistry:
                return { type, clocks: t.list(worldClock).read(s) };
            case SyncWorldClocksDataType.AddTimeMarker:
                return { type, clockId: t.varuint64.read(s), timeMarkers: t.list(timeMarker).read(s) };
            case SyncWorldClocksDataType.RemoveTimeMarker:
                return { type, clockId: t.varuint64.read(s), timeMarkerIds: t.list(t.varuint64).read(s) };
            default:
                throw new Error(`Unknown SyncWorldClocksPacket data type ${type}`);
        }
    }
);

/** The `SyncWorldClocksPacket` field list. */
export const syncWorldClocksPacket = definePacket('SyncWorldClocksPacket', {
    /** `Data`: the one alternative this packet carries. */
    data: worldClocksData
});

/** Initializes and keeps in sync the world clocks of a server. */
export type SyncWorldClocksPayload = PayloadOf<typeof syncWorldClocksPacket>;
