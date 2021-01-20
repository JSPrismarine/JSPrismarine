import Command from '../Command';
import StringArgument from '../argument/StringArgument';
import type CommandExecuter from '../CommandExecuter';

export default class EvalCommand extends Command {
    public constructor() {
        super({id: 'jsprismarine:eval', description: 'Execute javascript code.', permission: 'jsprismarine.command.eval'});
        this.arguments.add(0, new StringArgument(true));
        this.api = "rfc";
    }

    public async dispatch(sender: CommandExecuter, args: any[]) {
        await sender.sendMessage(`Result: §e${
            eval(args[0])
        }`);
    }
}
