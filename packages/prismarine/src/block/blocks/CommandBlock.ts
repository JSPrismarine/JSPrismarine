import { BlockIdsType } from '../BlockIdsType.js';
import Solid from '../Solid.js';

export default class CommandBlock extends Solid {
    public constructor() {
        super({
            name: 'minecraft:command_block',
            id: BlockIdsType.CommandBlock,
            hardness: -1
        });
    }

    public isBreakable() {
        return false;
    }

    public getBlastResistance() {
        return 18_000_000;
    }

    public isPartOfCreativeInventory() {
        return false;
    }
}
