import Log, { LogType } from './OakLog';
export default class DarkOakLog extends Log {
    public constructor() {
        super('minecraft:dark_oak_log', LogType.DarkOak);
    }
}
