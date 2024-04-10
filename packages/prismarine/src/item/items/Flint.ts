import { Item } from '../Item';
import { ItemIdsType } from '../ItemIdsType';

export default class Flint extends Item {
    public constructor() {
        super({
            name: 'minecraft:flint',
            id: ItemIdsType.Flint
        });
    }
}
