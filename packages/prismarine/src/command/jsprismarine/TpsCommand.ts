import { CommandDispatcher, literal } from '@jsprismarine/brigadier';

import Command from '../Command';
import Player from '../../Player';

export default class TpsCommand extends Command {
    public constructor() {
        super({
            id: 'jsprismarine:tps',
            description: 'Get current TPS.',
            permission: 'jsprismarine.command.tps'
        });
    }

    private formatTPS(tps: number): string {
        let color = '§4';
        if (tps >= 19) color = '§2';
        else if (tps >= 15) color = '§e';
        else color = '§4';

        return `${color}${tps}§r`;
    }

    public async register(dispatcher: CommandDispatcher<any>) {
        dispatcher.register(
            literal('tps').executes(async (context) => {
                const source = context.getSource() as Player;
                const tps = source.getServer().getTPS();
                const history = source.getServer().getAverageTPS();

                await source.sendMessage(
                    `TPS from last 0m, 1m, 5m, 10m: ${this.formatTPS(tps)}, ${this.formatTPS(
                        history.one
                    )}, ${this.formatTPS(history.five)}, ${this.formatTPS(history.ten)}`
                );
            })
        );
    }
}
