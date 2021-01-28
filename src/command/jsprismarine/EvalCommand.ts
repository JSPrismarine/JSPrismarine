import Command from '../Command';
import type CommandExecuter from '../CommandExecuter';
import TextArgument from '../argument/TextArgument';

export default class EvalCommand extends Command {
    public constructor() {
        super({
            id: 'jsprismarine:eval',
            description: 'Execute javascript code.',
            permission: 'jsprismarine.command.eval'
        });
        this.arguments.add(0, new TextArgument('code', true));
        this.api = 'rfc';
    }

    public async dispatch(sender: CommandExecuter, args: any[]) {
        let evaled = eval(args[0]);
        let c =
            typeof evaled !== 'string'
                ? (evaled = require('util').inspect(evaled, { depth: 0 }))
                : evaled;
        await sender.sendMessage(`Result: §e${c}`);
    }

    public async fallback(sender: CommandExecuter, _args: any[], error: Error) {
        await sender.sendMessage(
            `§cError when executing script!\n"${error.name}":\n${error.stack || '- No stack'
            }\n\n${error.message}`
        );
    }
}
