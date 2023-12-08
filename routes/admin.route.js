const express = require('express')
const ObjectId = require('mongodb').ObjectId
const router = express.Router()
const fs = require('fs')
const path = require('path')
const multer = require('multer')
const sharp = require('sharp')
const bcrypt = require('bcrypt')

const { authJwt, checkAdmin } = require('../middlewares')
const config = require('../config')
const db = require("../models")
const { sendToAllUserIds, unsubscribeAllUsers } = require('../sockets/helpers')
const UserSubscriptions = require('../models/userSubscriptions.model')

const GuildUserProfiles = db.guildUserProfiles
const Badges = db.badges
const Guild = db.guild
const Channel = db.channel
const User = db.user
const Role = db.role
//const Invite = db.invite
const Message = db.message
const TransactionsQueue = db.transactionsQueue
const Subscriptions = db.subscriptions


const guildTypes = {
    1: {
        name: 'Type 1',
        channels: [
            { name: 'text channels', position: 1, type: 'category' },
            { name: 'general', position: 2, type: 'text' },
            { name: 'test', position: 3, type: 'text' },
        ],
        roles: [
            { name: 'admin', color: 1752220, permissions: 70886355229761 },
            { name: 'moderator', color: 15277667, permissions: 70886355229761 },
            { name: 'member', color: 3447003, permissions: 70886355229761 },
        ],
    },
    2: {
        name: 'Type 2',
        channels: [
            { name: 'text channels', position: 1, type: 'category' },
            { name: 'global', position: 2, type: 'text' },
            { name: 'gta', position: 3, type: 'text' },
            { name: 'cs go', position: 4, type: 'text' },
            { name: 'valorant', position: 5, type: 'text' },
        ],
        roles: [
            { name: 'owner', color: 15105570, permissions: 70886355229761 },
            { name: 'admin', color: 1752220, permissions: 70886355229761 },
            { name: 'member', color: 3447003, permissions: 70886355229761 }
        ],
    },
    // add more types as needed
}

const paymentTypes = [
    {
        name: "Ethereum",
        symbol: "ETH",
        isCrypto: true
    }
]

const currencies = [
    {
        tag: "USD",
        symbol: "$"
    }
]

// get overview data
router.get('/overview', authJwt, checkAdmin, async (req, res) => {
    try {
        const overviewData = {}

        overviewData.users = await User.find({status: { $nin: ['offline', 'away'] }}).select('avatar username')
        overviewData.USERS_COUNT = await User.countDocuments({})
        overviewData.TXS_COUNT = await TransactionsQueue.countDocuments({})
        overviewData.SERVERS_COUNT = await Guild.countDocuments({})
        overviewData.SUBS_COUNT = await Subscriptions.countDocuments({})

        const UserPoints = await User.aggregate([
            {
                $sort: { createdAt: -1 }
            }, {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' },
                        day: { $dayOfMonth: '$createdAt' }
                    },
                    y: { $sum: 1 } // Count the documents in each group
                }
            }, {
                $project: {
                    _id: 0,
                    x: {
                        $dateFromParts: {
                            year: '$_id.year',
                            month: '$_id.month',
                            day: '$_id.day',
                        }
                    },
                    y: 1
                }
            }, {
                $sort: { day: 1 }
            }
        ])

        overviewData.UserPoints = UserPoints

        const TxsPoints = await TransactionsQueue.aggregate([
            {
                $match: { status: 'confirmed' }
            }, {
                $sort: { createdAt: -1 }
            }, {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' },
                        day: { $dayOfMonth: '$createdAt' }
                    },
                    y: { $sum: 1 } // Count the documents in each group
                }
            }, {
                $project: {
                    _id: 0,
                    x: {
                        $dateFromParts: {
                            year: '$_id.year',
                            month: '$_id.month',
                            day: '$_id.day',
                        }
                    },
                    y: 1
                }
            }, {
                $sort: { day: 1 }
            }
        ])

        overviewData.TxsPoints = TxsPoints

  
        res.status(200).send(overviewData)
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

