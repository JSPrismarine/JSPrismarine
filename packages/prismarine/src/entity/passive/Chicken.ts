import { Mob } from '../Mob';

export default class Chicken extends Mob {
    public static MOB_ID = 'minecraft:chicken';

    public override getType(): string {
        return Chicken.MOB_ID;
    }
}
