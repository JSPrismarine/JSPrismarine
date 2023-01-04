import type Block from '../../block/Block.js';
import Event from '../Event.js';

export default class BlockRegisterEvent extends Event {
    private readonly block;

    public constructor(block: Block) {
        super();
        this.block = block;
    }

    public getBlock(): Block {
        return this.block;
    }
}
