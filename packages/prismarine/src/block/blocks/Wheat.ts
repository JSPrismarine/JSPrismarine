import { BlockIdsType } from '../BlockIdsType.js';
import Flowable from '../Flowable.js';

export default class Wheat extends Flowable {
    public constructor() {
        super({
            name: 'minecraft:wheat',
            id: BlockIdsType.Wheat,
            hardness: 0
        });
    }
}
