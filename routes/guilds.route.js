const express = require('express')
const router = express.Router()

const { authJwt } = require('../middlewares')
const { checkServerPermissions } = require('../services')
const { unsubscribeAllUsers } = require('../sockets/helpers')

const db = require("../models")
const Guild = db.guild
const Channel = db.channel
const Role = db.role
const Invite = db.invite
const Message = db.message

const guildTypes = {
    1: {
        name: 'Type 1',
        channels: [
            { name: 'general', position: 1, type: 'text' },
            { name: 'test', position: 2, type: 'text' },
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
            { name: 'global', position: 1, type: 'text' },
            { name: 'gta', position: 2, type: 'text' },
            { name: 'cs go', position: 3, type: 'text' },
            { name: 'valorant', position: 4, type: 'text' },
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
        const { name, type } = req.body
    
        // determine server type
        let serverType = type
        if (!serverType || !guildTypes[serverType]) {
            serverType = Object.keys(guildTypes)[0] // select first type
        }

    
        // create new server
        const server = await Guild.create({
            name,
            owner: req.user._id,
            members: [req.user._id]
        })

        // create everyone role
        const everyone_role = await Role.create({
            name: "@everyone",
            color: '#000000',
            members: [req.user._id],
            server: server._id,
            permissions: 70886355229761
        })
    
        // initialize channels and roles based on server type
        const { channels, roles } = guildTypes[serverType]
        const channelPromises = channels.map(({ name, position, type }) =>
            Channel.create({ name, position, type, server: server._id })
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

        const invite = await Invite.create({ code: inviteCode, isPermanent: true, inviter: req.user._id, guild: server._id, channel: channelIds[0] })
    
        // save channel and role IDs in server document
        server.invites = [invite._id]
        server.channels = channelIds
        server.roles = roleIds
        server.everyone_role = everyone_role._id
        await server.save()

        // populate channels and roles and send response
        const populatedServer = await Guild.findById(server._id)
            .populate({
                path: 'invites',
                populate: { path: 'inviter', select: 'avatar username discriminator status' }
            })
            .populate({
                path: 'invites',
                populate: { path: 'channel', select: 'name' }
            })
            .populate({
                path: 'invites',
                populate: { path: 'guild', select: 'name' }
            })
            .populate({ path: 'owner', select: 'avatar username discriminator status' })
            .populate({ path: 'members', select: 'avatar username discriminator status createdAt' })
            .populate({
                path: 'channels',
                select: 'name type topic parent position permissionOverwrites messages',
                populate: {
                    path: 'messages',
                    select: 'content author attachments embeds reactions pinned editedTimestamp deleted deletedTimestamp createdAt',
                    populate: [{
                        path: 'author',
                        select: 'avatar username discriminator status createdAt'
                    }, {
                        path: 'hasReply',
                        select: 'content author',
                        populate: {
                            path: 'author',
                            select: 'username'
                        }
                    }]
                }
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
        const guildId = req.params.guild
        if (!db.mongoose.Types.ObjectId.isValid(guildId)) return res.status(400).json({ message: 'Invalid guild id' })

        const requiredPermissions = ['MANAGE_CHANNELS']
        const userHasPermission = await checkServerPermissions(req.user, guildId, requiredPermissions)
        if( !userHasPermission ) return res.status(403).json({ error: 'You do not have permission to create channels.' })

        // create a new channel
        const channel = new Channel({
            name: req.body.name,
            position: 0,
            server: guildId
        })

        // save the new channel to the database
        await channel.save()

        // add the new channel to the server's channels array
        await Guild.findByIdAndUpdate(guildId, {
            $push: { channels: channel._id }
        })

        req.io.to(`guild:${guildId}`).emit('CHANNEL_CREATE', channel)

        res.status(201).json( channel )
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
} )

// get guild
router.get( '/:guild', authJwt, async (req, res) => {
    try {
        const guildId = req.params.guild
        if (!db.mongoose.Types.ObjectId.isValid(guildId)) return res.status(400).json({ message: 'Invalid guild id' })

        // get server by id and populate owner, memebers, channels and messages and their author
        const guild = await Guild.findOne( { _id: guildId, members: req.user._id } )
            .populate({ path: 'owner', select: 'username discriminator avatar' })
            .populate({ path: 'members', select: 'username discriminator avatar status createdAt' })
            .populate({
                path: 'channels',
                select: 'name type topic parent position permissionOverwrites messages',
                populate: {
                    path: 'messages',
                    select: 'content channel author attachments embeds reactions pinned editedTimestamp deleted deletedTimestamp createdAt',
                    populate: {
                        path: 'author',
                        select: 'avatar username discriminator status createdAt'
                    }
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

// get guild channels
router.get( '/:guild/channels', authJwt, (req, res) => {
    Guild.find({})
        .then( guild => {
            res.status(200).send(guild)
        } )
        .catch( err => res.status(500).send( { message: err } ) )
} )

module.exports = router