import { Entity } from '../Entity';

export default class NPC extends Entity {
    public static MOB_ID = 'minecraft:npc';

    public override getType(): string {
        return NPC.MOB_ID;
    }
}
