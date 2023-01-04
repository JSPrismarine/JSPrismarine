import WhiteConcrete, { ConcreteColorType } from './WhiteConcrete.js';

export default class LightGrayConcrete extends WhiteConcrete {
    public constructor() {
        super('minecraft:light_gray_concrete', ConcreteColorType.LightGray);
    }
}
