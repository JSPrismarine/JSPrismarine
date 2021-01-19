import { BlockIdsType } from '../BlockIdsType';
import Transparent from '../Transparent';

export default class Glass extends Transparent {
    public constructor(
        name = 'minecraft:glass',
        id: BlockIdsType = BlockIdsType.Glass
    ) {
        super({
            name,
            id,
            hardness: 0.3
        });
    }
}
