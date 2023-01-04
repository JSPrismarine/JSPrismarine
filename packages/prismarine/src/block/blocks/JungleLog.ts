import Log, { LogType } from './OakLog.js';
export default class JungleLog extends Log {
    public constructor() {
        super('minecraft:jungle_log', LogType.Jungle);
    }
}
