import { BlockIdsType } from '../BlockIdsType';
import Transparent from '../Transparent';

export default class Air extends Transparent {
    public constructor() {
        super({
            name: 'minecraft:air',
            id: BlockIdsType.Air,
            hardness: -1
        });
    }

    public getRuntimeId() {
        return 0;
    }

    public getBlastResistance() {
        return 0;
    }

    public canPassThrough() {
        return true;
    }

    public canBePlaced() {
        return false;
    }

    public isBreakable() {
        return false;
    }

    public isSolid() {
        return false;
    }

    public isPartOfCreativeInventory() {
        return false;
    }
}
