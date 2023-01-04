import { BlockIdsType } from '../BlockIdsType.js';
import Solid from '../Solid.js';

export default class Piston extends Solid {
    public constructor(name = 'minecraft:piston', id: BlockIdsType = BlockIdsType.Piston) {
        super({
            name,
            id,
            hardness: 1.5
        });
    }
}
