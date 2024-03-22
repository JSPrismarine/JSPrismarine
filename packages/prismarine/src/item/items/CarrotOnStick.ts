import { ItemIdsType } from '../ItemIdsType';
import Tool from '../Tool';

export default class CarrotOnStick extends Tool {
    public constructor() {
        super({
            name: 'minecraft:carrot_on_a_stick',
            id: ItemIdsType.CarrotOnStick
        });
    }

    public getMaxDurability() {
        return 25;
    }
}
