import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { Solid } from '../Solid';

export default class Trapdoor extends Solid {
    public constructor() {
        super({
            name: 'minecraft:trapdoor',
            id: BlockIdsType.Trapdoor,
            hardness: 3
        });
    }

    public getToolType() {
        return [BlockToolType.Axe];
    }

    public isTransparent() {
        return true;
    }
}
