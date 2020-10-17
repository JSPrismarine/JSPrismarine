import fetch, { Headers } from 'node-fetch';
import { machineIdSync } from 'node-machine-id';
import Prismarine from "../prismarine";

export default class TelemetryManager {
    constructor(server: Prismarine) {
        const { enabled, urls } = server.getConfig().getTelemetry();
        const id = this.generateAnonomizedId();

        if (!enabled)
            return;

        server.getLogger().info('Thank you for helping us improve JSPrismarine by enabling anonymized telemetry data.')
        server.getLogger().info('To find out exactly what we\'re collecting please visit the following url(s):')
        urls.forEach(url => server.getLogger().info(`- ${url}/id/${id}`))

        setInterval(async () => {
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
};

