const express = require('express')
const router = express.Router()

const { authJwt } = require('../middlewares')
const { checkServerPermissions } = require('../services')
const { unsubscribeAllUsers } = require('../sockets/helpers')

const db = require("../models")
const Guild = db.guild
const GuildUserProfiles = db.guildUserProfiles
const User = db.user
const Channel = db.channel
const Role = db.role
const Invite = db.invite
const Message = db.message

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
router.post( '/', authJwt, async (req, res) => {
    try {
        let { name, type } = req.body
        const userId = req.user._id.toString()
        const user = await User.findById(userId)

        if( !String(name).trim().length ) name = `${user.username}'s server`
    
        // determine server type
        let serverType = type
        if (!serverType || !guildTypes[serverType]) {
            serverType = Object.keys(guildTypes)[0] // select first type
        }

    
        // create new server
        const server = await Guild.create({
            name,
            owner: userId,
            members: [userId]
        })

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

        // populate channels and roles and send response
        const populatedServer = await Guild.findById(server._id)
            .populate({
                path: 'invites',
                populate: { path: 'inviter', select: 'avatar username status' }
            })
            .populate({
                path: 'invites',
                populate: { path: 'channel', select: 'name' }
            })
            .populate({
                path: 'invites',
                populate: { path: 'guild', select: 'name' }
            })
            .populate({
                path: 'channels',
                select: 'name type topic parent position server',
                /*populate: {
                    path: 'messages',
                    select: 'content author attachments embeds reactions pinned editedTimestamp deleted deletedTimestamp createdAt',
                    populate:  {
                        path: 'hasReply',
                        select: 'content author'
                    }
                }*/
            })
            .populate({
                path: 'roles'
            })
            .exec()
    
        res.status(201).send( populatedServer )
    } catch (error) {
        console.error(error)
        res.status(500).send({ error: 'Server error' })
    }
} )

