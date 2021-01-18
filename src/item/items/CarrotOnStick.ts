import { ItemIdsType } from '../ItemIdsType';
import Tool from '../Tool';

export default class CarrotOnStick extends Tool {
    constructor() {
        super({
            name: 'minecraft:carrotonastick',
            id: ItemIdsType.CarrotOnStick
        });
    }

    getMaxDurability() {
        return 25;
    }
}
