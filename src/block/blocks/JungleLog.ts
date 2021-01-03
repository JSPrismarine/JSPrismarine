import Log, { LogType } from './OakLog';
export default class JungleLog extends Log {
    constructor() {
        super('minecraft:jungle_log', LogType.Jungle);
    }
}
