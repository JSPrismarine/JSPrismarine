import Tool from '../Tool';
import {ItemIdsType} from '../ItemIdsType';

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
