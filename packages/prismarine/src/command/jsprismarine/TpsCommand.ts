import type { CommandDispatcher } from '@jsprismarine/brigadier';
import { literal } from '@jsprismarine/brigadier';

import Command from '../Command';
import type Player from '../../Player';

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

        return `${color}${tps}§r`;
    }

    public async register(dispatcher: CommandDispatcher<any>) {
        dispatcher.register(
            literal('tps').executes(async (context) => {
                const source = context.getSource() as Player;
                const tps = source.getServer().getTPS();

                await source.sendMessage(`TPS: ${this.formatTPS(tps)}`);
            })
        );
    }
}
