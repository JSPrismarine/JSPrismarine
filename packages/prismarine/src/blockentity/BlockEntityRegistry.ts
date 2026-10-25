import type { NBTTagCompound } from '@jsprismarine/nbt';

import * as BlockEntities from './BlockEntities';
import { GenericBlockEntity } from './GenericBlockEntity';
import type { BlockEntity } from './BlockEntity';

/** What a block entity class has to offer to be registered. */
interface BlockEntityClass {
    readonly ID: string;
    fromNBT(nbt: NBTTagCompound): BlockEntity;
}

/**
 * Whether a module export is a block entity class: a function carrying a string ID and a reader.
 * The module exports a helper alongside the classes, so this is what tells them apart.
 */
const isBlockEntityClass = <T>(candidate: T): candidate is T & BlockEntityClass =>
    typeof candidate === 'function' &&
    'ID' in candidate &&
    typeof candidate.ID === 'string' &&
    'fromNBT' in candidate &&
    typeof candidate.fromNBT === 'function';

/**
 * Id to class, for every block entity this server models.
 *
 * A constant rather than a cache. The only source is `./BlockEntities`, which a module
 * graph fixes at import, so nothing can add to it or change it later and there was never
 * anything for an invalidation hook to drop. It used to be built lazily behind a mutable
 * static with a `reset()` beside it, which read as per-process state two servers would
 * share.
 */
const MODELED: ReadonlyMap<string, BlockEntityClass> = new Map(
    Object.values(BlockEntities)
        .filter(isBlockEntityClass)
        .map((candidate) => [candidate.ID, candidate] as const)
);

/**
 * Turns a block entity's NBT into an object.
 *
 * A type nobody has modeled becomes a {@link GenericBlockEntity} rather than an error, because
 * the alternative - refusing the chunk - would make a world unopenable over one unfamiliar block,
 * and the generic form still round-trips it untouched.
 */
export class BlockEntityRegistry {
    public static fromNBT(nbt: NBTTagCompound): BlockEntity {
        const modeled = MODELED.get(nbt.getString('id', ''));

        return modeled ? modeled.fromNBT(nbt) : GenericBlockEntity.fromNBT(nbt);
    }

    /** Whether a type is modeled, as opposed to merely preserved. Used in tests and logs. */
    public static isModeled(id: string): boolean {
        return MODELED.has(id);
    }

    /** Every modeled id, for diagnostics. */
    public static ids(): string[] {
        return [...MODELED.keys()];
    }
}

export default BlockEntityRegistry;
