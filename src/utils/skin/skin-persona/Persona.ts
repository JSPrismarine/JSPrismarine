import type SkinPersonaPiece from './PersonaPiece';
import type PieceTintColor from './PieceTintColor';

class Persona {
    public pieces: Set<SkinPersonaPiece> = new Set();
    public tintColors: Set<PieceTintColor> = new Set();
}

export default Persona;   
