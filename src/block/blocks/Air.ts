import { BlockIdsType } from '../BlockIdsType';
import Transparent from '../Transparent';

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
