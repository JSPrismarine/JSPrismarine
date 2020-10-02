require("@babel/register")(
    {
        extensions: ['.js', '.ts']
    }
)
require('./src/server')
