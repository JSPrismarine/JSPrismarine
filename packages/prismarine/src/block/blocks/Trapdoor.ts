import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import Solid from '../Solid.js';

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

    public getFlammability() {
        return 20;
    }

    public isTransparent() {
        return true;
    }
}
