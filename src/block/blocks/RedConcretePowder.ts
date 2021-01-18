import WhiteConcretePowder, {
    ConcretePowderColorType
} from './WhiteConcretePowder';

export default class RedConcrete extends WhiteConcretePowder {
    constructor() {
        super('minecraft:red_concrete_powder', ConcretePowderColorType.Red);
    }
}
