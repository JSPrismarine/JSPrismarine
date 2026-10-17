import type { NBTTagCompound } from '@jsprismarine/nbt';
import { Types } from '@jsprismarine/nbt';
import type { Vector3 } from '@jsprismarine/math';

import { BlockEntity, clone } from './BlockEntity';

/**
 * The block entities the server models.
 *
 * A flat module of named exports walked by {@link BlockEntityRegistry}, the same shape
 * `entity/Entities.ts` uses - adding one is an export here and nothing else.
 *
 * Each class models the fields the server has a use for and leaves everything else in `extra`.
 * That is why these are short: a chest's inventory is a list of item compounds the server does not
 * yet have an inventory model for, so it is retained rather than half-parsed into something that
 * would lose data on the way back out.
 */

/** A container's items, kept as written until the server has an inventory model to put them in. */
abstract class Container extends BlockEntity {
    public getItems(): Set<NBTTagCompound> {
        return (this.extra.getList('Items', false) as Set<NBTTagCompound> | null) ?? new Set();
    }

    public isEmpty(): boolean {
        return this.getItems().size === 0;
    }

    /** A container's display name, when the player has renamed it in an anvil. */
    public getCustomName(): string | null {
        const name = this.extra.getString('CustomName', '');
        return name.length > 0 ? name : null;
    }
}

export class Chest extends Container {
    public static override readonly ID = 'Chest';

    public static fromNBT(nbt: NBTTagCompound): Chest {
        const { position, extra } = this.takeCommon(nbt);
        return new Chest(position, extra);
    }

    /** A double chest records the other half's position; a single one records nothing. */
    public getPairPosition(): { x: number; z: number } | null {
        if (!this.extra.has('pairx') || !this.extra.has('pairz')) return null;

        return { x: this.extra.getNumber('pairx', 0), z: this.extra.getNumber('pairz', 0) };
    }
}

export class Barrel extends Container {
    public static override readonly ID = 'Barrel';

    public static fromNBT(nbt: NBTTagCompound): Barrel {
        const { position, extra } = this.takeCommon(nbt);
        return new Barrel(position, extra);
    }
}

export class ShulkerBox extends Container {
    public static override readonly ID = 'ShulkerBox';

    public static fromNBT(nbt: NBTTagCompound): ShulkerBox {
        const { position, extra } = this.takeCommon(nbt);
        return new ShulkerBox(position, extra);
    }
}

export class Hopper extends Container {
    public static override readonly ID = 'Hopper';

    public static fromNBT(nbt: NBTTagCompound): Hopper {
        const { position, extra } = this.takeCommon(nbt);
        return new Hopper(position, extra);
    }
}

export class Furnace extends Container {
    public static override readonly ID = 'Furnace';

    private burnTime: number;
    private cookTime: number;

    protected constructor(position: Vector3, extra: NBTTagCompound, burnTime: number, cookTime: number) {
        super(position, extra);
        this.burnTime = burnTime;
        this.cookTime = cookTime;
    }

    public static fromNBT(nbt: NBTTagCompound): Furnace {
        const { position, extra } = this.takeCommon(nbt);
        const burnTime = extra.getShort('BurnTime', 0);
        const cookTime = extra.getShort('CookTime', 0);
        extra.remove('BurnTime');
        extra.remove('CookTime');

        return new Furnace(position, extra, burnTime, cookTime);
    }

    public getBurnTime(): number {
        return this.burnTime;
    }

    public getCookTime(): number {
        return this.cookTime;
    }

    public isLit(): boolean {
        return this.burnTime > 0;
    }

    public override toNBT(): NBTTagCompound {
        const nbt = super.toNBT();
        nbt.addValue('BurnTime', new Types.ShortVal(this.burnTime));
        nbt.addValue('CookTime', new Types.ShortVal(this.cookTime));
        return nbt;
    }
}

/**
 * A sign's text.
 *
 * Since 1.19.80 vanilla keeps the front and back faces in their own compounds, with the text
 * inside a further `SignTextComponent`. Older worlds have a flat `Text` field. Both are read; the
 * newer shape is written, since that is what the client this server targets expects.
 */
export class Sign extends BlockEntity {
    public static override readonly ID = 'Sign';

    private readonly frontText: string;
    private readonly backText: string;

    protected constructor(position: Vector3, extra: NBTTagCompound, frontText: string, backText: string) {
        super(position, extra);
        this.frontText = frontText;
        this.backText = backText;
    }

    public static fromNBT(nbt: NBTTagCompound): Sign {
        const { position, extra } = this.takeCommon(nbt);

        const legacy = extra.getString('Text', '');
        const front = faceText(extra.getCompound('FrontText', false));
        const back = faceText(extra.getCompound('BackText', false));

        return new Sign(position, extra, front ?? legacy, back ?? '');
    }

    public getText(): string {
        return this.frontText;
    }

    public getBackText(): string {
        return this.backText;
    }

    public getLines(): string[] {
        return this.frontText.split('\n');
    }
}

const faceText = (face: NBTTagCompound | null): string | null => {
    if (!face) return null;

    const component = face.getCompound('SignTextComponent', false);
    return component ? component.getString('Text', '') : face.getString('Text', '');
};

export class Skull extends BlockEntity {
    public static override readonly ID = 'Skull';

    public static fromNBT(nbt: NBTTagCompound): Skull {
        const { position, extra } = this.takeCommon(nbt);
        return new Skull(position, extra);
    }

    public getSkullType(): number {
        return this.extra.getByte('SkullType', 0);
    }

    public getRotation(): number {
        return this.extra.getFloat('Rotation', 0);
    }
}

export class Bed extends BlockEntity {
    public static override readonly ID = 'Bed';

    public static fromNBT(nbt: NBTTagCompound): Bed {
        const { position, extra } = this.takeCommon(nbt);
        return new Bed(position, extra);
    }

    public getColor(): number {
        return this.extra.getByte('color', 0);
    }
}

export class Banner extends BlockEntity {
    public static override readonly ID = 'Banner';

    public static fromNBT(nbt: NBTTagCompound): Banner {
        const { position, extra } = this.takeCommon(nbt);
        return new Banner(position, extra);
    }

    public getBaseColor(): number {
        return this.extra.getNumber('Base', 0);
    }

    /** The layered pattern compounds, kept as written. */
    public getPatterns(): Set<NBTTagCompound> {
        return (this.extra.getList('Patterns', false) as Set<NBTTagCompound> | null) ?? new Set();
    }
}

export class ItemFrame extends BlockEntity {
    public static override readonly ID = 'ItemFrame';

    public static fromNBT(nbt: NBTTagCompound): ItemFrame {
        const { position, extra } = this.takeCommon(nbt);
        return new ItemFrame(position, extra);
    }

    public getItem(): NBTTagCompound | null {
        return this.extra.getCompound('Item', false);
    }

    public getRotation(): number {
        return this.extra.getByte('ItemRotation', 0);
    }
}

export class MobSpawner extends BlockEntity {
    public static override readonly ID = 'MobSpawner';

    public static fromNBT(nbt: NBTTagCompound): MobSpawner {
        const { position, extra } = this.takeCommon(nbt);
        return new MobSpawner(position, extra);
    }

    public getEntityIdentifier(): string {
        return this.extra.getString('EntityIdentifier', '');
    }

    public getDelay(): number {
        return this.extra.getShort('Delay', 0);
    }
}

export { clone };
