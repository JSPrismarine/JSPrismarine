import Tag from './internal/Tag';
import TagType from './internal/TagType';

export default class EndTag extends Tag {
    type = TagType.End;

    constructor() {
        super(null, '');
    }
};
