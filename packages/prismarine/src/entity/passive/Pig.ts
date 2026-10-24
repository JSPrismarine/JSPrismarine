import { Mob } from '../Mob';

export default class Pig extends Mob {
    public static MOB_ID = 'minecraft:pig';

    public override getType(): string {
        return Pig.MOB_ID;
    }
}
