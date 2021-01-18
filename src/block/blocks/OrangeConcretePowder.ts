import WhiteConcretePowder, {
    ConcretePowderColorType
} from './WhiteConcretePowder';

export default class OrangeConcrete extends WhiteConcretePowder {
    constructor() {
        super(
            'minecraft:orange_concrete_powder',
            ConcretePowderColorType.Orange
        );
    }
}
