import { ItemIdsType } from '../ItemIdsType';
import Tool from '../Tool';

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
