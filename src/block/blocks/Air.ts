import Block from '../'

export default class Air extends Block {
    constructor() {
        super({
            name: 'minecraft:air',
            id: 0,
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
