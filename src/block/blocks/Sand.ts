import Solid from '../Solid';
import {BlockIdsType} from '../BlockIdsType';
import {BlockToolType} from '../BlockToolType';

export enum SandType {
    Regular = 0,
    Red = 1
}

export default class Sand extends Solid {
    constructor(
        name: string = 'minecraft:sand',
        type: SandType = SandType.Regular
    ) {
        super({
            name: name,
            id: BlockIdsType.Sand,
            hardness: 0.5
        });
        this.meta = type;
    }

    getToolType() {
        return BlockToolType.Shovel;
    }
}
