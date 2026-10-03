/**
 * A stream of measurements, kept in full so percentiles are exact.
 *
 * Every sample is retained rather than bucketed. A load run takes a bounded number of them -
 * one login latency per bot, not one per packet - and an approximate p99 from a histogram is
 * exactly the number somebody would later want to be sure about.
 */
export class Samples {
    private readonly values: number[] = [];

    public add(value: number): void {
        this.values.push(value);
    }

    public get count(): number {
        return this.values.length;
    }

    /**
     * The p-th percentile by nearest rank, or null with nothing to report.
     * @param p - between 0 and 1.
     */
    public percentile(p: number): number | null {
        if (this.values.length === 0) return null;

        const sorted = [...this.values].sort((a, b) => a - b);
        const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
        return sorted[rank]!;
    }

    public min(): number | null {
        return this.values.length === 0 ? null : Math.min(...this.values);
    }

    public max(): number | null {
        return this.values.length === 0 ? null : Math.max(...this.values);
    }

    public mean(): number | null {
        if (this.values.length === 0) return null;

        return this.values.reduce((total, value) => total + value, 0) / this.values.length;
    }

    public summary(): LatencySummary {
        return {
            count: this.count,
            min: this.min(),
            mean: this.mean(),
            p50: this.percentile(0.5),
            p95: this.percentile(0.95),
            p99: this.percentile(0.99),
            max: this.max()
        };
    }
}

export interface LatencySummary {
    count: number;
    min: number | null;
    mean: number | null;
    p50: number | null;
    p95: number | null;
    p99: number | null;
    max: number | null;
}

export interface FleetReport {
    /** Wall clock the run covered, in milliseconds. */
    durationMs: number;
    seed: number;
    requested: number;
    connected: number;
    failed: number;
    /** One entry per distinct failure, with how many bots hit it. */
    failures: Array<{ reason: string; count: number }>;
    /** From the first packet sent to standing in the world. */
    loginLatencyMs: LatencySummary;
    /** RakNet's smoothed estimate, sampled at the end of the run. */
    rttMs: LatencySummary;
    traffic: {
        bytesSent: number;
        bytesReceived: number;
        packetsSent: number;
        packetsReceived: number;
    };
    actions: Record<string, number>;
    /** Resident set size of this process, which is the harness and not the server. */
    rssBytes: number;
}

/** Renders a report as a block of aligned text, for a terminal rather than a file. */
export const formatReport = (report: FleetReport): string => {
    const ms = (value: number | null) => (value === null ? '-' : `${value.toFixed(1)} ms`);
    const bytes = (value: number) => `${(value / 1024 / 1024).toFixed(2)} MiB`;
    const rate = (value: number) => `${(value / (report.durationMs / 1000)).toFixed(1)}/s`;

    const lines = [
        `seed ${report.seed}   duration ${(report.durationMs / 1000).toFixed(1)}s`,
        `connected  ${report.connected}/${report.requested}${report.failed > 0 ? `   failed ${report.failed}` : ''}`,
        `login      p50 ${ms(report.loginLatencyMs.p50)}   p95 ${ms(report.loginLatencyMs.p95)}   p99 ${ms(
            report.loginLatencyMs.p99
        )}   max ${ms(report.loginLatencyMs.max)}`,
        `rtt        p50 ${ms(report.rttMs.p50)}   p95 ${ms(report.rttMs.p95)}   max ${ms(report.rttMs.max)}`,
        `sent       ${bytes(report.traffic.bytesSent)}   ${report.traffic.packetsSent} packets   ${rate(
            report.traffic.packetsSent
        )}`,
        `received   ${bytes(report.traffic.bytesReceived)}   ${report.traffic.packetsReceived} packets   ${rate(
            report.traffic.packetsReceived
        )}`,
        `harness    ${bytes(report.rssBytes)} rss`
    ];

    const actions = Object.entries(report.actions);
    if (actions.length > 0) {
        lines.push(`actions    ${actions.map(([name, count]) => `${name} ${count}`).join('   ')}`);
    }

    for (const failure of report.failures) {
        lines.push(`failure    ${failure.count}x ${failure.reason}`);
    }

    return lines.join('\n');
};
