import SkinPersonaPiece from './SkinPersonaPiece';
import SkinPersonaPieceTintColor from './SkinPersonaPieceTintColor';

export default class SkinPersona {
    pieces: Set<SkinPersonaPiece> = new Set();
    tintColors: Set<SkinPersonaPieceTintColor> = new Set();
}
