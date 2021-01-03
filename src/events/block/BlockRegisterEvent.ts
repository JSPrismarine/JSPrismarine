import Event from '../Event';
import type Block from '../../block/Block';

export default class BlockRegisterEvent extends Event {
    private readonly block;

    constructor(block: Block) {
        super();
        this.block = block;
    }

    public getBlock(): Block {
        return this.block;
    }
}
