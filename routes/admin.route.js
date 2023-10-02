const express = require('express')
const ObjectId = require('mongodb').ObjectId
const router = express.Router()
const fs = require('fs')
const path = require('path')

const { authJwt, checkAdmin } = require('../middlewares')
const config = require('../config')
const db = require("../models")
const { sendToAllUserIds, unsubscribeAllUsers } = require('../sockets/helpers')
const GuildUserProfiles = require('../models/guildUserProfiles.model')

const Guild = db.guild
const Channel = db.channel
const User = db.user
const Role = db.role
const Invite = db.invite
const Message = db.message
const TransactionsQueue = db.transactionsQueue

const guildTypes = {
    1: {
        name: 'Type 1',
        channels: [
            { name: 'text channels', position: 1, type: 'category' },
            { name: 'general', position: 2, type: 'text' },
            { name: 'test', position: 3, type: 'text' },
        ],
        roles: [
            { name: 'admin', color: '#ff0000', permissions: 70886355229761 },
            { name: 'moderator', color: '#00ff00', permissions: 70886355229761 },
            { name: 'member', color: '#0000ff', permissions: 70886355229761 },
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
            { name: 'owner', color: '#000000', permissions: 70886355229761 },
            { name: 'admin', color: '#ff0000', permissions: 70886355229761 },
            { name: 'member', color: '#0000ff', permissions: 70886355229761 }
        ],
    },
    // add more types as needed
}

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

        // create member doc for owner
        const ownerGuildMember = await GuildUserProfiles.create( {
            guild: server._id,
            user: userId
        } )

        // create everyone role
        const everyone_role = await Role.create({
            name: "@everyone",
            color: '#000000',
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


        let inviteCode
        while (!inviteCode) {
            const tempInviteCode = Math.random().toString(36).substr(2, 8)
            const doc = await Invite.findOne({ 'invites.code': tempInviteCode })
            if (!doc) inviteCode = tempInviteCode
        }

        const invite = await Invite.create({ code: inviteCode, isPermanent: true, inviter: userId, guild: server._id, channel: channelIds[0] })
    
        // save channel and role IDs in server document
        server.invites = [invite._id]
        server.channels = channelIds
        server.roles = roleIds
        server.everyone_role = everyone_role._id
        await server.save()

        user.guilds.addToSet(server._id)
        await user.save()
    
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
        await Invite.deleteMany({ server: guildId })
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
            with_invites,
            with_owner
        } = req.query

        const projection = {
            _id: 1,
            icon: 1,
            name: 1,
        }
        
        if (with_roles === 'true') projection.roles = 1
        if (with_invites === 'true') projection.invites = 1
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
            with_invites,
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
        if (with_invites === 'true') projection.invites = 1
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


module.exports = router