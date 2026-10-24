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
const isBlockEntityClass = (candidate: unknown): candidate is BlockEntityClass =>
    typeof candidate === 'function' &&
    'ID' in candidate &&
    typeof candidate.ID === 'string' &&
    'fromNBT' in candidate &&
    typeof candidate.fromNBT === 'function';

/**
 * Turns a block entity's NBT into an object.
 *
 * A type nobody has modeled becomes a {@link GenericBlockEntity} rather than an error, because
 * the alternative - refusing the chunk - would make a world unopenable over one unfamiliar block,
 * and the generic form still round-trips it untouched.
 */
export class BlockEntityRegistry {
    private static index: Map<string, BlockEntityClass> | null = null;

    private static classes(): Map<string, BlockEntityClass> {
        if (this.index !== null) return this.index;

        this.index = new Map();
        for (const candidate of Object.values(BlockEntities)) {
            if (!isBlockEntityClass(candidate)) continue;

            this.index.set(candidate.ID, candidate);
        }

        return this.index;
    }

    public static fromNBT(nbt: NBTTagCompound): BlockEntity {
        const id = nbt.getString('id', '');
        const modeled = this.classes().get(id);

        return modeled ? modeled.fromNBT(nbt) : GenericBlockEntity.fromNBT(nbt);
    }

    /** Whether a type is modeled, as opposed to merely preserved. Used in tests and logs. */
    public static isModeled(id: string): boolean {
        return this.classes().has(id);
    }

    /** Every modeled id, for diagnostics. */
    public static ids(): string[] {
        return [...this.classes().keys()];
    }

    /** Drops the index, so a test can register something and have it picked up. */
    public static reset(): void {
        this.index = null;
    }
}

export default BlockEntityRegistry;
