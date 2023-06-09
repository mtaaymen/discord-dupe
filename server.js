const express = require('express')
const app = express()
const httpServer = require('http').createServer(app)
const socketEvents = require('./sockets')
const cors = require('cors')
const bodyParser = require('body-parser')
const cookieParser = require( 'cookie-parser' )
const db = require("./models")
const config = require('./config')

const encrypt = require('socket.io-encrypt')
const encryptionOpts = {
    secret: config.SOCKET_SECRET,
    algorithm: config.SOCKET_ALGORITHM
}

const io = require('socket.io')(httpServer, {
    cors: {
        origin: [config.CLIENT_URL, "http://localhost:3000"],
        methods: ["GET", "POST"]
    }
})
//io.use(encrypt(encryptionOpts))


const User = db.user

db.mongoose.set('strictQuery', false)

db.mongoose
    .connect(config.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    })
    .then(async () => {
        console.log("Successfully connected to MongoDB.")
        try {
            const allUsers = await User.find({}).select('uid username')
            for( const user of allUsers ) {

                /*user.avatar = "649a999736227fc390010d0c"
                await user.save()*/
                
                /*user.uid = 0
                await user.save()
                console.log( `set uid of ${user.username} to ${user.uid}` )

                if( !user.uid ) {
                    const userWithBiggestUid = await User.findOne().sort('-uid').select('uid username')
                    if( !userWithBiggestUid.uid ) {
                        userWithBiggestUid.uid = 1
                        await userWithBiggestUid.save()
                        console.log( `set uid of ${userWithBiggestUid.username} to ${userWithBiggestUid.uid}` )
                    }
                    if( user._id.toString() === userWithBiggestUid._id.toString() ) continue

                    user.uid = userWithBiggestUid.uid + 1
                    await user.save()
                    console.log( `set uid of ${user.username} to ${user.uid}` )
                }*/
            }

            await User.updateMany({}, { status: 'offline', 'customStatus.status': null })
            console.log('All User status set to offline')
        } catch (err) {
            console.error('Error setting User status to offline:', err)
        }
    })

const corsOptions = {
    "origin": [config.CLIENT_URL, "http://localhost:3000"],
    "methods": ['POST', 'PATCH', 'PUT', 'GET', 'OPTIONS', 'HEAD', 'DELETE'],
    "credentials": true,
    "preflightContinue": false,
    "optionsSuccessStatus": 204,
    "exposedHeaders": ["set-cookie"]
}


app.set( 'trust proxy', true )
app.use( bodyParser.urlencoded({ extended: true }) )
app.use( bodyParser.json() )
app.use( cookieParser() )
app.use( express.json() )
app.use( cors(corsOptions) )
app.use( express.static( __dirname + '/public' ) )
app.use((req, res, next) => {
    req.io = io
    next()
})


const avatarRoute = require( './routes/avatar.route' )
const usersRoute = require( './routes/users.route' )
const guildsRoute = require( './routes/guilds.route' )
const channelsRoute = require( './routes/channels.route' )
const authRoute = require('./routes/auth.route')
const invitesRoute = require('./routes/invites.route')

app.use( '/avatar', avatarRoute )
app.use( '/users', usersRoute )
app.use( '/guilds', guildsRoute )
app.use( '/channels', channelsRoute )
app.use( '/auth', authRoute )
app.use( '/invites', invitesRoute )


io.on('connection', socketEvents(io))

httpServer.listen( config.PORT, () => {
    console.log(`Listening on port ${config.PORT}`)
})



//mongodb+srv://logicielxy:clzNBMLQuowkruXA@discord.naovb9x.mongodb.net/?retryWrites=true&w=majority