// create guild channel
router.post( '/:guild/channels', authJwt, async (req, res) => {
    try {
        const { name = 'channel', type = 'text', parent = null } = req?.body || {}

        const guildId = req.params.guild
        if (!db.mongoose.Types.ObjectId.isValid(guildId)) return res.status(400).json({ message: 'Invalid guild id' })

        const requiredPermissions = ['MANAGE_CHANNELS']
        const userHasPermission = await checkServerPermissions(req.user, guildId, requiredPermissions)
        if( !userHasPermission ) return res.status(403).json({ error: 'You do not have permission to create channels.' })

        if(parent) {
            if(!db.mongoose.Types.ObjectId.isValid(parent)) return res.status(400).json({ message: 'Invalid parent id' })
            const parentExists = await Channel.exists({_id: parent})
            if(!parentExists) return res.status(400).json({ message: 'Invalid parent channel' })
        }

        const guild = await Guild.findById( guildId )
            .populate( 'everyone_role', 'name color' )
        if( !guild ) return res.status(404).send({ message: 'Channel not found'})

        const channelWithBiggestPos = await Channel.findOne().sort('-position').select('position')
        const nextChannelPos = channelWithBiggestPos ? channelWithBiggestPos.position + 1 : 0

        // create a new channel
        const channel = new Channel({
            name,
            type,
            parent,
            position: nextChannelPos,
            server: guildId,
            permissions : {
                roles: {
                    allow: 70508330735680,
                    deny: 0,
                    id: guild.everyone_role
                }
            } 
        })

        // save the new channel to the database
        await channel.save()

        // add the new channel to the server's channels array
        await Guild.findByIdAndUpdate(guildId, {
            $push: { channels: channel._id }
        })

        const updatesRes = {
            channel: channel._id.toString(),
            permission: {
                type: 0,
                allow: 70508330735680,
                deny: 0,
                id: {
                    _id: guild.everyone_role._id.toString(),
                    name: guild.everyone_role.name,
                    color: guild.everyone_role.color
                }
            }
        }

        req.io.to(`guild:${guildId}`).emit('CHANNEL_CREATE', channel)
        req.io.to(`guild:${guildId}`).emit('PERMISSION_UPDATE', updatesRes)

        res.status(201).json( channel )
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
} )

// get all guild member profiles
router.get('/members', authJwt, async (req, res) => {
    try {
        const userId = req.user._id.toString()
        const user = await User.findById(userId)
        const allUserProfiles = await GuildUserProfiles.find({ guild: { $in: user.guilds } })
        res.status(200).json( allUserProfiles )
    } catch (error) {
        console.error(error)
        res.status(500).send({ message: 'Internal server error' })
    }
})

// get guild
router.get( '/:guild', authJwt, async (req, res) => {
    try {
        const guildId = req.params.guild
        if (!db.mongoose.Types.ObjectId.isValid(guildId)) return res.status(400).json({ message: 'Invalid guild id' })

        // get server by id and populate owner, memebers, channels and messages and their author
        const guild = await Guild.findOne( { _id: guildId, members: req.user._id } )
            .populate({ path: 'owner', select: 'username avatar' })
            .populate({ path: 'members', select: 'username avatar status createdAt' })
            .populate({
                path: 'channels',
                select: 'name type topic parent position permissionOverwrites messages server',
                populate: {
                    path: 'messages',
                    select: 'content channel author attachments embeds reactions pinned editedTimestamp deleted deletedTimestamp createdAt',
                }
            })
            .exec()

        if (!guild) throw new Error('Guild not found')

        res.status(200).send( guild )
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
} )

// delete guild
router.delete('/:guild', authJwt, async (req, res) => {
    try {
        const guildId = req.params.guild
        if (!db.mongoose.Types.ObjectId.isValid(guildId)) return res.status(400).json({ message: 'Invalid guild id' })

        const requiredPermissions = ['MANAGE_GUILD']
        const userHasPermission = await checkServerPermissions(req.user, guildId, requiredPermissions)
        if( !userHasPermission ) return res.status(403).json({ error: 'You do not have permission to delete server.' })
    
        // delete channels and roles related to the server
        await Channel.deleteMany({ server: guildId })
        await Role.deleteMany({ server: guildId })
        await Invite.deleteMany({ server: guildId })
        await Message.deleteMany({ server: guildId })
    
        // delete server
        const server = await Guild.findByIdAndDelete(guildId)
    


        req.io.to(`guild:${server._id}`).emit('GUILD_DELETE', { guild: server._id })
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

// update guild
router.patch('/:guild', authJwt, async (req, res) => {
    try {
        const guildId = req.params.guild
        if (!db.mongoose.Types.ObjectId.isValid(guildId)) return res.status(400).json({ message: 'Invalid guild id' })

        const requiredPermissions = ['MANAGE_GUILD']
        const userHasPermission = await checkServerPermissions(req.user, guildId, requiredPermissions)
        if( !userHasPermission ) return res.status(403).json({ error: 'You do not have permission to edit server.' })

        const guild = await Guild.findById(guildId)
        if( !guild ) return res.status(404).send({ message: 'Guild not found'})
    
        const fieldMap = {
            'server-name': 'name',
            'server-system-channel': 'system_channel_id',
            'system-channel-welcome-message': 'systemChannelWelcomeMessage',
            'system-channel-tips': 'systemChannelTips'
        }

        const updates = {}
        for (const [key, value] of Object.entries(req.body)) {
            const field = fieldMap[key]
            if (field) updates[field] = value
        }

        let updatedFields = {}

        if( updates.name && updates.name?.length >= 2 || updates.name?.length <= 100 ) {
            //return res.status(400).send({ message: "Invalid server name.", name: true })

            await Guild.updateOne({_id: guildId}, { name: updates.name })
            updatedFields.name = updates.name
        }

        if( updates.system_channel_id !== undefined ) {
            if(updates.system_channel_id === null) {
                await Guild.updateOne({_id: guildId}, { system_channel_id: null })
                updatedFields.system_channel_id = null
            } else {
                const system_channel_id = await Channel.exists( {_id: updates.system_channel_id, server: guildId} )

                if( system_channel_id ) {
                    await Guild.updateOne({_id: guildId}, { system_channel_id: updates.system_channel_id })
                    updatedFields.system_channel_id = updates.system_channel_id
                }
            }

        }

        if( updates.systemChannelTips !== undefined || updates.systemChannelWelcomeMessage !== undefined ) {

            let newTipsFlag = updates.systemChannelTips ?? guild.system_channel_flags.tips
            let newWelcomeMessagesFlag = updates.systemChannelWelcomeMessage ?? guild.system_channel_flags.welcome_messages

            const newGuild = await Guild.findOneAndUpdate({_id: guildId}, {
                $set: {
                    'system_channel_flags.tips': newTipsFlag,
                    'system_channel_flags.welcome_messages': newWelcomeMessagesFlag,
                }
            }, {new: true})

            updatedFields.system_channel_flags = newGuild.system_channel_flags
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

// get guild channels
router.get( '/:guild/channels', authJwt, (req, res) => {
    Guild.find({})
        .then( guild => {
            res.status(200).send(guild)
        } )
        .catch( err => res.status(500).send( { message: err } ) )
} )

// update current guild member
router.patch('/:guildId/members/@me', authJwt, async (req, res) => {
    try {
        const userId = req.user._id.toString()
        const guildId = req.params.guildId
        if (!db.mongoose.Types.ObjectId.isValid(guildId)) return res.status(400).json({ message: 'Invalid guild id' })

        const requiredPermissions = ['CHANGE_NICKNAME']
        const userHasPermission = await checkServerPermissions(req.user, guildId, requiredPermissions)
        if( !userHasPermission ) return res.status(403).json({ error: 'You do not have permission to change nickname.' })

        const guildMember = await GuildUserProfiles.findOne({ guild: guildId, user: userId })
        if( !guildMember ) return res.status(404).send({ message: 'Guild member not found'})
    
        const fieldMap = {
            'server-nickname': 'nick'
        }

        const updates = {}
        for (const [key, value] of Object.entries(req.body)) {
            const field = fieldMap[key]
            if (field) updates[field] = value
        }

        let updatedFields = {}

        if( typeof updates.nick === 'string' && (updates.nick?.length === 0) || (updates.nick?.length >= 2 && updates.nick?.length <= 32) ) {
            guildMember.nick = updates.nick
            await guildMember.save()
            updatedFields.nick = updates.nick
        }

        if( Object.keys(updatedFields).length ) {
            req.io.to(`guild:${guildId}`).emit('GUILD_MEMBER_UPDATE', {updates: updatedFields, guildId, memberId: userId})
            return res.status(200).send(updatedFields)
        }

        res.status(400).end()

    } catch (error) {
        console.error(error)
        res.status(500).send({ message: 'Internal server error' })
    }
})

module.exports = router