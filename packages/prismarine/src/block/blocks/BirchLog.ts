import Log, { LogType } from './OakLog.js';
export default class BirchLog extends Log {
    public constructor() {
        super('minecraft:birch_log', LogType.Birch);
    }
}
