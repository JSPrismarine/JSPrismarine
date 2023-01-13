import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import Solid from '../Solid.js';

export enum SandType {
    Regular = 0,
    Red = 1
}

export default class Sand extends Solid {
    public constructor(name = 'minecraft:sand', type: SandType = SandType.Regular) {
        super({
            name,
            id: BlockIdsType.Sand,
            hardness: 0.5
        });
        this.meta = type;
    }

    public getToolType() {
        return [BlockToolType.None, BlockToolType.Shovel];
    }
}
