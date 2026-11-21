/**
 * A level's command storage: Java Edition's `CommandStorage`, the NBT compounds `/data … storage`,
 * `execute store … storage` and `/function … with storage` read and write, each under a resource
 * location such as `mypack:state`.
 *
 * It holds plain data and nothing else, as the scoreboard does, and logs nothing to the change log.
 * The level's save pass writes it under the LevelDB key `jsprismarine:command_storage`.
 */
import type { NbtCompoundTag } from '@jsprismarine/nbt/tag';
import { EMPTY_COMPOUND } from '@jsprismarine/nbt/tag';
import { normalizeIdentifier } from '@jsprismarine/mcfunction';
import { PrismarineWorldErrors } from '@jsprismarine/errors/prismarine/world';

/** What a level's command storage saves: each storage's compound, by its full id. */
export type SavedCommandStorage = ReadonlyMap<string, NbtCompoundTag>;

/** Every storage one level holds, by resource location. */
export class CommandStorage {
    private readonly storages = new Map<string, NbtCompoundTag>();

    /**
     * The full form of a storage id, with the `minecraft` namespace filled in when it has none.
     * @throws {PrismarineWorldErrors.InvalidStorageId} When the id is not a resource location.
     */
    public static idOf(id: string): string {
        const normalized = normalizeIdentifier(id);
        if (normalized === undefined) throw new PrismarineWorldErrors.InvalidStorageId({ id });
        return normalized;
    }

    /**
     * The compound under an id; the empty compound when nothing was written there.
     * @throws {PrismarineWorldErrors.InvalidStorageId} When the id is not a resource location.
     */
    public get(id: string): NbtCompoundTag {
        return this.storages.get(CommandStorage.idOf(id)) ?? EMPTY_COMPOUND;
    }

    /**
     * Replaces the compound under an id. An empty compound removes the storage, as Java's does,
     * so a storage that was emptied is not saved.
     * @throws {PrismarineWorldErrors.InvalidStorageId} When the id is not a resource location.
     */
    public set(id: string, compound: NbtCompoundTag): void {
        const key = CommandStorage.idOf(id);
        if (Object.keys(compound.value).length === 0) this.storages.delete(key);
        else this.storages.set(key, compound);
    }

    /** What the level's save writes: a copy, so a later write cannot reach it. */
    public saved(): SavedCommandStorage {
        return new Map(this.storages);
    }

    /** Replaces everything with what a save held, skipping an id that is not a resource location. */
    public restore(saved: SavedCommandStorage): void {
        this.storages.clear();
        for (const [id, compound] of saved) {
            const key = normalizeIdentifier(id);
            if (key !== undefined && Object.keys(compound.value).length > 0) this.storages.set(key, compound);
        }
    }
}
