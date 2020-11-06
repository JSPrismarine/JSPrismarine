import Tool from '../Tool';
import { ItemIdsType } from '../ItemIdsType';

export default class WarpedFungusOnStick extends Tool {
    constructor() {
        super({
            name: 'minecraft:warped_fungus_on_a_stick',
            id: ItemIdsType.WarpedFungusOnStick
        });
    }

    getMaxDurability() {
        return 100;
    }
}
