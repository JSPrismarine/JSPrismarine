import { BlockIdsType } from '../BlockIdsType';
import Solid from '../Solid';

export default class StickyPiston extends Solid {
    constructor(
        name = 'minecraft:sticky_piston',
        id: BlockIdsType = BlockIdsType.StickyPiston
    ) {
        super({
            name,
            id,
            hardness: 1.5
        });
    }
}
