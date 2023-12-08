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


const ansiColors = global.ansiColors = {
    Reset: "\x1b[0m",
    Bright: "\x1b[1m",
    Dim: "\x1b[2m",
    Underscore: "\x1b[4m",
    Blink: "\x1b[5m",
    Reverse: "\x1b[7m",
    Hidden: "\x1b[8m",
    FgBlack: "\x1b[30m",
    FgRed: "\x1b[31m",
    FgGreen: "\x1b[32m",
    FgYellow: "\x1b[33m",
    FgBlue: "\x1b[34m",
    FgMagenta: "\x1b[35m",
    FgCyan: "\x1b[36m",
    FgWhite: "\x1b[37m",
    FgGray: "\x1b[90m",
    BgBlack: "\x1b[40m",
    BgRed: "\x1b[41m",
    BgGreen: "\x1b[42m",
    BgYellow: "\x1b[43m",
    BgBlue: "\x1b[44m",
    BgMagenta: "\x1b[45m",
    BgCyan: "\x1b[46m",
    BgWhite: "\x1b[47m",
    BgGray: "\x1b[100m",
    LineSymbol: "⁕"
}

//const encrypt = require('socket.io-encrypt')
const encryptionOpts = {
    secret: config.SOCKET_SECRET,
    algorithm: config.SOCKET_ALGORITHM
}




const User = db.user
const Subscriptions = db.subscriptions
const Badges = db.badges
const GuildUserProfiles = db.guildUserProfiles
const Guild = db.guild
const Role = db.role

db.mongoose.set('strictQuery', false)

db.mongoose
    .connect(config.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    })
    .then(async () => {
        console.log(`${ansiColors.FgRed}${ansiColors.LineSymbol}${ansiColors.FgGreen}${ansiColors.Bright} Successfully connected to MongoDB.${ansiColors.Reset}`)

        await User.updateMany({}, { status: 'offline', 'customStatus.status': null })
        console.log(`${ansiColors.FgRed}${ansiColors.LineSymbol}${ansiColors.FgGreen}${ansiColors.Bright} All User statuses set to offline.${ansiColors.Reset}`)

        initServer()

        try {
            /*function encodeColor(rgbOrHex) {
                if (typeof rgbOrHex === 'string') {
                    if (rgbOrHex[0] === '#') {
                        rgbOrHex = hexToRgb(rgbOrHex)
                    } else {
                        rgbOrHex = parseRgbString(rgbOrHex)
                    }
                  
                    return (rgbOrHex.r << 16) + (rgbOrHex.g << 8) + rgbOrHex.b
                }
                
                return rgbOrHex
            }
            
            function decodeColor(encodedColor) {
                const r = (encodedColor >> 16) & 0xFF
                const g = (encodedColor >> 8) & 0xFF
                const b = encodedColor & 0xFF
                
                return `rgb(${r}, ${g}, ${b})`
            }
            
            function hexToRgb(hex, isString) {
                hex = hex.replace(/^#/, '')
            
                const bigint = parseInt(hex, 16)
            
                const r = (bigint >> 16) & 255
                const g = (bigint >> 8) & 255
                const b = bigint & 255
              
                if(isString) return `rgb(${r}, ${g}, ${b})`
                return { r, g, b }
            }
              
            function parseRgbString(rgbString) {
                const match = rgbString.match(/(\d+),\s*(\d+),\s*(\d+)/)
                if (match) {
                    return { r: parseInt(match[1]), g: parseInt(match[2]), b: parseInt(match[3]) }
                } else {
                    throw new Error('Invalid RGB string format')
                }
            }

            const allRoles = await Role.find({})
            for( const role of allRoles ) {
                const encoededColor = encodeColor(role.color)
                await Role.findOneAndUpdate({_id: role._id}, {color: encoededColor})
                console.log(role._id, 'encoded:', encoededColor)
            }*/

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

        } catch (err) {
            console.error('Error setting User status to offline:', err)
        }
    })
    .catch((error) => {
        console.log(`${ansiColors.FgRed}${ansiColors.LineSymbol}${ansiColors.Bright} Error connecting to MongoDB: ${error.message}${ansiColors.Reset}`)
    })


process.on('SIGINT', () => {
    db.mongoose.connection.close(() => {
        console.log(`${ansiColors.FgRed}${ansiColors.LineSymbol}${ansiColors.Bright} EMongoDB connection closed due to application termination.${ansiColors.Reset}`)
        process.exit(0)
    })
})



const initServer = () => {
    console.log(`${ansiColors.FgRed}${ansiColors.LineSymbol}${ansiColors.FgGreen}${ansiColors.Bright} Initializing servers.${ansiColors.Reset}`)
    
    const io = require('socket.io')(httpServer, {
        cors: {
            origin: [config.CLIENT_URL, "http://localhost:3000"],
            methods: ["GET", "POST"]
        }
    })
    //io.use(encrypt(encryptionOpts))

    io.on('connection', socketEvents(io))
    
    const corsOptions = {
        "origin": [config.CLIENT_URL, "http://localhost:3000"],
        "methods": ['POST', 'PATCH', 'PUT', 'GET', 'OPTIONS', 'HEAD', 'DELETE'],
        "credentials": true,
        "preflightContinue": false,
        "optionsSuccessStatus": 204,
        "exposedHeaders": ["set-cookie"]
    }

    app.use((req, res, next) => {
        if(db.mongoose.connection.readyState !== 1) return res.status(500).json({ message: 'Database connection error' })
        next()
    })

    app.use((req, res, next) => {
        req.io = io
        next()
    })
    
    //app.set( 'trust proxy', false )
    app.use( bodyParser.urlencoded({ extended: true }) )
    app.use( bodyParser.json() )
    app.use( cookieParser() )
    app.use( express.json() )
    app.use( cors(corsOptions) )
    app.use( express.static( __dirname + '/public' ) )


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

    //eth transactions checker
    setInterval(checkTransactionStatus, 5000, io)

    httpServer.listen( config.PORT, () => {
        console.log(`${ansiColors.FgRed}${ansiColors.LineSymbol}${ansiColors.FgGreen}${ansiColors.Bright} Listening on port ${config.PORT}.${ansiColors.Reset}`)
    })
}








//mongodb+srv://logicielxy:clzNBMLQuowkruXA@discord.naovb9x.mongodb.net/?retryWrites=true&w=majority