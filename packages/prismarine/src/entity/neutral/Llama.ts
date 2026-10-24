import { Entity } from '../Entity';

export default class Llama extends Entity {
    public static MOB_ID = 'minecraft:llama';

    public override getType(): string {
        return Llama.MOB_ID;
    }
}
