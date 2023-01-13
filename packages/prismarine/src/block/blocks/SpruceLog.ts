import Log, { LogType } from './OakLog.js';
export default class SpruceLog extends Log {
    public constructor() {
        super('minecraft:spruce_log', LogType.Spruce);
    }
}
