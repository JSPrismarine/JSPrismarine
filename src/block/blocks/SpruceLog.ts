import Log, { LogType } from './OakLog';
export default class SpruceLog extends Log {
    public constructor() {
        super('minecraft:spruce_log', LogType.Spruce);
    }
}