// create guild
router.post( '/servers', authJwt, checkAdmin, async (req, res) => {
    try {
        let { name, type, icon } = req.body

        const iconExists = fs.existsSync(`./public/server-icons/${icon}.svg`)
        if(!iconExists) return res.status(400).json({ message: 'Icon not found' })

        const userId = req.user._id.toString()
        const user = await User.findById(userId)

        if( !String(name).trim().length ) name = `${user.username}'s server`
    
        // determine server type
        let serverType = type
        if (!serverType || !guildTypes[serverType]) {
            serverType = Object.keys(guildTypes)[0]
        }

        // create new server
        const server = await Guild.create({
            name,
            owner: userId,
            icon
        })

        // create member doc for all users
        /*const ownerGuildMember = await GuildUserProfiles.create( {
            guild: server._id,
            user: userId
        } )*/

        const allUserIds = await User.find({}, '_id')
        const userProfileDocs = allUserIds.map(_userId => ({ guild: server._id, user: _userId }))
        await GuildUserProfiles.insertMany(userProfileDocs)

        // create everyone role
        const everyone_role = await Role.create({
            name: "@everyone",
            color: 10070709,
            members: [userId],
            server: server._id,
            permissions: 70886355229761
        })
    
        // initialize channels and roles based on server type
        const { channels, roles } = guildTypes[serverType]
        const channelPromises = channels.map(({ name, position, type }) =>
            Channel.create({
                name,
                position,
                type,
                server: server._id,
                permissions : {
                    roles: {
                        allow: 70508330735680,
                        deny: 0,
                        id: everyone_role._id
                    }
                } 
            })
            
        )
        const channelsDocs = await Promise.all(channelPromises)


        let currentParent = null
        for( const channelDoc of channelsDocs ) {
            if( channelDoc.type === 'category' ) currentParent = channelDoc._id
            if( channelDoc.type === 'text' && currentParent !== null ) {
                channelDoc.parent = currentParent
                await channelDoc.save()
            }

        }
        const channelIds = channelsDocs.map((channel) => channel._id)
    
        const rolePromises = roles.map(({ name, permissions, color }) =>
            Role.create({ name, color, permissions, server: server._id })
        )
        const rolesDocs = await Promise.all(rolePromises)
        const roleIds = rolesDocs.map((role) => role._id)


        /*let inviteCode
        while (!inviteCode) {
            const tempInviteCode = Math.random().toString(36).substr(2, 8)
            const doc = await Invite.findOne({ 'invites.code': tempInviteCode })
            if (!doc) inviteCode = tempInviteCode
        }

        const invite = await Invite.create({ code: inviteCode, isPermanent: true, inviter: userId, guild: server._id, channel: channelIds[0] })
    
        // save channel and role IDs in server document
        server.invites = [invite._id]*/
        server.channels = channelIds
        server.roles = roleIds
        server.everyone_role = everyone_role._id
        await server.save()

        //user.guilds.addToSet(server._id)
        //await user.save()
    
        res.status(201).send( {success: true} )
    } catch (error) {
        console.error(error)
        res.status(500).send({ error: 'Server error' })
    }
} )

// update admin guild
router.patch('/servers/:guildId', authJwt, checkAdmin, async (req, res) => {
    try {

        const guildId = req.params.guildId
        if (!db.mongoose.Types.ObjectId.isValid(guildId)) return res.status(400).json({ message: 'Invalid guild id' })

        const guild = await Guild.findById(guildId)
        if( !guild ) return res.status(404).send({ message: 'Guild not found'})
    

        let updatedFields = {}

        if( req?.body?.name && req?.body?.name?.length >= 2 || req?.body?.name?.length <= 100 ) {
            await Guild.updateOne({_id: guildId}, { name: req.body.name })
            updatedFields.name = req.body.name
        }

        if( req?.body?.icon ) {
            const iconExists = fs.existsSync(`./public/server-icons/${req.body.icon}.svg`)
            if(iconExists) {
                await Guild.updateOne({_id: guildId}, { icon: req.body.icon })
                updatedFields.icon = req.body.icon
            }
        }



        if( Object.keys(updatedFields).length ) {
            req.io.to(`guild:${guildId}`).emit('GUILD_UPDATE', {updates: updatedFields, guildId})
            return res.status(200).send(updatedFields)
        }

        res.status(400).end()

    } catch (error) {
        console.error(error)
        res.status(500).send({ message: 'Internal server error' })
    }
})

