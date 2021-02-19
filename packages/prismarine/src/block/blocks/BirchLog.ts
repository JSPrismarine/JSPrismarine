import Log, { LogType } from './OakLog';
export default class BirchLog extends Log {
    public constructor() {
        super('minecraft:birch_log', LogType.Birch);
    }
}
