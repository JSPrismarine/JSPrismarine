import Item from '../Item.js';
import { ItemIdsType } from '../ItemIdsType.js';

export default class Flint extends Item {
    public constructor() {
        super({
            name: 'minecraft:flint',
            id: ItemIdsType.Flint
        });
    }
}
