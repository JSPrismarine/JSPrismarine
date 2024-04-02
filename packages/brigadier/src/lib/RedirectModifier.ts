import type CommandContext from './context/CommandContext';

export default interface RedirectModifier<S> {
    apply(context: CommandContext<S>): S[];
}
