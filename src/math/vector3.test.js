const Vector3 = require('./vector3')

describe('math', () => {
    describe('vector3', () => {
        const vector = new Vector3(1.5, 0, 2.75)
        
        it('should retrieve values correctly', () => {
            expect(vector.getX() === 1.5)
            expect(vector.getY() === 0)
            expect(vector.getZ() === 2.75)
        })
    })
})
