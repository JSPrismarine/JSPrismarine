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
 * Turns a block entity's NBT into an object.
 *
 * A type nobody has modelled becomes a {@link GenericBlockEntity} rather than an error, because
 * the alternative - refusing the chunk - would make a world unopenable over one unfamiliar block,
 * and the generic form still round-trips it untouched.
 */
export class BlockEntityRegistry {
    private static index: Map<string, BlockEntityClass> | null = null;

    private static classes(): Map<string, BlockEntityClass> {
        if (this.index !== null) return this.index;

        this.index = new Map();
        for (const candidate of Object.values(BlockEntities)) {
            // The module exports a helper alongside the classes; only the ones carrying an ID and
            // a reader are block entities.
            if (typeof candidate !== 'function') continue;

            const blockEntity = candidate as unknown as Partial<BlockEntityClass>;
            if (typeof blockEntity.ID !== 'string' || typeof blockEntity.fromNBT !== 'function') continue;

            this.index.set(blockEntity.ID, blockEntity as BlockEntityClass);
        }

        return this.index;
    }

    public static fromNBT(nbt: NBTTagCompound): BlockEntity {
        const id = nbt.getString('id', '');
        const modelled = this.classes().get(id);

        return modelled ? modelled.fromNBT(nbt) : GenericBlockEntity.fromNBT(nbt);
    }

    /** Whether a type is modelled, as opposed to merely preserved. Used in tests and logs. */
    public static isModelled(id: string): boolean {
        return this.classes().has(id);
    }

    /** Every modelled id, for diagnostics. */
    public static ids(): string[] {
        return [...this.classes().keys()];
    }

    /** Drops the index, so a test can register something and have it picked up. */
    public static reset(): void {
        this.index = null;
    }
}

export default BlockEntityRegistry;
