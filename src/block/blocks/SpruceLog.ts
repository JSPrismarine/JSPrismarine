import Log, { LogType } from './OakLog';
export default class SpruceLog extends Log {
    constructor() {
        super('minecraft:spruce_log', LogType.Spruce);
    }
}
