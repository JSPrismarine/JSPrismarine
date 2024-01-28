import Dirt, { DirtType } from './Dirt.js';

export default class Podzol extends Dirt {
    public constructor() {
        super('minecraft:podzol', DirtType.Podzol);
    }
}
