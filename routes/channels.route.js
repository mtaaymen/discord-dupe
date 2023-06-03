const express = require('express')
const router = express.Router()

const { authJwt } = require('../middlewares')
const { checkChannelPermissions } = require('../services')
const { unsubscribeAllUsers, sendToAllUserIds } = require('../sockets/helpers')

const db = require("../models")
const Guild = db.guild
const User = db.user
const Channel = db.channel
const Role = db.role
const Invite = db.invite
const Message = db.message

//get channel by id
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

        // retrieve the updated channel object
        const updatedChannel = await Channel.findById(channelId)
            .select('owner name messages isGroup participants permissions')
            .populate([{
                path: 'messages',
                select: 'content channel author attachments embeds reactions pinned editedTimestamp deleted deletedTimestamp createdAt',
                populate: {
                    path: 'hasReply',
                    select: 'content author'
                }
            }])

        if( updatedChannel.server ) {
            req.io.to(`guild:${updatedChannel.server}`).emit('CHANNEL_UPDATE', updatedChannel)
        } else {
            req.io.to(`channel:${updatedChannel._id.toString()}`).emit('CHANNEL_UPDATE', updatedChannel)

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
                    allow: 70508330735680,
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


        res.status(200)
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

        if( !channel.server ) {
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
        if (server.channels.length === 1) {
            return res.status(400).json({ message: 'Cannot delete last channel in server' })
        }

        const inviteExists = await Invite.exists( { channel: channelId, guild: guildId } )
        if( inviteExists ) {
            let firstChannelId

            for (let i = 0; i < server.channels.length; i++) {
                if (server.channels[i]._id.toString() !== channelId) {
                    firstChannelId = server.channels[i]._id.toString()
                    break
                }
            }

            await Invite.updateMany({ channel: channelId, guild: guildId }, { channel: firstChannelId })
        }

        // delete the channel
        await Channel.findByIdAndDelete(channelId)
        await Message.deleteMany({ server: guildId })

        // remove the channel ID from the server's channels array
        server.updateOne(guildId, {
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

//get channel messages list
router.get('/:channel/messages', async (req, res) => {
    try {
        const channelId = req.params.channel
        const { limit } = req.query
    
        // retrieve the channel object with populated messages
        const channel = await Channel.findById(channelId).populate({
            path: 'messages',
            options: {
                limit: parseInt(limit) || undefined // limit is optional and defaults to undefined
            }
        })
    
        res.status(200).json({ messages: channel.messages })
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' })
    }
})

//get channel message by id
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

//create message
router.post('/:channelId/messages', authJwt, async (req, res) => {
    try {
        const { content, hasReply, toUser } = req.body
        let { channelId } = req.params
        const authorId = req.user._id.toString()
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
                    permissions: [{
                        _type: 1,
                        allow: 70508330735680,
                        deny: 0,
                        id: authorId
                    }, {
                        _type: 1,
                        allow: 70508330735680,
                        deny: 0,
                        id: channelId
                    }]
                })

                user.channels.addToSet(channel._id)
                receiver.channels.addToSet(channel._id)

                await user.save()
                await receiver.save()

                const populatedDMChannel = await Channel.findById(channel._id)
                    .populate([{
                        path: 'messages',
                        select: 'content channel author attachments embeds reactions pinned editedTimestamp deleted deletedTimestamp createdAt',
                        populate: {
                            path: 'hasReply',
                            select: 'content author'
                        }
                    }])

                const usersRecievedChannel = [authorId, channelId]
                sendToAllUserIds(req.io, usersRecievedChannel, 'CHANNEL_CREATE', populatedDMChannel)
            }
        } else {
            channel = await Channel.findById(channelId)
                .populate('server', '_id')
        }

        if( !channel ) return res.status(404).send({ message: 'Channel not found'})
        channelId = channel._id.toString()

        const requiredPermissions = ['SEND_MESSAGES']
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
                    .populate({
                        path: 'messages',
                        select: 'content channel author attachments embeds reactions pinned editedTimestamp deleted deletedTimestamp createdAt',
                        populate: {
                            path: 'hasReply',
                            select: 'content author'
                        }
                    })

                sendToAllUserIds(req.io, usersRecievedChannel, 'CHANNEL_CREATE', populatedDMChannel)
            }
        }

 
        const message = await Message.create({
            content,
            author: authorId,
            channel: channelId,
            hasReply,
            ...(channel?.server && { server: channel.server._id.toString() }),
            type: 0
        })
    


        // Add the message to the channel's messages array
        await channel.updateOne({ $push: { messages: message._id } })
        
    
        // Populate the message object with the author's username and the channel's name
        const populatedMessage = await Message.findById(message._id)
            .populate({
                path: 'hasReply',
                select: 'content author'
            })

        req.io.to(`channel:${channelId}`).emit('MESSAGE_CREATE', populatedMessage)
        
        // Send the populated message object in the response
        res.status(201).json(populatedMessage)
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

//delete messsage
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
            const requiredPermissions = ['MANAGE_MESSAGES']
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

        // update the channel
        const updatedMessage = await Message.findByIdAndUpdate(messageId, { ...updates, editedTimestamp: Date.now() }, { new: true }).populate({
            path: 'hasReply',
            select: 'content author'
        })

        if (!updatedMessage) return res.status(404).send('Message not found')

        req.io.to(`channel:${channelId}`).emit('MESSAGE_UPDATE', updatedMessage)

        res.status(200).json( updatedMessage )
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})


module.exports = router