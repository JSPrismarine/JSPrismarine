import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import Solid from '../Solid';

export enum DirtType {
    Regular = 0,
    Coarse = 1
}

export default class Dirt extends Solid {
    public constructor(
        name = 'minecraft:dirt',
        type: DirtType = DirtType.Regular
    ) {
        super({
            name,
            id: BlockIdsType.Dirt,
            hardness: 0.5
        });
        this.meta = type;
    }

    public getToolType() {
        return BlockToolType.Shovel;
    }
}
