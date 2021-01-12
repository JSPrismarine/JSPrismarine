import WhiteConcretePowder, {
    ConcretePowderColorType
} from './WhiteConcretePowder';

export default class GrayConcrete extends WhiteConcretePowder {
    constructor() {
        super(
            'minecraft:gray_concrete_powder',
            ConcretePowderColorType.Gray
        );
    }
}
