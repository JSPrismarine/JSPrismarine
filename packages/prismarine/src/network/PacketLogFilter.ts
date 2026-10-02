/**
 * Decides which packets are worth a line in the log.
 *
 * At `silly` level every packet in and out is written down, and a few of them are on a timer
 * rather than on anything happening: `SetTimePacket` alone goes to every player twenty times
 * a second. They bury whatever the log was opened to find, and there is no level that keeps
 * the interesting traffic while dropping them - they are all the same kind of message.
 *
 * So the filter is by name, from `log-excluded-packets` in the config.
 */
export class PacketLogFilter {
    private readonly excluded: ReadonlySet<string>;

    public constructor(excluded: Iterable<string> = []) {
        this.excluded = new Set(excluded);
    }

    /**
     * @param {object} packet - the packet about to be logged.
     * @returns {boolean} `false` if its name is excluded.
     */
    public shouldLog(packet: object): boolean {
        return !this.excluded.has(packet.constructor.name);
    }

    /** The names being dropped, for reporting the filter back to whoever set it. */
    public getExcluded(): string[] {
        return Array.from(this.excluded);
    }
}

export default PacketLogFilter;
