import { Item } from '../Item';
import { ItemIdsType } from '../ItemIdsType';

export default class Book extends Item {
    public constructor() {
        super({
            name: 'minecraft:book',
            id: ItemIdsType.Book
        });
    }
}