// delete admin guild
router.delete('/servers/:guildId', authJwt, checkAdmin, async (req, res) => {
    try {
        const guildId = req.params.guildId
        if (!db.mongoose.Types.ObjectId.isValid(guildId)) return res.status(400).json({ message: 'Invalid guild id' })
    
        // delete channels and roles related to the server
        await Channel.deleteMany({ server: guildId })
        await Role.deleteMany({ server: guildId })
        //await Invite.deleteMany({ server: guildId })
        await Message.deleteMany({ server: guildId })
        await GuildUserProfiles.deleteMany({ guild: guildId })
    
        // delete server
        const server = await Guild.findByIdAndDelete(guildId)
    

        req.io.to(`guild:${server._id}`).emit('GUILD_DELETE', { guild: server._id })
        sendToAllUserIds( req.io, [req.user._id.toString()], 'GUILD_DELETE', { guild: server._id } )
        unsubscribeAllUsers( req.io, 'guild', server._id.toString() )

        res.status(200).send({
            message: `Server "${server.name}" was deleted successfully`,
            guild: server._id
        })
    } catch (error) {
        console.error(error)
        res.status(500).send({ message: 'Internal server error' })
    }
})

// get all servers
router.get('/servers', authJwt, checkAdmin, async (req, res) => {
    try {
        const { 
            with_roles,
            with_members,
            with_channels,
            //with_invites,
            with_owner
        } = req.query

        const projection = {
            _id: 1,
            icon: 1,
            name: 1,
        }
        
        if (with_roles === 'true') projection.roles = 1
        //if (with_invites === 'true') projection.invites = 1
        if (with_members === 'true') projection.members = 1
        if (with_channels === 'true') projection.channels = 1
        if (with_owner === 'true') projection.owner = 1

        const guilds = await Guild.find({}, projection)
  
        const newGuildArr = []

        for( const guild of guilds ) {
            const newGuild = {
                ...guild.toObject(),
                channels_count: guild.channels?.length, 
            }

            const members_count = await GuildUserProfiles.countDocuments({ guild: guild._id })
            newGuild.members_count = members_count
            
            newGuild.icon_data = (() => {
                const iconExists = fs.existsSync(`./public/server-icons/${guild.icon}.svg`)
                if( iconExists ) {
                    const filePath = `./public/server-icons/${guild.icon}.svg`
                    const fileData = fs.readFileSync(filePath, 'utf8')
                    return fileData
                } else return null
            })()

            newGuildArr.push(newGuild)
        }

  
        res.status(200).send(newGuildArr)
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})



// get server with id
router.get('/servers/:serverId', authJwt, checkAdmin, async (req, res) => {
    try {
        const { 
            with_roles,
            with_members,
            with_channels,
            //with_invites,
            with_icon_data
        } = req.query

        const serverId = req.params.serverId
        if (!db.mongoose.Types.ObjectId.isValid(serverId)) return res.status(400).json({ message: 'Invalid server id' })

        const projection = {
            _id: 1,
            icon: 1,
            name: 1,
            owner: 1,
        };
        
        if (with_roles === 'true') projection.roles = 1
        //if (with_invites === 'true') projection.invites = 1
        if (with_members === 'true') projection.members = 1
        if (with_channels === 'true') projection.channels = 1

        const guild = await Guild.findById(serverId, projection)

        if (with_icon_data) {
            guild.icon_data = (() => {
                const iconExists = fs.existsSync(`./public/server-icons/${guild.icon}.svg`)
                if( iconExists ) {
                    const filePath = `./public/server-icons/${guild.icon}.svg`
                    const fileData = fs.readFileSync(filePath, 'utf8')
                    return fileData
                } else return null
            })()
        }

        if (!guild) return res.status(400).json({ message: 'Server not found' })
  
        res.status(200).send(guild.toObject())
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})


// get server members
router.get('/servers/:serverId/members', authJwt, checkAdmin, async (req, res) => {
    try {
        const serverId = req.params.serverId
        if (!db.mongoose.Types.ObjectId.isValid(serverId)) return res.status(400).json({ message: 'Invalid server id' })

        const guildMembers = await GuildUserProfiles.find( { guild: serverId, present: true } )
            .populate('user', 'username avatar')
            .exec()

        const guildMembersWithRoles = []
        for(const member of guildMembers) {
            const memberRoles = await Role.find({server: serverId, members: member._id})

            guildMembersWithRoles.push({
                ...member.toObject(),
                roles: memberRoles
            })
        }

  
        res.status(200).send(guildMembersWithRoles)
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

// get server channels
router.get('/servers/:serverId/channels', authJwt, checkAdmin, async (req, res) => {
    try {
        const serverId = req.params.serverId
        if (!db.mongoose.Types.ObjectId.isValid(serverId)) return res.status(400).json({ message: 'Invalid server id' })

        const guild = await Guild.findById( serverId )
            .select('channels')
            .populate('channels')
            .exec()

        if(!guild) return res.status(400).json({ message: 'Guild not found.' })
  
        res.status(200).send(guild.toObject().channels)
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

// get server roles
router.get('/servers/:serverId/roles', authJwt, checkAdmin, async (req, res) => {
    try {
        const serverId = req.params.serverId
        if (!db.mongoose.Types.ObjectId.isValid(serverId)) return res.status(400).json({ message: 'Invalid server id' })

        const guild = await Guild.findById( serverId )
            .select('roles')
            .populate('roles')
            .exec()

        if(!guild) return res.status(400).json({ message: 'Guild not found.' })
  
        res.status(200).send(guild.toObject().roles)
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

// get all server icons
router.get('/server-icons', authJwt, checkAdmin, async (req, res) => {
    try {
        const svgFiles = []
        const files = fs.readdirSync('./public/server-icons')
        const svgFileNames = files.filter((file) => path.extname(file).toLowerCase() === '.svg')

        svgFileNames.forEach((fileName) => {
            const filePath = path.join('./public/server-icons', fileName)
            const nameWithoutExtension = path.basename(fileName, path.extname(fileName))
            const fileData = fs.readFileSync(filePath, 'utf8')
            svgFiles.push({ name: nameWithoutExtension, data: fileData })
        })

        res.status(200).send(svgFiles)
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
}) 


// get currencies list
router.get('/currencies', authJwt, checkAdmin, async (req, res) => {
    try {
        res.status(200).send(currencies)
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

// get badges list
router.get('/badges', authJwt, checkAdmin, async (req, res) => {
    try {
        const badges = await Badges.find( {} )
  
        res.status(200).send(badges)
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

// get transactions list
router.get('/transactions', authJwt, checkAdmin, async (req, res) => {
    try {
        const transactions = await TransactionsQueue.find( {} )
            .populate('user', 'username avatar')
            .populate('subscriptionId', 'tag plans')
            .exec()

  
        res.status(200).send(transactions)
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

// get subscriptions list
router.get('/subscriptions', authJwt, checkAdmin, async ( req, res ) => {
    try {
        const subscriptionsList = await Subscriptions.find({})
            .populate('badge')

        res.status( 200 ).send(subscriptionsList)
    } catch (error) {
        console.error(error)
        return res.status(500).json({ message: 'Internal server error' })
    }
} )


// create subscription
router.post('/subscriptions', authJwt, checkAdmin, async (req, res) => {
    try {
        const { badge, tag, price, currency, tier } = req.body
        const currencyObj = currencies.find(c => c.tag === currency)
        if(!currencyObj) return res.status(400).json({ message: 'Invalid currency' })

        if( !String(tag).trim().length ) return res.status(400).json({ message: 'Tag unavailable' })

        if(!/^\d+(\.\d{1,2})?$/.test(price)) return res.status(400).json({ message: 'Price has to be a numeric value' })

        if(![1,2,3,4].includes(Number(tier))) return res.status(400).json({ message: 'Tier not found' })

        if (!db.mongoose.Types.ObjectId.isValid(badge)) return res.status(400).json({ message: 'Invalid badge id' })

        const badgeExists = await Badges.exists( {_id: badge} )
        if(!badgeExists) return res.status(400).json({ message: 'Badge does not exist' })

        const newSubscription = await Subscriptions.create({
            badge,
            tag: tag.trim(),
            price: price,
            currency: currencyObj.tag,
            currencyTag: currencyObj.symbol,
            tier,
            plans: [
                {
                    title: 'Default',
                    monthlySub: true,
                    price: price,
                    perks: 7
                }
            ]
        })

        res.status( 200 ).send(newSubscription)
    } catch (error) {
        console.error(error)
        return res.status(500).json({ message: 'Internal server error' })
    }
})

// delete subscription
router.delete('/subscriptions/:subscriptionId', authJwt, checkAdmin, async (req, res) => {
    try {
        const subscriptionId = req.params.subscriptionId
        if (!db.mongoose.Types.ObjectId.isValid(subscriptionId)) return res.status(400).json({ message: 'Invalid subscription id' })

        const subscription = await Subscriptions.exists({_id: subscriptionId})
        if(!subscription) return res.status(400).json({ message: 'Invalid subscription' })

        const subscribers = await UserSubscriptions.countDocuments({subscription: subscriptionId})
        if(!!subscribers) return res.status(400).json({ message: 'Users are already subscribed to this subscription' })

        await TransactionsQueue.updateMany({subscriptionId: subscriptionId, status: 'pending'}, {status: 'Deleted Sub'})
        await Subscriptions.findByIdAndDelete(subscriptionId)

        res.status( 200 ).send({success: true})
    } catch (error) {
        console.error(error)
        return res.status(500).json({ message: 'Internal server error' })
    }
})

// block subscription
router.patch('/subscriptions/:subscriptionId/disable', authJwt, checkAdmin, async (req, res) => {
    try {
        const subscriptionId = req.params.subscriptionId
        if (!db.mongoose.Types.ObjectId.isValid(subscriptionId)) return res.status(400).json({ message: 'Invalid subscription id' })

        const subscription = await Subscriptions.findById(subscriptionId)
        if(!subscription) return res.status(400).json({ message: 'Invalid subscription' })

        const newSub = await Subscriptions.findByIdAndUpdate(subscriptionId, {disabled: !subscription.disabled}, {new: true})

        res.status( 200 ).send({success: true, disabled: newSub.disabled})
    } catch (error) {
        console.error(error)
        return res.status(500).json({ message: 'Internal server error' })
    }
})

// create subscription plan
router.post('/subscriptions/plans', authJwt, checkAdmin, async (req, res) => {
    try {
        const {
            subscriptionId,
            subDuration,
            price,
            title,
            perks
        } = req.body

        const numberSubDuration = Number(subDuration)

        if( !String(title).trim().length ) return res.status(400).json({ message: 'Tag unavailable' })

        if(!/^\d+(\.\d{1,2})?$/.test(price)) return res.status(400).json({ message: 'Price has to be a numeric value' })

        if (!db.mongoose.Types.ObjectId.isValid(subscriptionId)) return res.status(400).json({ message: 'Invalid badge id' })

        if(!/^\d+$/.test(perks)) return res.status(400).json({ message: 'Invalid perks value' })

        if(![0, 1, 2].includes(numberSubDuration)) return res.status(400).json({ message: 'Invalid subscription duration' })

        const subscription = await Subscriptions.findById(subscriptionId)
        if(!subscription) return res.status(400).json({ message: 'Invalid subscription' })

        const newPlanObject = {
            title,
            price,
            perks
        }

        if( numberSubDuration === 0 ) newPlanObject.yearlySub = true
        else if ( numberSubDuration === 1 ) newPlanObject.monthlySub = true
        else if ( numberSubDuration === 2 ) newPlanObject.weeklySub = true

        subscription.plans.addToSet(newPlanObject)
        await subscription.save()

        res.status( 200 ).send(subscription)
    } catch (error) {
        console.error(error)
        return res.status(500).json({ message: 'Internal server error' })
    }
})

// delete subscription plan
router.delete('/subscriptions/:subscriptionId/plans/:planId', authJwt, checkAdmin, async (req, res) => {
    try {
        const planId = req.params.planId
        if (!db.mongoose.Types.ObjectId.isValid(planId)) return res.status(400).json({ message: 'Invalid plan id' })

        const subscriptionId = req.params.subscriptionId
        if (!db.mongoose.Types.ObjectId.isValid(subscriptionId)) return res.status(400).json({ message: 'Invalid subscription id' })

        const subscription = await Subscriptions.findById(subscriptionId)
        if(!subscription) return res.status(400).json({ message: 'Invalid subscription' })

        if( subscription.plans.length === 1 ) return res.status(400).json({ message: 'You can not remove all plans' })

        const planIndex = subscription.plans.findIndex(plan => plan._id.equals(planId))

        const subscribers = await UserSubscriptions.countDocuments({subscription: subscriptionId, plan: planIndex})
        if(!!subscribers) return res.status(400).json({ message: 'Users are already subscribed to this subscription' })

        await TransactionsQueue.updateMany({subscriptionId: subscriptionId, status: 'pending'}, {status: 'Deleted Plan'})

        subscription.plans = subscription.plans.filter( p => p._id.toString() !== planId )
        await subscription.save()

        res.status( 200 ).send({success: true, planId})
    } catch (error) {
        console.error(error)
        return res.status(500).json({ message: 'Internal server error' })
    }
})

// edit subscription
router.patch('/subscriptions/:subscriptionId', authJwt, checkAdmin, async (req, res) => {
    try {
        const subscriptionId = req.params.subscriptionId
        if (!db.mongoose.Types.ObjectId.isValid(subscriptionId)) return res.status(400).json({ message: 'Invalid subscription id' })

        const { badge, tag, currency, tier } = req.body
        const currencyObj = currencies.find(c => c.tag === currency)
        if(!currencyObj) return res.status(400).json({ message: 'Invalid currency' })

        if( !String(tag).trim().length ) return res.status(400).json({ message: 'Tag unavailable' })

        if(![1,2,3,4].includes(Number(tier))) return res.status(400).json({ message: 'Tier not found' })

        if (!db.mongoose.Types.ObjectId.isValid(badge)) return res.status(400).json({ message: 'Invalid badge id' })

        const badgeExists = await Badges.exists( {_id: badge} )
        if(!badgeExists) return res.status(400).json({ message: 'Badge does not exist' })

        const editedSubscription = await Subscriptions.findByIdAndUpdate(subscriptionId, {
            badge,
            tag: tag.trim(),
            currency: currencyObj.tag,
            currencyTag: currencyObj.symbol,
            tier,
        })

        res.status( 200 ).send(editedSubscription)
    } catch (error) {
        console.error(error)
        return res.status(500).json({ message: 'Internal server error' })
    }
})

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './public/badge-icons')
    },
    filename: function (req, file, cb) {
        cb(null, `${Date.now()}-${file.originalname}`)
    },
})
  
const upload = multer({ storage: storage })


// create subscription badge
router.post('/subscriptions/badges', authJwt, checkAdmin, upload.single('badge'), async (req, res) => {
    try {
        const { id, description } = req.body

        const { filename, path } = req.file

        if( !String(id).trim().length ) return res.status(400).json({ message: 'Id unavailable' })

        if( !String(description).trim().length ) return res.status(400).json({ message: 'Description unavailable' })

        const metadata = await sharp(path).metadata()
        const { width, height } = metadata
    
        if (width > 250 || height > 250) return res.status(400).send('Image dimensions exceed the 250x250 limit.')

        await Badges.create({
            icon: filename,
            id,
            description
        })

        res.status( 200 ).send({success: true})
    } catch (error) {
        console.error(error)
        return res.status(500).json({ message: 'Internal server error' })
    }
})

// remove subscription badge
router.delete('/subscriptions/badges/:badgeId', authJwt, checkAdmin, async (req, res) => {
    try {
        const badgeId = req.params.badgeId
        if (!db.mongoose.Types.ObjectId.isValid(badgeId)) return res.status(400).json({ message: 'Invalid badge id' })

        const badge = await Badges.findById(badgeId)
        if(!badge) return res.status(400).json({ message: 'Badge does not exist' })
        
        if(fs.existsSync(`./public/badge-icons/${badge.icon}`)) fs.unlinkSync(`./public/badge-icons/${badge.icon}`)

        await Badges.deleteOne({_id: badgeId})

        res.status( 200 ).send({success: true})
    } catch (error) {
        console.error(error)
        return res.status(500).json({ message: 'Internal server error' })
    }
})


// get users list
router.get('/users', authJwt, checkAdmin, async ( req, res ) => {
    try {
        const usersList = await User.find({}).select('uid avatar username adminAccess createdAt lastSeen verified')

        res.status( 200 ).send(usersList)
    } catch (error) {
        console.error(error)
        return res.status(500).json({ message: 'Internal server error' })
    }
} )

// get user by id or username
router.get('/users/:identifier', authJwt, checkAdmin, async ( req, res ) => {
    try {
        const identifier = req.params.identifier
        const isObjectID = db.mongoose.Types.ObjectId.isValid(identifier)

        let userFound
        const selectString = 'username uid email phone createdAt lastSeen dob reputations vouches bio verified mfaEnabled'

        if (isObjectID) {
            userFound = await User.findById(identifier).select(selectString)
          } else {
            const uidNumber = parseInt(identifier)
            if (!isNaN(uidNumber)) {
                userFound = await User.findOne({ uid: uidNumber }).select(selectString)
            }

            if (!userFound) {
                userFound = await User.findOne({
                  $or: [
                    { email: identifier },
                    { username: identifier },
                  ],
                }).select(selectString)
            }
        }

        if(!userFound) return res.status(400).json({ message: 'User not found' })

        const newUser = {
            ...userFound.toObject(),
            reputations_Count: userFound.reputations.length,
            vouches_Count: userFound.vouches.length
        }

        res.status( 200 ).send(newUser)
    } catch (error) {
        console.error(error)
        return res.status(500).json({ message: 'Internal server error' })
    }
} )

// give non admin user admin access
router.post('/users/:targetId/access', authJwt, checkAdmin, async ( req, res ) => {
    try {
        const { password } = req.body
        const userId = req.user._id.toString()

        if( req.adminAccess !== 2 ) return res.status(403).json({ message: 'No access to perform this action.' })

        const user = await User.findById(userId, 'password')
        if(!user) return res.status(400).json({ message: 'Invalid target id' })

        const isMatch = await bcrypt.compare(password, user.password)
        if (!isMatch) return res.status(401).json({ message: 'Wrong password' })

        const targetId = req.params.targetId
        if (!db.mongoose.Types.ObjectId.isValid(targetId)) return res.status(400).json({ message: 'Invalid target id' })

        const target = await User.findById(targetId, 'adminAccess')

        if( target.adminAccess !== 0 ) return res.status(400).json({ message: 'User already has access' })

        await User.findOneAndUpdate({_id: targetId}, { adminAccess: 1 })
        sendToAllUserIds( req.io, [targetId], 'ADMIN_ACCESS', { access: 1 } )

        res.status( 200 ).send({adminAccess: 1, user: targetId})
    } catch (error) {
        console.error(error)
        return res.status(500).json({ message: 'Internal server error' })
    }
} )

// upgrade user admin access
router.patch('/users/:targetId/access', authJwt, checkAdmin, async ( req, res ) => {
    try {
        const { password } = req.body
        const userId = req.user._id.toString()

        if( req.adminAccess !== 2 ) return res.status(403).json({ message: 'No access to perform this action.' })

        const user = await User.findById(userId, 'password')
        if(!user) return res.status(400).json({ message: 'Invalid target id' })

        const isMatch = await bcrypt.compare(password, user.password)
        if (!isMatch) return res.status(401).json({ message: 'Wrong password' })

        const targetId = req.params.targetId
        if (!db.mongoose.Types.ObjectId.isValid(targetId)) return res.status(400).json({ message: 'Invalid target id' })

        const target = await User.findById(targetId, 'adminAccess')

        if( target.adminAccess !== 1 ) return res.status(400).json({ message: 'User already has access' })

        await User.findOneAndUpdate({_id: targetId}, { adminAccess: 2 })
        sendToAllUserIds( req.io, [targetId], 'ADMIN_ACCESS', { access: 2 } )

        res.status( 200 ).send({adminAccess: 2, user: targetId})
    } catch (error) {
        console.error(error)
        return res.status(500).json({ message: 'Internal server error' })
    }
} )

// remove user admin access
router.delete('/users/:targetId/access', authJwt, checkAdmin, async ( req, res ) => {
    try {
        const { password } = req.body
        const userId = req.user._id.toString()

        if( req.adminAccess !== 2 ) return res.status(403).json({ message: 'No access to perform this action.' })

        const user = await User.findById(userId, 'password')
        if(!user) return res.status(400).json({ message: 'Invalid target id' })

        const isMatch = await bcrypt.compare(password, user.password)
        if (!isMatch) return res.status(401).json({ message: 'Wrong password' })

        const targetId = req.params.targetId
        if (!db.mongoose.Types.ObjectId.isValid(targetId)) return res.status(400).json({ message: 'Invalid target id' })

        const target = await User.findById(targetId, 'adminAccess')

        if( target.adminAccess !== 1 ) return res.status(400).json({ message: 'Can not remove access from this user' })

        await User.findOneAndUpdate({_id: targetId}, { adminAccess: 0 })
        sendToAllUserIds( req.io, [targetId], 'ADMIN_ACCESS', { access: 0 } )

        res.status( 200 ).send({adminAccess: 0, user: targetId})
    } catch (error) {
        console.error(error)
        return res.status(500).json({ message: 'Internal server error' })
    }
} )

module.exports = router