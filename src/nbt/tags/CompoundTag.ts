import Tag from './internal/Tag';
import TagType from './internal/TagType';

export default class CompoundTag extends Tag {
    type: TagType = TagType.Compound;
}
