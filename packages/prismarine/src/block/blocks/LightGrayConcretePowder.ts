import WhiteConcretePowder, { ConcretePowderColorType } from './WhiteConcretePowder';

export default class LightGrayConcrete extends WhiteConcretePowder {
    public constructor() {
        super('minecraft:light_gray_concrete_powder', ConcretePowderColorType.LightGray);
    }
}
