/**
 * The settings a level's scripts set through `@minecraft/server` that no other part of the level
 * keeps: `world.allowCheats`, the `playerWaypoints` game rule and the overworld clock's time
 * markers. BDS saves them with the world, so the level saves them in its record, and they outlast
 * a `/reload` and a restart. The clock's pause is the level's own clock's.
 */
import { isRecord } from '../utils/isRecord';

/** Whether the locator bar shows every player, as the Script API's `playerWaypoints` names it. */
export type PlayerWaypointsMode = 'Everyone' | 'Off';

/** A time marker on the overworld clock. */
export interface LevelTimeMarker {
    readonly name: string;
    readonly time: number;
    /** Ticks between two of its times; absent for a marker that comes once. */
    readonly period?: number;
}

/** The settings as the level's record stores them. */
export interface SavedScriptSettings {
    readonly allowCheats: boolean;
    readonly playerWaypoints: PlayerWaypointsMode;
    readonly timeMarkers: readonly LevelTimeMarker[];
}

/** What a new Bedrock world starts with, as the `world-settings` parity scenario recorded. */
const DEFAULTS: SavedScriptSettings = { allowCheats: true, playerWaypoints: 'Everyone', timeMarkers: [] };

/** One level's script settings. */
export class LevelScriptSettings {
    public allowCheats = DEFAULTS.allowCheats;
    public playerWaypoints: PlayerWaypointsMode = DEFAULTS.playerWaypoints;
    /** The markers, in the order they were added, which is the order the Script API lists them in. */
    public readonly timeMarkers: LevelTimeMarker[] = [];

    /** The settings to save. */
    public saved(): SavedScriptSettings {
        return {
            allowCheats: this.allowCheats,
            playerWaypoints: this.playerWaypoints,
            timeMarkers: this.timeMarkers.map((marker) => ({ ...marker }))
        };
    }

    /** Takes the settings a save held. */
    public restore(saved: SavedScriptSettings | undefined): void {
        const settings = saved ?? DEFAULTS;
        this.allowCheats = settings.allowCheats;
        this.playerWaypoints = settings.playerWaypoints;
        this.timeMarkers.splice(0, this.timeMarkers.length, ...settings.timeMarkers);
    }
}

const timeMarkerOf = (value: unknown): LevelTimeMarker | undefined => {
    if (!isRecord(value) || typeof value.name !== 'string' || typeof value.time !== 'number') return undefined;
    const period = typeof value.period === 'number' ? value.period : undefined;
    return { name: value.name, time: value.time, ...(period === undefined ? {} : { period }) };
};

/**
 * Reads saved settings at the JSON boundary. A field that does not parse takes the default, and a
 * marker that does not parse is dropped.
 */
export const savedScriptSettingsOf = (value: unknown): SavedScriptSettings | undefined => {
    if (!isRecord(value)) return undefined;
    return {
        allowCheats: typeof value.allowCheats === 'boolean' ? value.allowCheats : DEFAULTS.allowCheats,
        playerWaypoints:
            value.playerWaypoints === 'Everyone' || value.playerWaypoints === 'Off'
                ? value.playerWaypoints
                : DEFAULTS.playerWaypoints,
        timeMarkers: Array.isArray(value.timeMarkers)
            ? value.timeMarkers.flatMap((entry) => timeMarkerOf(entry) ?? [])
            : []
    };
};
