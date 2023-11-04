const express = require('express')
const app = express()
const httpServer = require('http').createServer(app)
const socketEvents = require('./sockets')
const cors = require('cors')
const bodyParser = require('body-parser')
const cookieParser = require( 'cookie-parser' )
const db = require("./models")
const config = require('./config')
const { checkTransactionStatus } = require('./services')




//const encrypt = require('socket.io-encrypt')
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
const Subscriptions = db.subscriptions
const Badges = db.badges
const GuildUserProfiles = db.guildUserProfiles
const Guild = db.guild

db.mongoose.set('strictQuery', false)

db.mongoose
    .connect(config.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    })
    .then(async () => {
        console.log("Successfully connected to MongoDB.")
        try {

            /*const vipBadge = await Badges.create({
                icon: 'VIP-badge',
                id: 'VIP',
                description: 'VIP Subscription'
            })

            console.log(vipBadge)

            const subscription = await Subscriptions.create({
                currency: 'US',
                currencyTag: '$',
                price: 50,
                tier: 4,
                tag: 'VIP',
                plans: [
                    {
                        title: 'Monthly',
                        monthlySub: true,
                        price: 50
                    }
                ]
            })

            console.log(subscription)*/

            /*const allGrpChannels = await Channel.find({isGroup: true})
            for( const channel of allGrpChannels ) {
                await Channel.findByIdAndRemove(channel._id)
                console.log(channel._id, 'removed')
            }*/
            /*const allUsers = await User.find({}).select('uid username')
            for( const user of allUsers ) {

                user.avatar = "649a999736227fc390010d0c"
                await user.save()
                
                user.uid = 0
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
                }
            }*/

            /*const allGuilds = await Guild.find({})
            for( const _guild of allGuilds ) {
                for( const _user of allUsers ) {
                    console.log('user:', _user.username, '_ guild:', _guild.name)
                    const foundProfile = await GuildUserProfiles.exists({ user: _user._id, guild: _guild._id })
                    if( !foundProfile ) await GuildUserProfiles.create({ user: _user._id, guild: _guild._id })
                }
            }*/

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
//const invitesRoute = require('./routes/invites.route')
const storeRoute = require('./routes/store.route')
const adminRoute = require('./routes/admin.route')

app.use( '/avatar', avatarRoute )
app.use( '/users', usersRoute )
app.use( '/guilds', guildsRoute )
app.use( '/channels', channelsRoute )
app.use( '/auth', authRoute )
//app.use( '/invites', invitesRoute )
app.use( '/store', storeRoute )
app.use( '/admin', adminRoute )


io.on('connection', socketEvents(io))

//eth transactions checker
setInterval(checkTransactionStatus, 5000, io)

httpServer.listen( config.PORT, () => {
    console.log(`Listening on port ${config.PORT}`)
})



//mongodb+srv://logicielxy:clzNBMLQuowkruXA@discord.naovb9x.mongodb.net/?retryWrites=true&w=majority