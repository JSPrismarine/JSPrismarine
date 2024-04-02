import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { Solid } from '../Solid';

export default class Chest extends Solid {
    public constructor() {
        super({
            name: 'minecraft:chest',
            id: BlockIdsType.Chest,
            hardness: 2.5
        });
    }

    public getToolType() {
        return [BlockToolType.None, BlockToolType.Axe];
    }

    public getFlammability() {
        return 20;
    }

    public getFuelTime() {
        return 300;
    }
}
