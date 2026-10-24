import { Block } from './Block';

export class Flowable extends Block {
    public isSolid() {
        return false;
    }

    public canBeFlowedInto() {
        return true;
    }
}
