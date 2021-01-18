import { ItemIdsType } from '../ItemIdsType';
import Tool from '../Tool';

export default class CarrotOnStick extends Tool {
    public constructor() {
        super({
            name: 'minecraft:carrotonastick',
            id: ItemIdsType.CarrotOnStick
        });
    }

    getMaxDurability() {
        return 25;
    }
}
