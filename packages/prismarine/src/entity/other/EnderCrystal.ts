import { Entity } from '../Entity';

export default class EnderCrystal extends Entity {
    public static MOB_ID = 'minecraft:ender_crystal';

    public override getType(): string {
        return EnderCrystal.MOB_ID;
    }
}
