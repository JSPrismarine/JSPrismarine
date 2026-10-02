import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import { Vector3 } from '@jsprismarine/math';

/**
 * A block that carries state of its own: a chest and what is in it, a sign and what it says.
 *
 * # Nothing is ever dropped
 *
 * `fromNBT` keeps the entire compound it was given. A subclass lifts out the fields it models and
 * deletes them from that copy; `toNBT` starts from what is left and puts the modelled fields back.
 * A type nobody has modelled becomes {@link GenericBlockEntity}, whose remainder is everything, so
 * it round-trips byte for byte.
 *
 * That is not tidiness. A world is full of blocks written by versions and behaviour packs this
 * server knows nothing about, and a provider that quietly wrote back only the fields it understood
 * would erase a player's chests one save at a time, with nothing to say it had happened.
 */
export abstract class BlockEntity {
    /** Vanilla's `id` string - `Chest`, `Sign`, `Furnace`. Not a namespaced identifier. */
    public static readonly ID: string = 'jsprismarine:unknown';

    public readonly position: Vector3;

    /** Every tag this class does not model, kept verbatim so writing back loses nothing. */
    protected readonly extra: NBTTagCompound;

    protected constructor(position: Vector3, extra: NBTTagCompound) {
        this.position = position;
        this.extra = extra;
    }

    public getId(): string {
        return (this.constructor as typeof BlockEntity).ID;
    }

    public getPosition(): Vector3 {
        return this.position;
    }

    /** Whether a piston may push this. Vanilla stores it on every block entity. */
    public isMovable(): boolean {
        return this.extra.getByte('isMovable', 1) !== 0;
    }

    /**
     * Everything the base class models, removed from `nbt` so a subclass sees only what is left.
     * Subclasses call this first, then take their own fields out of the same compound.
     */
    protected static takeCommon(nbt: NBTTagCompound): { position: Vector3; extra: NBTTagCompound } {
        const position = new Vector3(nbt.getNumber('x', 0), nbt.getNumber('y', 0), nbt.getNumber('z', 0));

        const extra = clone(nbt);
        extra.remove('id');
        extra.remove('x');
        extra.remove('y');
        extra.remove('z');

        return { position, extra };
    }

    /**
     * The compound to write back: the untouched remainder, then the fields this class models.
     * Subclasses override, call `super.toNBT()`, and add theirs to the result.
     */
    public toNBT(): NBTTagCompound {
        const nbt = clone(this.extra);
        nbt.addValue('id', new Types.StringVal(this.getId()));
        nbt.addValue('x', new Types.NumberVal(this.position.getX()));
        nbt.addValue('y', new Types.NumberVal(this.position.getY()));
        nbt.addValue('z', new Types.NumberVal(this.position.getZ()));

        return nbt;
    }
}

/**
 * A shallow copy. The children are shared, which is what makes retaining an unmodelled subtree
 * free - nothing here ever mutates one, it only adds and removes top level keys.
 */
export const clone = (nbt: NBTTagCompound): NBTTagCompound => {
    const copy = new NBTTagCompound(nbt.getName() ?? '');
    for (const [key, value] of nbt.entries()) copy.children.set(key, value);

    return copy;
};

export default BlockEntity;
