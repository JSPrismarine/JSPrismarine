import CommandNode from "../tree/CommandNode"

export default class SuggestionContext<S> {
    
    public parent: CommandNode<S>;    
    public startPos: number;
    
    public constructor (parent: CommandNode<S>, startPos: number) {
        this.parent = parent;
        this.startPos = startPos;
    }
}
