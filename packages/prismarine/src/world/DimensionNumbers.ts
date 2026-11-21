/**
 * The Bedrock number of each custom dimension of one save, which the save keeps
 * ([ADR 0029](../../../../docs/adr/0029-worlds-are-levels-the-server-manages.md)).
 *
 * The wire protocol and the LevelDB chunk keys name a dimension by a number, and a custom one has
 * no number of its own: the level gives it one from {@link FIRST_CUSTOM_DIMENSION_ID} up. Its
 * chunks are filed under that number, so the number has to come back the same at every start,
 * whatever order the config, the datapacks and the scripts name the dimensions in, and no other
 * dimension may ever take it. Each dimension also gets a UUID, its identity in the table.
 */
import { randomUUID } from 'node:crypto';

import { FIRST_CUSTOM_DIMENSION_ID } from './DimensionType';

/** One entry of the table as a save keeps it. */
export interface SavedDimensionNumber {
    /** The dimension type id, such as `mypack:skylands`. */
    readonly type: string;
    /** The Bedrock number, {@link FIRST_CUSTOM_DIMENSION_ID} or more. */
    readonly id: number;
}

/** The table as a save keeps it: each dimension's entry by its UUID. */
export type SavedDimensionNumbers = Readonly<Record<string, SavedDimensionNumber>>;

/** A save's custom dimension numbers, read from its record and handing out new ones. */
export class DimensionNumbers {
    /** The entries, by UUID, in the order they were made. */
    private readonly entries = new Map<string, SavedDimensionNumber>();
    /** Whether a number was handed out since the table was read, so the save has to write it. */
    private changed = false;

    /**
     * @param saved - The table the save kept, or undefined for a save from before it had one. Such
     *   a save gets numbers in the order the level asks, from {@link FIRST_CUSTOM_DIMENSION_ID},
     *   which is the order its numbers were given in before.
     */
    public constructor(saved: SavedDimensionNumbers | undefined) {
        for (const [uuid, entry] of Object.entries(saved ?? {})) this.entries.set(uuid, entry);
    }

    /** The number of a custom dimension type: the one the table keeps, or the next one nothing has had. */
    public numberOf(type: string): number {
        for (const entry of this.entries.values()) if (entry.type === type) return entry.id;
        const id = Math.max(FIRST_CUSTOM_DIMENSION_ID - 1, ...[...this.entries.values()].map((entry) => entry.id)) + 1;
        this.entries.set(randomUUID(), { type, id });
        this.changed = true;
        return id;
    }

    /** The UUID of a dimension type the table has, or undefined. */
    public uuidOf(type: string): string | undefined {
        for (const [uuid, entry] of this.entries) if (entry.type === type) return uuid;
        return undefined;
    }

    /** Whether the table handed out a number since it was read or last saved. */
    public isChanged(): boolean {
        return this.changed;
    }

    /** The table for the save to keep. Taking it counts as saving it. */
    public saved(): SavedDimensionNumbers {
        this.changed = false;
        return Object.fromEntries(this.entries);
    }
}
