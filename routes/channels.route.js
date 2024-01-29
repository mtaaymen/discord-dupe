const express = require('express')
const rateLimit = require('express-rate-limit')
const router = express.Router()
const crypto = require('crypto')
const path = require('path')
const fs = require('fs')
const FileType = require('file-type');
const sharp = require('sharp');


const metascraper = require('metascraper')([
    require('metascraper-title')(),
    require('metascraper-description')(),
    require('metascraper-image')(),
    require('metascraper-url')(),
])

const { authJwt, messageRateLimiters } = require('../middlewares')
const { checkChannelPermissions } = require('../services')
const { unsubscribeAllUsers, sendToAllUserIds } = require('../sockets/helpers')

const messageRLs = messageRateLimiters() 


async function getLinkData(url) {
    try {
        const response = await fetch(url);
        const html = await response.text();
    
        const metadata = await metascraper({ html, url });

        return {
            title: metadata.title,
            description: metadata.description,
            thumbnail: metadata.image,
            url: metadata.url
        };
    } catch (error) {
        return null
    }
}

function findLinks(text) {
    // Regular expression to match URLs
    const urlPattern = /https?:\/\/\S+|www\.\S+/gi;

    // Find all matches in the text
    const matches = text.match(urlPattern);

    return matches || [];
}


const db = require("../models")
const GuildUserProfiles = db.guildUserProfiles
const Guild = db.guild
const User = db.user
const Channel = db.channel
const Role = db.role
//const Invite = db.invite
const Message = db.message
const Attachment = db.attachment


