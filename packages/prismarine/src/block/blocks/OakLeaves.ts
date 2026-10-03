import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import type { DropChance } from '../DropTable';
import { DropTable } from '../DropTable';
import { Solid } from '../Solid';

export enum LeavesType {
    Oak = 0,
    Spruce = 1,
    Birch = 2,
    Jungle = 3,
    Acacia = 4,
    DarkOak = 5
}

export default class Leaves extends Solid {
    public constructor(name = 'minecraft:oak_leaves', type: LeavesType = LeavesType.Oak) {
        super({
            name,
            id: BlockIdsType.Leaves,
            hardness: 0.2
        });
        this.meta = type;
    }

    public getToolType() {
        return [BlockToolType.Shears];
    }

    public getFlammability() {
        return 20;
    }

    public getFuelTime() {
        return 300;
    }

    /**
     * A sapling one time in twenty, sticks one in fifty, and an apple one in two hundred from
     * the two oaks.
     *
     * The sapling is derived from this block's own name rather than listed per wood, so the
     * five subclasses below need no table of their own and a sixth wood cannot be added with
     * the wrong one. Every leaf block is `<wood>_leaves` and every sapling `<wood>_sapling`.
     * @returns {DropTable} what falls, before shears are taken into account.
     */
    public override getDropTable(): DropTable {
        const wood = this.getName().replace('minecraft:', '').replace('_leaves', '');

        const drops: DropChance[] = [
            { name: `minecraft:${wood}_sapling`, oneIn: 20 },
            { name: 'minecraft:stick', min: 1, max: 2, oneIn: 50 }
        ];

        // Only the oaks bear fruit, and dark oak drops from its own leaves as oak does.
        if (wood === 'oak' || wood === 'dark_oak') drops.push({ name: 'minecraft:apple', oneIn: 200 });

        return new DropTable(drops);
    }
}
