import Transparent from '../Transparent';
import { BlockIdsType } from '../BlockIdsType';

export default class Air extends Transparent {
    constructor() {
        super({
            name: 'minecraft:air',
            id: BlockIdsType.Air,
            hardness: -1
        });
    }

    public getRuntimeId() {
        return 0;
    }

    getBlastResistance() {
        return 0;
    }

    canPassThrough() {
        return true;
    }

    canBePlaced() {
        return false;
    }

    isBreakable() {
        return false;
    }

    isSolid() {
        return false;
    }

    isPartOfCreativeInventory() {
        return false;
    }
}
