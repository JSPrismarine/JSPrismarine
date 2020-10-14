import Block from '../'
import { BlockIdsType } from '../BlockIdsType';

export default class Air extends Block {
    constructor() {
        super({
            name: 'minecraft:air',
            id: BlockIdsType.Air,
            hardness: -1
        });
    }

    canPassThrough() {
		return true;
    }
    
    isBreakable() {
		return false;
    }
    
    canBePlaced() {
		return false;
    }
    
    isSolid() {
		return false;
	}
};
