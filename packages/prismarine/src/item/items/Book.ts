import Item from '../Item.js';
import { ItemIdsType } from '../ItemIdsType.js';

export default class Book extends Item {
    public constructor() {
        super({
            name: 'minecraft:book',
            id: ItemIdsType.Book
        });
    }
}
