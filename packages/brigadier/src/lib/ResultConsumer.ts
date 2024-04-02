import type CommandContext from './context/CommandContext';

export default interface ResultConsumer<S> {
    onCommandComplete(context: CommandContext<S>, success: boolean, result: any): void;
}
