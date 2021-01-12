import WhiteConcretePowder, {
    ConcretePowderColorType
} from './WhiteConcretePowder';

export default class BlackConcrete extends WhiteConcretePowder {
    constructor() {
        super(
            'minecraft:black_concrete_powder',
            ConcretePowderColorType.Black
        );
    }
}
