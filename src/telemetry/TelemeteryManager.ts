import fetch, { Headers } from 'node-fetch';
import { machineIdSync } from 'node-machine-id';
import Prismarine from "../prismarine";

export default class TelemetryManager {
    private server: Prismarine;
    constructor(server: Prismarine) {
        this.server = server;
        const { enabled, urls } = server.getConfig().getTelemetry();
        const id = this.generateAnonomizedId();

        if (!enabled)
            return;

        process.on('uncaughtException', async (err) => {
            await this.sendCrashLog(err, urls);

            process.exit(1);
        });

        server.getLogger().info('Thank you for helping us improve JSPrismarine by enabling anonymized telemetry data.');
        server.getLogger().info('To find out exactly what we\'re collecting please visit the following url(s):');
        urls.forEach(url => server.getLogger().info(`- ${url}/id/${id}`));

        setInterval(async () => {
            this.server.getLogger().error(`Something went terrible wrong`);

            const body = {
                id,
                version: `${server.getConfig().getVersion()}:unknown`, // TODO
                online_mode: true, // TODO,
                player_count: server.getRaknet().name.getOnlinePlayerCount(),
                max_player_count: server.getConfig().getMaxPlayers(),
                plugins: [], //  TODO
                tps: 20, // TODO
                uptime: process.uptime(),
                node_env: process.env.NODE_ENV
            };

            urls.forEach(url => fetch(`${url}/api/heartbeat`, {
                method: 'POST',
                body: JSON.stringify(body),
                headers: new Headers({
                    'Content-Type': 'application/json'
                })
            }))
        }, 5 * 60 * 1000);
    }

    public generateAnonomizedId(): string {
        return machineIdSync();
    }

    public async sendCrashLog(crashlog: Error, urls: Array<string>) {
        this.server.getLogger().error('JSPrismarine has crashed, we\'re now submitting the error to the telemetry service...');
        const body = {
            id: this.generateAnonomizedId(),
            error: {
                name: crashlog.name,
                message: crashlog.message,
                stack: crashlog.stack
            }
        };

        const links = (await Promise.all(urls.map(async url => {
            try {
                const res = await fetch(`${url}/api/error`, {
                    method: 'POST',
                    body: JSON.stringify(body),
                    headers: new Headers({
                        'Content-Type': 'application/json'
                    })
                });
                return `${url}/error/${(await res.json()).id}`;
            } catch {
                return null;
            }
        }))).filter(a => a);

        if (!links.length) {
            this.server.getLogger().error('Failed to submit error to telemetry backend');
            return;
        }

        this.server.getLogger().error('JSPrismarine has crashed, please report the following url(s) to the maintainers:');
        links.forEach(url => this.server.getLogger().error(`- ${url}`))
    }
};

