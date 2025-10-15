import type CommandContext from './context/CommandContext';

export default interface Command<S> {
    (context: CommandContext<S>): Promise<any>;
}
