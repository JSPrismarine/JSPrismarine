import { Mob } from '../Mob';

export default class Donkey extends Mob {
    public static MOB_ID = 'minecraft:donkey';

    public override getType(): string {
        return Donkey.MOB_ID;
    }
}
