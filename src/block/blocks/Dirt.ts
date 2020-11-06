import Solid from '../Solid';
import {BlockIdsType} from '../BlockIdsType';
import {BlockToolType} from '../BlockToolType';

export enum DirtType {
    Regular = 0,
    Coarse = 1
}

export default class Dirt extends Solid {
    constructor(
        name: string = 'minecraft:dirt',
        type: DirtType = DirtType.Regular
    ) {
        super({
            name: name,
            id: BlockIdsType.Dirt,
            hardness: 0.5
        });
        this.meta = type;
    }

    getToolType() {
        return BlockToolType.Shovel;
    }
}
