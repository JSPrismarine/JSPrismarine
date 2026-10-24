import { Mob } from '../Mob';

export default class Rabbit extends Mob {
    public static MOB_ID = 'minecraft:rabbit';

    public override getType(): string {
        return Rabbit.MOB_ID;
    }
}
