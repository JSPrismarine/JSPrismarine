import { CommandDispatcher, argument, greedyString, literal } from '@jsprismarine/brigadier';

import Command from '../Command';

export default class EvalCommand extends Command {
    public constructor() {
        super({
            id: 'jsprismarine:eval',
            description: 'Execute javascript code.',
            permission: 'jsprismarine.command.eval'
        });
    }

    public async register(dispatcher: CommandDispatcher<any>) {
        dispatcher.register(
            literal('eval').then(
                argument('script', greedyString()).executes(async (context) => {
                    const script = context.getArgument('script') as string;

                    return Object.getPrototypeOf(async () => {}).constructor(script)();
                })
            )
        );
    }
}
