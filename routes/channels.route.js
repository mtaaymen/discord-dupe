const express = require('express')
const router = express.Router()

const { authJwt } = require('../middlewares')
const { unsubscribeAllUsers } = require('../sockets/helpers')

const db = require("../models")
const Guild = db.guild
const Channel = db.channel
const Role = db.role
const Invite = db.invite
const Message = db.message

// edit channel
router.patch('/:channel', async (req, res) => {
    try {
        const channelId = req.params.channel

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
        .select('name server type topic parent position permissionOverwrites messages')
        .populate({
            path: 'messages',
            select: 'content channel author attachments embeds reactions pinned editedTimestamp deleted deletedTimestamp createdAt',
            populate: {
                path: 'author',
                select: 'avatar username discriminator avatar status'
            }
        })

        req.io.to(`guild:${updatedChannel.server}`).emit('CHANNEL_UPDATE', updatedChannel)

        res.status(200).json( updatedChannel )
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

// delete channel
router.delete('/:channel', async (req, res) => {
    try {
        const channelId = req.params.channel

        // find the channel and its server
        const channel = await Channel.findById(channelId)
        const guildId = channel.server.toString()
        const server = await Guild.findById(guildId).populate('channels')

        // ensure the server has at least one channel
        if (server.channels.length === 1) {
            return res.status(400).json({ message: 'Cannot delete last channel in server' });
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
        const { content } = req.body
        const { channelId } = req.params
        const authorId = req.user._id

        const channel = await Channel.findById(channelId).populate('server', '_id')

        // Create a new message object with the provided data
        const message = new Message({
            content,
            author: authorId,
            channel: channelId,
            ...(channel?.server && { server: channel.server._id.toString() })
        })

    
        // Save the message to the database
        await message.save()

        // Add the message to the channel's messages array
        await channel.updateOne({ $push: { messages: message._id } })
    
        // Populate the message object with the author's username and the channel's name
        const populatedMessage = await Message.findById(message._id).populate('author', 'username')

        req.io.to(`channel:${channelId}`).emit('MESSAGE_CREATE', populatedMessage)
    
        // Send the populated message object in the response
        res.status(201).json(populatedMessage)
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

//delete messsage
router.delete('/:channelId/messages/:messageId', async (req, res) => {
    try {
        const { channelId, messageId } = req.params

        // find the channel
        const channel = await Channel.findById(channelId)

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
router.patch('/:channelId/messages/:messageId', async (req, res) => {
    try {
        const { content } = req.body
        const { channelId, messageId } = req.params

        const updates = {
            content
        }

        // update the channel
        const updatedMessage = await Message.findByIdAndUpdate(messageId, { ...updates, editedTimestamp: Date.now() }, { new: true }).populate('author', 'username')
        if (!updatedMessage) return res.status(404).send('Message not found')

        req.io.to(`channel:${channelId}`).emit('MESSAGE_UPDATE', updatedMessage)

        res.status(200).json( updatedMessage )
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})


module.exports = router