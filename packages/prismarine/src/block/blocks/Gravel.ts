import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import type { Item } from '../../item/Item';
import type Server from '../../Server';
import { DropTable } from '../DropTable';
import { Solid } from '../Solid';

export default class Sand extends Solid {
    public constructor(name = 'minecraft:gravel') {
        super({
            name,
            id: BlockIdsType.Gravel,
            hardness: 0.6
        });
    }

    public getToolType() {
        return [BlockToolType.None, BlockToolType.Shovel];
    }

    /**
     * Flint one time in ten, gravel the other nine.
     *
     * This was a `Math.floor(Math.random() * 10) === 1` in the body of the method: the right
     * odds, but untestable and impossible to state without reading it - and comparing against
     * `1` rather than `0` is a mistake that reads identically and is not one.
     */
    public getDropTable(): DropTable {
        return new DropTable([{ name: 'minecraft:flint', oneIn: 10 }]);
    }

    public getDropsForCompatibleTool(item: Item, server: Server) {
        const flint = super.getDropsForCompatibleTool(item, server);

        return flint.length > 0 ? flint : [server.getBlockManager().getBlock('minecraft:gravel')];
    }
}
