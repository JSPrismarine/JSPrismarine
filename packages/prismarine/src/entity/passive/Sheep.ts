import { Mob } from '../Mob';

export default class Sheep extends Mob {
    public static MOB_ID = 'minecraft:sheep';

    public override getType(): string {
        return Sheep.MOB_ID;
    }
}
