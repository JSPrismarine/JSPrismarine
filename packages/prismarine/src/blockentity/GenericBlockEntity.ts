import type { NBTTagCompound } from '@jsprismarine/nbt';
import type { Vector3 } from '@jsprismarine/math';

import { BlockEntity } from './BlockEntity';

/**
 * Any block entity this server does not model.
 *
 * It keeps the whole compound and writes it straight back, so a jukebox, a beacon or something
 * from a behaviour pack survives being loaded and saved untouched. Its reported id is the one the
 * file gave it rather than a constant, so it still looks like what it is.
 */
export class GenericBlockEntity extends BlockEntity {
    private readonly id: string;

    public constructor(id: string, position: Vector3, extra: NBTTagCompound) {
        super(position, extra);
        this.id = id;
    }

    public override getId(): string {
        return this.id;
    }

    public static fromNBT(nbt: NBTTagCompound): GenericBlockEntity {
        const { position, extra } = this.takeCommon(nbt);
        return new GenericBlockEntity(nbt.getString('id', 'Unknown'), position, extra);
    }
}

export default GenericBlockEntity;
