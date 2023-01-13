import { BlockIdsType } from '../BlockIdsType.js';
import Solid from '../Solid.js';

export default class StickyPiston extends Solid {
    public constructor(name = 'minecraft:sticky_piston', id: BlockIdsType = BlockIdsType.StickyPiston) {
        super({
            name,
            id,
            hardness: 1.5
        });
    }
}
