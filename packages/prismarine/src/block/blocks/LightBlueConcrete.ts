import WhiteConcrete, { ConcreteColorType } from './WhiteConcrete.js';

export default class lightBlueConcrete extends WhiteConcrete {
    public constructor() {
        super('minecraft:light_blue_concrete', ConcreteColorType.LightBlue);
    }
}
