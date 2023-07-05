import { ItemIdsType } from '../ItemIdsType.js';
import Tool from '../Tool.js';

export default class CarrotOnStick extends Tool {
    public constructor() {
        super({
            name: 'minecraft:carrotonastick',
            id: ItemIdsType.CarrotOnStick
        });
    }

    public getMaxDurability() {
        return 25;
    }
}