// get channel by id
router.get('/:channelId', authJwt, async (req, res) => {
    try {
        let { channelId } = req.params
        if (!db.mongoose.Types.ObjectId.isValid(channelId)) return res.status(400).json({ message: 'Invalid channel id' })

        const user = await User.findById(req.user._id)

        const channel = await Channel.findById(channelId).populate('server', '_id')
        if( !channel ) return res.status(404).send({ message: 'Channel not found'})

        if( channel.participants.includes( req.user._id.toString() ) && !user.channels.includes( channelId ) ) {
            user.channels.addToSet(channelId)
            await user.save()
        }

        const populatedChannel = await Channel.findById(channelId)
            .populate([{
                path: 'messages',
                select: 'content channel author attachments embeds reactions pinned editedTimestamp deleted deletedTimestamp createdAt',
                populate: {
                    path: 'hasReply',
                    select: 'content author'
                }
            }])

        res.status(200).json( populatedChannel )
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

// edit channel
router.patch('/:channelId', authJwt, async (req, res) => {
    try {
        const { channelId } = req.params
        if (!db.mongoose.Types.ObjectId.isValid(channelId)) return res.status(400).json({ message: 'Invalid channel id' })

        const requiredPermissions = ['MANAGE_CHANNELS']
        const userHasPermission = await checkChannelPermissions(req.user, channelId, requiredPermissions)
        if( !userHasPermission ) return res.status(403).json({ error: 'You do not have permission to edit channels.' })

        // map properties from request body to channel model properties
        const fieldMap = {
            'channel-name': 'name',
            'channel-topic': 'topic',
            'channel-slowmode': 'rate_limit_per_user'
            // add more properties here as needed
        }
        const updates = {}
        for (const [key, value] of Object.entries(req.body)) {
            const field = fieldMap[key]
            if (field) {
                updates[field] = value
            }
        }

        // update the channel
        await Channel.findByIdAndUpdate(channelId, updates)

        const updatedChannel = await Channel.findById(channelId)
            .select('name server')

        const updatesRes = {
            channel: updatedChannel,
            updates
        }

        if( updatedChannel.server ) {
            req.io.to(`guild:${updatedChannel.server}`).emit('CHANNEL_UPDATE', updatesRes)
        } else {
            req.io.to(`channel:${updatedChannel._id.toString()}`).emit('CHANNEL_UPDATE', updatesRes)

            if( updates.name ) {
                const message = await Message.create({
                    content: `${req.user.username} changed the channel name: ${updates.name}`,
                    author: req.user._id,
                    channel: channelId,
                    type: 4
                })
                await updatedChannel.updateOne({ $push: { messages: message._id } })

                const populatedMessage = await Message.findById(message._id)
                    .populate({
                        path: 'hasReply',
                        select: 'content author'
                    })
    
                req.io.to(`channel:${channelId}`).emit('MESSAGE_CREATE', populatedMessage)
            }
        }

        res.status(200).json( updatedChannel )
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

// add participant to channel
router.put('/:channelId/participants/:participantId', authJwt, async (req, res) => {
    try {
        const userId = req.user._id.toString()
        const { channelId, participantId } = req.params
        if (!db.mongoose.Types.ObjectId.isValid(channelId)) return res.status(400).json({ message: 'Invalid channel id' })
        if (!db.mongoose.Types.ObjectId.isValid(participantId)) return res.status(400).json({ message: 'Invalid participant id' })

        const channel = await Channel.findById(channelId)
        if( !channel ) return res.status(404).send({ message: 'Channel not found'})

        if( !channel.participants.includes(userId) ) return res.status(403).json({ error: 'You do not have permission to add participants.' })

        const participantExists = await User.findById(participantId)
        if( !participantExists ) return res.status(404).send({ message: 'Participant not found'})

        if( !participantExists.channels.includes(channelId) ) {
            participantExists.channels.addToSet(channelId)
            await participantExists.save()
        }


        if( !channel.participants.includes(participantId) ) {
            if( !channel.permissions.find( permission => permission.id.toString() === participantId ) ) {
                channel.permissions.push({
                    _type: 1,
                    allow: 70508330736704,
                    deny: 0,
                    id: participantId
                })
            }
            
            channel.participants.addToSet(participantId)
            await channel.save()

            const populatedChannel = await Channel.findById(channelId)
                .populate([{
                    path: 'messages',
                    select: 'content channel author attachments embeds reactions pinned editedTimestamp deleted deletedTimestamp createdAt',
                    populate: {
                        path: 'hasReply',
                        select: 'content author'
                    }
                }])

            res.status(200).json( populatedChannel )
            req.io.to(`channel:${channelId}`).emit('CHANNEL_UPDATE', populatedChannel)
            sendToAllUserIds(req.io, [participantId], 'CHANNEL_CREATE', populatedChannel)


            const message = await Message.create({
                content: `${req.user.username} added ${participantExists.username} to the group.`,
                author: req.user._id,
                channel: channelId,
                mentions: [participantId],
                type: 1 // 0 == default, 1 == add, 2 == left or removed, 3 == ???, 4 == edited
            })
            await channel.updateOne({ $push: { messages: message._id } })

            const populatedMessage = await Message.findById(message._id)
                .populate({
                    path: 'hasReply',
                    select: 'content author'
                })

            req.io.to(`channel:${channelId}`).emit('MESSAGE_CREATE', populatedMessage)
        }

    res.status(200).end()
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

// add member or role to channel permissions
router.put('/:channelId/permissions/:roleId', authJwt, async (req, res) => {
    try {
        const { channelId, roleId } = req.params
        const { allow, deny, id, type } = req.body
        if (!db.mongoose.Types.ObjectId.isValid(channelId)) return res.status(400).json({ message: 'Invalid channel id' })
        if (!db.mongoose.Types.ObjectId.isValid(roleId)) return res.status(400).json({ message: 'Invalid role id' })
        if (!db.mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid role id' })

        const requiredPermissions = ['MANAGE_ROLES']
        const userHasPermission = await checkChannelPermissions(req.user, channelId, requiredPermissions)
        if( !userHasPermission ) return res.status(403).json({ error: 'You do not have permission to send messages.' })

        const channel = await Channel.findById(channelId)
        if( !channel ) return res.status(404).send({ message: 'Channel not found'})

        const guild = await Guild.findById( channel.server )
        if( !guild ) return res.status(404).send({ message: 'Channel not found'})

        if( type === 1 ) { // user
            const user = await User.findById(id)
            if( !user ) return res.status(404).send({ message: 'User not found'})

            const newUser = {
                allow,
                deny,
                id
            }

            const index = channel.permissions.users.findIndex( u => u.id.toString() === id )
            if (index !== -1) {
                channel.permissions.users.splice(index, 1, newUser)
            } else {
                channel.permissions.users.unshift(newUser)
            }
            await channel.save()

            const updatesRes = {
                channel: channelId,
                permission: {
                    type,
                    allow,
                    deny,
                    id: {
                        _id: id,
                        username: user.username,
                        avatar: user.avatar
                    }
                }
            }

            req.io.to(`channel:${channelId}`).emit('PERMISSION_UPDATE', updatesRes)
            return res.status(200).send(updatesRes)
        } else {
            const role = await Role.findById(id)
            if( !role ) return res.status(404).send({ message: 'Role not found'})

            //if( guild.everyone_role.toString() === id ) return res.status(404).send({ message: 'Cannot add everyone role'})

            const newRole = {
                allow,
                deny,
                id
            }

            const index = channel.permissions.roles.findIndex( r => r.id.toString() === id )
            if (index !== -1) {
                channel.permissions.roles.splice(index, 1, newRole)
            } else {
                channel.permissions.roles.unshift(newRole)
            }
            await channel.save()

            const updatesRes = {
                channel: channelId,
                permission: {
                    type,
                    allow,
                    deny,
                    id: {
                        _id: id,
                        name: role.name,
                        color: role.color
                    }
                }
            }

            req.io.to(`channel:${channelId}`).emit('PERMISSION_UPDATE', updatesRes)
            return res.status(200).send(updatesRes)
        }

        res.status(200).end()
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

// remove member or role from channel permissions
router.delete('/:channelId/permissions/:roleId', authJwt, async (req, res) => {
    try {
        const { channelId, roleId } = req.params
        const { type } = req.body
        if (!db.mongoose.Types.ObjectId.isValid(channelId)) return res.status(400).json({ message: 'Invalid channel id' })
        if (!db.mongoose.Types.ObjectId.isValid(roleId)) return res.status(400).json({ message: 'Invalid role id' })

        const requiredPermissions = ['MANAGE_ROLES']
        const userHasPermission = await checkChannelPermissions(req.user, channelId, requiredPermissions)
        if( !userHasPermission ) return res.status(403).json({ error: 'You do not have permission to send messages.' })

        const channel = await Channel.findById(channelId)
        if( !channel ) return res.status(404).send({ message: 'Channel not found'})

        const guild = await Guild.findById( channel.server )
        if( !guild ) return res.status(404).send({ message: 'Channel not found'})

        const updatesRes = {
            type,
            channel: channelId,
            permission: {
                id: roleId
            }
        }

        if( type === 1 ) { // user
            const user = await User.findById(roleId)
            if( !user ) return res.status(404).send({ message: 'User not found'})

            channel.permissions.users = channel.permissions.users.filter( u => u.id.toString() !== roleId)
            await channel.save()
        } else {
            const role = await Role.findById(roleId)
            if( !role ) return res.status(404).send({ message: 'Role not found'})

            if( guild.everyone_role.toString() === roleId ) return res.status(404).send({ message: 'Cannot remove everyone role'})

            channel.permissions.roles = channel.permissions.roles.filter( r => r.id.toString() !== roleId)
            await channel.save()
        }

        req.io.to(`channel:${channelId}`).emit('PERMISSION_DELETE', updatesRes)

        res.status(200).send(updatesRes)
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

// delete channel
router.delete('/:channel', authJwt, async (req, res) => {
    try {
        const channelId = req.params.channel
        if (!db.mongoose.Types.ObjectId.isValid(channelId)) return res.status(400).json({ message: 'Invalid channel id' })

        const userId = req.user._id.toString()
        const user = await User.findById(userId)
        const channel = await Channel.findById(channelId)

        if( !channel?.server ) {
            if( channel.isGroup ) {
                if( !channel.participants.includes( userId ) ) return res.status(404).json({ message: "User not in channel" })

                await User.findByIdAndUpdate( userId, { $pull: { channels: channelId } })

                channel.participants = channel.participants.filter( participant => participant.toString() !== userId )

                if( !channel.participants.length ) {
                    await Channel.findByIdAndDelete(channelId)
                    await Message.deleteMany({ channel: channelId })
            
                    sendToAllUserIds(req.io, [userId], 'CHANNEL_DELETE', { channel: channelId })

                    return res.status(200).json({ message: `Channel ${channelId} deleted successfully`, channel: channelId })
                }

                if( userId === channel.owner.toString() ) {
                    channel.owner = channel.participants[0].toString()
                    await channel.save()
                }
                

                const populatedChannel = await Channel.findById(channelId)
                    .populate([{
                        path: 'messages',
                        select: 'content channel author attachments embeds reactions pinned editedTimestamp deleted deletedTimestamp createdAt',
                        populate: {
                            path: 'hasReply',
                            select: 'content author'
                        }
                    }])
            
                req.io.to(`channel:${channelId}`).emit('CHANNEL_UPDATE', populatedChannel)

                sendToAllUserIds(req.io, [userId], 'CHANNEL_DELETE', { channel: channelId })

                const message = await Message.create({
                    content: `${req.user.username} left the group.`,
                    author: req.user._id,
                    channel: channelId,
                    type: 2 // 0 == default, 1 == add, 2 == left or removed, 3 == ???, 4 == edited
                })
                await channel.updateOne({ $push: { messages: message._id } })
    
                const populatedMessage = await Message.findById(message._id)
                    .populate({
                        path: 'hasReply',
                        select: 'content author'
                    })
    
                req.io.to(`channel:${channelId}`).emit('MESSAGE_CREATE', populatedMessage)

                return res.status(200).json({ message: `Channel ${channelId} deleted successfully`, channel: channelId })
            }

            if( user.channels.includes( channelId ) ) {
                await User.findByIdAndUpdate( userId, { $pull: { channels: channelId } })

                sendToAllUserIds(req.io, [userId], 'CHANNEL_DELETE', { channel: channelId })
                //unsubscribeAllUsers( req.io, 'channel', channelId )
            } else return res.status(404).json({ message: "User not in channel" })

            return res.status(200).json({ message: `Channel ${channelId} deleted successfully`, channel: channelId })
        }

        const requiredPermissions = ['MANAGE_CHANNELS']
        const userHasPermission = await checkChannelPermissions(req.user, channelId, requiredPermissions)
        if( !userHasPermission ) return res.status(403).json({ error: 'You do not have permission to delete channels.' })

        
        const guildId = channel.server.toString()
        const server = await Guild.findById(guildId).populate('channels')

        // ensure the server has at least one channel
        if (server.channels.filter( c => c.type !== 'category' ).length === 1) {
            return res.status(400).json({ message: 'Cannot delete last channel in server' })
        }

        /*const inviteExists = await Invite.exists( { channel: channelId, guild: guildId } )
        if( inviteExists ) {
            let firstChannelId

            for (let i = 0; i < server.channels.length; i++) {
                if (server.channels[i]._id.toString() !== channelId) {
                    firstChannelId = server.channels[i]._id.toString()
                    break
                }
            }

            await Invite.updateMany({ channel: channelId, guild: guildId }, { channel: firstChannelId })
        }*/

        // delete the channel
        await Channel.findByIdAndDelete(channelId)
        await Message.deleteMany({ server: guildId })

        // remove the channel ID from the server's channels array
        await Guild.findByIdAndUpdate(guildId, {
            $pull: { channels: channelId }
        })

        /*
        // remove the channel ID from any roles that had it as a channel
        await Role.updateMany(
            { channels: channelId },
            { $pull: { channels: channelId } }
        )
        */

        req.io.to(`guild:${guildId}`).emit('CHANNEL_DELETE', { channel: channelId, guild: guildId })
        unsubscribeAllUsers( req.io, 'channel', channelId )
  
        res.status(200).json({ message: `Channel ${channelId} deleted successfully`, channel: channelId })
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

// get channel messages list
router.get('/:channel/messages', async (req, res) => {
    const channelId = req.params.channel
    const limit = parseInt(req.query.limit) || 10; // Default limit is 10 if not provided
    const before = req.query.before || null; // Default before is null if not provided
    
    let query = { channel: channelId }
    
    if (before && db.mongoose.Types.ObjectId.isValid(before)) {
        query = { channel: channelId, _id: { $lt: before } }
    }

    try {
        const messages = await Message.find(query)
            .sort({ _id: -1 })
            .limit(limit)
            .select('content channel author attachments embeds reactions pinned editedTimestamp deleted deletedTimestamp createdAt mention_everyone mentions mention_roles')
            .populate([
                {
                    path: 'hasReply',
                    select: 'content author'
                }, {
                    path: 'mention_roles',
                    select: 'name color'
                }, {
                    path: 'attachments',
                    select: 'filename size extension channel format width height'
                }
            ])
            .exec()


            const newMessages = []
            messages.forEach( message => {
                const messageObject = message.toObject()
                const newAttachments = messageObject.attachments.map( attachment => {
                    return {
                        filename: attachment.filename,
                        size: attachment.size,
                        //url: `http://localhost:3001/attachments/${attachment.channel.toString()}/${attachment._id}/${attachment.filename}?ex=${attachment.extension}&format=${attachment.format}`,
                        url: `https://discord-dupe.onrender.com/attachments/${attachment.channel.toString()}/${attachment._id}/${attachment.filename}?ex=${attachment.extension}&format=${attachment.format}`,
                        _id: attachment._id,
                        height: attachment.height,
                        width: attachment.width,
                        format: attachment.format
                    }
                } )

                messageObject.attachments = newAttachments
                newMessages.push(messageObject)
            } )

            

            const totalMessages = await Message.countDocuments(query)
            const hasNextPage = totalMessages > limit
        
        res.json({ messages: newMessages.reverse(), hasNextPage })
    } catch (error) {
        console.error(error)
        res.status(500).json({ error: 'Internal Server Error' })
    }
})

// get channel message by id
router.get('/:channelId/messages/:messageId', async (req, res) => {
    try {
        const { channelId, messageId } = req.params
    
        // retrieve the message object with populated author and channel fields
        const message = await Message.findOne({ _id: messageId, channel: channelId })
            .populate('author', 'username')
            .populate('channel', 'name')
    
        // check if the message exists
        if (!message) return res.status(404).json({ message: 'Message not found' })
        
    
        res.status(200).json({ message })
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

const setRateLimit = async (req, res, next) => {
    try {
        const { toUser } = req.body
        const { channelId } = req.params

        if( toUser ) return next()

        const channel = await Channel.findById(channelId);
        
        if (channel) {
            const rateLimitImmunity = await checkChannelPermissions(req.user, channelId, ['MANAGE_MESSAGES', 'MANAGE_CHANNELS'])
            req.rateLimit = rateLimitImmunity ? undefined : channel.rate_limit_per_user
        } else {
            req.rateLimit = undefined
        }
        
        next()
    } catch (error) {
        console.error('Error fetching channel:', error);
        next()
    }
}


// create message
router.post('/:channelId/messages', authJwt, setRateLimit, ...messageRLs, async (req, res) => {
        try {
            const { attachments, content, hasReply, toUser } = req.body
            let { channelId } = req.params
            const authorId = req.user._id.toString()

            if ((typeof content === 'string' && content.trim() === "") && (!Array.isArray(attachments) || attachments.length === 0)) {
                return res.status(404).send({ message: 'Unable to send empty message' })
            }

            const user = await User.findById(authorId)

            let channel
            if( toUser ) {
                channel = await Channel.findOne({ participants: { $all: [authorId, channelId], $size: 2 } })
                if( !channel ) {
                    const receiver = await User.findById(channelId)
                    if( !receiver ) return res.status(404).send({ message: 'User not found'})

                    channel = await Channel.create({
                        type: 'dm',
                        position: 0,
                        participants: [
                            authorId,
                            channelId 
                        ],
                        permissions: {
                            users: [{
                                allow: 70508330736704,
                                deny: 0,
                                id: authorId
                            }, {
                                allow: 70508330736704,
                                deny: 0,
                                id: channelId
                            }]
                        }
                    })

                    user.channels.addToSet(channel._id)
                    receiver.channels.addToSet(channel._id)

                    await user.save()
                    await receiver.save()

                    const populatedDMChannel = await Channel.findById(channel._id)
                        .select('owner name last_message_id lastTimestamp isGroup participants permissions type server')


                    const usersRecievedChannel = [authorId, channelId]
                    
                    for( const participant of [user, receiver] ) {
                        const permission = {
                            channel: channel._id.toString(),
                            permission: {
                                type: 1,
                                allow: 70508330736704,
                                deny: 0,
                                id: {
                                    _id: participant._id.toString(),
                                    username: participant.username,
                                    avatar: participant.avatar
                                }
                            }}

                        sendToAllUserIds(req.io, usersRecievedChannel, 'PERMISSION_UPDATE', permission) 
                    }

                    sendToAllUserIds(req.io, usersRecievedChannel, 'CHANNEL_CREATE', populatedDMChannel)
                }
            } else {
                channel = await Channel.findById(channelId)
                    .populate('server', '_id')
            }

            if( !channel ) return res.status(404).send({ message: 'Channel not found'})
            channelId = channel._id.toString()

            let requiredPermissions
            
            if(channel.type === 'dm') {
                requiredPermissions = ['SEND_MESSAGES']
            } else {
                requiredPermissions = ['SEND_MESSAGES', 'VIEW_CHANNEL']
            }
            

            const userHasPermission = await checkChannelPermissions(req.user, channelId, requiredPermissions)
            if( !userHasPermission ) return res.status(403).json({ error: 'You do not have permission to send messages.' })

            if( !channel.server && channel.participants ) {
                const usersRecievedChannel = []

                for( const participant of channel.participants ) {
                    const participantDoc = await User.findById(participant)

                    if( !participantDoc.channels.includes(channelId) ) {
                        participantDoc.channels.addToSet(channelId)
                        await participantDoc.save()
                        usersRecievedChannel.push( participant.toString() )
                    }
                }


                if( usersRecievedChannel.length ) {
                    const populatedDMChannel = await Channel.findById(channelId)
                        .select('owner name last_message_id lastTimestamp isGroup participants permissions type server')

                    sendToAllUserIds(req.io, usersRecievedChannel, 'CHANNEL_CREATE', populatedDMChannel)
                }
            }

            let mentionsList = []
            const mentionRegex = /<@(\w+)>/g
            const mentionMatches = content.match(mentionRegex)
        
            if (mentionMatches) {
                const existingIds = new Set(mentionMatches.map(match => match.substring(2, match.length - 1)))
        
                const validIds = Array.from(existingIds).filter(id => db.mongoose.Types.ObjectId.isValid(id))
        
                if (validIds.length > 0) {
                    const foundUsers = await User.find({ _id: { $in: validIds } }, '_id')
                    mentionsList = foundUsers.map(u => u._id)
                }
            }

            
            let roleMentionsList = []
            const roleMentionRegex = /<@&(\w+)>/g
            const roleMentionMatches = content.match(roleMentionRegex)

            if (roleMentionMatches) {
                const existingIds = new Set(roleMentionMatches.map(match => match.substring(3, match.length - 1)))
                const validIds = Array.from(existingIds).filter(id => db.mongoose.Types.ObjectId.isValid(id))
                if (validIds.length > 0) {
                    const foundRoles = await Role.find({ _id: { $in: validIds } }, '_id')
                    roleMentionsList = foundRoles.map(u => u._id)
                }
            }

            const everyoneMentionRegex = /@(here|everyone)/g
            const mention_everyone = everyoneMentionRegex.test(content)
            

            const embedsList = []
            const foundLinks = findLinks(content);
            
            const linksDataPromises = foundLinks.map(async (link) => {
                const linkData = await getLinkData(link)
                if (linkData) {
                    embedsList.push({
                        description: linkData.description,
                        thumbnail: {
                            url: linkData.thumbnail,
                        },
                        title: linkData.title,
                        type: "link",
                        url: linkData.url
                    })
                }
            })
            
            await Promise.all(linksDataPromises)

            const selectedAttachments = []
            if( attachments && Array.isArray(attachments) ) {
                for( let attachment of attachments ) {
                    if( typeof attachment?.uploaded_filename !== 'string' ) continue
                    if( !attachment.uploaded_filename.includes('/') ) continue
                    const attachmentFileNameSplits = attachment.uploaded_filename.split('/')
                    const attachmentUuid = attachmentFileNameSplits?.[0]
                    const attachmentFileName = attachmentFileNameSplits?.[1]

                    if( !isValidUuidFormat(attachmentUuid) ) continue
                    if( !hasFileFormat(attachmentFileName) ) continue

                    const attachmentDoc = await Attachment.findOne({uuid: attachmentUuid})
                    if(!attachmentDoc) continue
                    selectedAttachments.push(attachmentDoc._id)
                }
            }

            const message = await Message.create({
                content,
                author: authorId,
                channel: channelId,
                hasReply,
                server: channel?.server,
                type: 0,
                mentions: mentionsList,
                mention_roles: roleMentionsList,
                mention_everyone,
                embeds: embedsList,
                attachments: selectedAttachments
            })
        
            // Add the message to the channel's messages array
            await channel.updateOne({
                lastTimestamp: new Date().getTime(),
                last_message_id: message._id,
                $push: {
                    messages: message._id
                }
            })

            if( channel?.server ) {
                await GuildUserProfiles.updateOne(
                    { guild: channel.server, user: authorId },
                    {
                        $set: { lastActive: Date.now() },
                        $inc: { messages_count: 1 }
                    }
                )
            }
            
        
            // Populate the message object with the author's username and the channel's name
            const populatedMessage = await Message.findById(message._id)
                .populate([
                    {
                        path: 'hasReply',
                        select: 'content author'
                    }, {
                        path: 'mention_roles',
                        select: 'name color'
                    }, {
                        path: 'attachments',
                        select: 'filename size extension channel format width height'
                    }
                ])
                .exec()

            const newAttachments = populatedMessage.attachments.map( attachment => {
                return {
                    filename: attachment.filename,
                    size: attachment.size,
                    //url: `http://localhost:3001/attachments/${attachment.channel.toString()}/${attachment._id}/${attachment.filename}?ex=${attachment.extension}&format=${attachment.format}`,
                    url: `https://discord-dupe.onrender.com/attachments/${attachment.channel.toString()}/${attachment._id}/${attachment.filename}?ex=${attachment.extension}&format=${attachment.format}`,
                    _id: attachment._id,
                    height: attachment.height,
                    width: attachment.width,
                    format: attachment.format
                }
            } )

            const messageObject = populatedMessage.toObject()
            messageObject.attachments = newAttachments

            req.io.to(`channel:${channelId}`).emit('MESSAGE_CREATE', messageObject)
            
            // Send the populated message object in the response
            res.status(201).json(messageObject)
        } catch (error) {
            console.error(error)
            res.status(500).json({ message: 'Internal server error' })
        }
})

// delete message
router.delete('/:channelId/messages/:messageId', authJwt, async (req, res) => {
    try {
        const { channelId, messageId } = req.params

        if (!db.mongoose.Types.ObjectId.isValid(channelId)) return res.status(400).json({ message: 'Invalid channel id' })
        if (!db.mongoose.Types.ObjectId.isValid(messageId)) return res.status(400).json({ message: 'Invalid message id' })
        

        // find the channel
        const channel = await Channel.findById(channelId).populate('permissions')
        if (!channel) return res.status(404).json({ message: 'Channel not found.' })

        const message = await Message.findById(messageId)
        if (!message) return res.status(404).json({ message: 'Message not found.' })
          
        if( req.user._id.toString() !== message.author.toString() ) {
            const requiredPermissions = ['MANAGE_MESSAGES', 'VIEW_CHANNEL']
            const userHasPermission = await checkChannelPermissions(req.user, channelId, requiredPermissions)
            if( !userHasPermission ) return res.status(403).json({ error: 'You do not have permission to delete this message.' })
        }

        // delete the message
        await Message.findByIdAndDelete(messageId)

        // remove the channel ID from the server's channels array
        channel.updateOne(channelId, {
            $pull: { messages: messageId }
        })

        req.io.to(`channel:${channelId}`).emit('MESSAGE_DELETE',{
            message: messageId,
            channel: channelId,
            ...(channel?.server && { server: channel.server.toString() })
        })
  
        res.status(200).json({ message: `Message ${messageId} deleted successfully`, })
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

// edit message
router.patch('/:channelId/messages/:messageId', authJwt, async (req, res) => {
    try {
        const { content } = req.body
        const { channelId, messageId } = req.params

        const updates = {
            content
        }

        const message = await Message.findById(messageId)
        if (!message) return res.status(404).json({ message: 'Message not found.' })

        if( req.user._id.toString() !== message.author.toString() ) return res.status(403).json({ message: "You don't have permission to perform this action." })

        const requiredPermissions = ['VIEW_CHANNEL']
        const userHasPermission = await checkChannelPermissions(req.user, channelId, requiredPermissions)
        if( !userHasPermission ) return res.status(403).json({ error: 'You do not have permission to edit this message.' })

        // update the channel
        const updatedMessage = await Message.findByIdAndUpdate(messageId, { ...updates, editedTimestamp: Date.now() }, { new: true })
            .populate([
                {
                    path: 'hasReply',
                    select: 'content author'
                }, {
                    path: 'mention_roles',
                    select: 'name color'
                }, {
                    path: 'attachments',
                    select: 'filename size extension channel format width height'
                }
            ])
            .exec()

        const newUpdatedMessageAttachments = updatedMessage.attachments.map( attachment => {
            return {
                filename: attachment.filename,
                size: attachment.size,
                url: `http://localhost:3001/attachments/${attachment.channel.toString()}/${attachment._id}/${attachment.filename}?ex=${attachment.extension}&format=${attachment.format}`,
                _id: attachment._id,
                height: attachment.height,
                width: attachment.width,
                format: attachment.format
            }
        } )

        const updatedMessageObject = updatedMessage.toObject()
        updatedMessageObject.attachments = newUpdatedMessageAttachments

        if (!updatedMessage) return res.status(404).send('Message not found')

        req.io.to(`channel:${channelId}`).emit('MESSAGE_UPDATE', updatedMessageObject)

        res.status(200).json( updatedMessageObject )
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})


function hasFileFormat(filename) {
    var formatRegex = /^[^.]+(\.[^.]+)?$/;

    return formatRegex.test(filename);
}


function isValidUuidFormat(uuid) {
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    return uuidRegex.test(uuid);
}

function uuidv4() {
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    )
}

// request attachment
router.post('/:channelId/attachments', authJwt, async (req, res) => {
    try {
        const { channelId } = req.params
        if (!db.mongoose.Types.ObjectId.isValid(channelId)) return res.status(400).json({ message: 'Invalid channel id' })

        const channelExists = await Channel.exists({_id: channelId})
        if(!channelExists) return res.status(400).json({ message: 'Nhannel not found.' })

        const { files } = req.body
        if( !Array.isArray(files) ) return res.status(400).json({ message: 'No files found.' })

        const filteredFiles = files.filter( file => typeof file === 'object' )
        if(!filteredFiles.length) return res.status(400).json({ message: 'No files found.' })

        const resultFiles = []
        for( const file of files ) {
            let uniqueUUID = false
            let newUUID

            while (!uniqueUUID) {
                newUUID = uuidv4()

                const existingDocument = await Attachment.exists({ uuid: newUUID })
                if (!existingDocument) uniqueUUID = true
            }

            const upload_filename = `${newUUID}/${file.filename}`

            const newAttachment = await Attachment.create( {
                filename: file.filename,
                uuid: newUUID,
                size: file.size,
                uploader: req.user._id,
                channel: channelId
            } )

            // files storage mangment logic here
            const upload_url = `https://discord-dupe.onrender.com/channels/attachments-uploads/${upload_filename}?upload_id=${newAttachment._id.toString()}`
            //const upload_url = `http://localhost:3001/channels/attachments-uploads/${upload_filename}?upload_id=${newAttachment._id.toString()}`


            const fileObj = {
                upload_url,
                upload_filename,
                id: file.id
            }

            resultFiles.push(fileObj)
        }


        res.status(200).send({ attachments: resultFiles })
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

function getMagicNumber(buffer, bytesToRead = 4) {
    const hexString = buffer.slice(0, bytesToRead).toString('hex');
    return hexString;
}

async function getImageSize(fileContent) {
    try {
        const { width, height } = await sharp(fileContent).metadata();
        return { width, height }
    } catch (error) {
        console.error('Error getting image size:', error);
        return null;
    }
}

router.put('/attachments-uploads/:uuid/:filename', authJwt, async (req, res) => {
    try {
        const fileContent = req.body
        const { upload_id } = req.query
        const { uuid, filename } = req.params

        if (req.aborted) return res.status(400).send('Request aborted by the client.')

        if (!fileContent || !uuid || !filename ) return res.status(400).send('No file content provided.')

        if( !isValidUuidFormat(uuid) ) return res.status(400).json({ message: 'Invalid upload data' })

        if (!db.mongoose.Types.ObjectId.isValid(upload_id)) return res.status(400).json({ message: 'Invalid upload id' })

        const attachment = await Attachment.findOne({_id: upload_id, uuid, filename})

        if( attachment.filePath ) return res.status(400).json({ message: 'Invalid upload data' })

        if( !attachment ) return res.status(400).json({ message: 'Invalid upload data' })

        const magicNumber = getMagicNumber(fileContent)

        const fileInfo = await FileType.fromBuffer(fileContent)
        if (!fileInfo) return res.status(400).json({ message: 'Unable to determine file format.' })
    
        const fileFormat = fileInfo.ext
        const fileMime = fileInfo.mime

        if( !fileMime.startsWith('image') ) {
            await Attachment.findOneAndDelete({_id: attachment._id})
            return res.status(400).json({ message: 'Unsupported file type (coming soon).' })
        }

        const fileSize = Buffer.byteLength(fileContent, 'utf8')
    
        const fileDirectory = './media/attachments'
        if (!fs.existsSync(fileDirectory)) fs.mkdirSync(fileDirectory, { recursive: true })

        const filePath = `./media/attachments/${uuid}-${filename}`
        fs.writeFileSync(filePath, fileContent)

        await Attachment.findOneAndUpdate( {_id: upload_id}, {
            filePath: `${uuid}-${filename}`,
            format: fileFormat,
            content_type: fileMime,
            extension: magicNumber,
            size: fileSize
        } )

        if (fileMime.startsWith('image')) {
            const imageSizes = await getImageSize(fileContent)

            await Attachment.findOneAndUpdate( {_id: upload_id}, {
                height: imageSizes.height,
                width: imageSizes.width
            } )
        }
    
        res.status(200).end()
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})


module.exports = router