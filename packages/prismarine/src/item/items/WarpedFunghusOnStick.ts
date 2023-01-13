import { ItemIdsType } from '../ItemIdsType.js';
import Tool from '../Tool.js';

export default class WarpedFungusOnStick extends Tool {
    public constructor() {
        super({
            name: 'minecraft:warped_fungus_on_a_stick',
            id: ItemIdsType.WarpedFungusOnStick
        });
    }

    public getMaxDurability() {
        return 100;
    }
}
