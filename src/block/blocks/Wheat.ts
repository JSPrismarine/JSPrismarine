import { BlockIdsType } from '../BlockIdsType';
import Flowable from '../Flowable';

export default class Wheat extends Flowable {
    constructor() {
        super({
            name: 'minecraft:wheat',
            id: BlockIdsType.Wheat,
            hardness: 0
        });
    }
}
