const express = require('express')
const router = express.Router()

const { authJwt } = require('../middlewares')
const { sendToAllUserIds } = require('../sockets/helpers')

const db = require("../models")
const Channel = db.channel
const User = db.user
const Guild = db.guild
const DMChannel = db.dmChannel

// get user info
router.get( '/@me', authJwt, (req, res) => {
    res.status(200).send(req.user)
} )

// get user guilds
router.get( '/@me/guilds', authJwt, async (req, res) => {
    try {
        const guilds = await Guild.find({ members: req.user._id })
            .populate({
                path: 'invites',
                populate: { path: 'inviter', select: 'avatar username discriminator avatar status' }
            })
            .populate({
                path: 'invites',
                populate: { path: 'channel', select: 'name' }
            })
            .populate({
                path: 'invites',
                populate: { path: 'guild', select: 'name' }
            })
            .populate({ path: 'owner', select: 'avatar username discriminator status customStatus' })
            .populate({ path: 'members', select: 'avatar username discriminator status customStatus' })
            .populate({
                path: 'channels',
                select: 'name type topic parent position permissionOverwrites messages',
                populate: {
                    path: 'messages',
                    select: 'content channel author attachments embeds reactions pinned editedTimestamp deleted deletedTimestamp createdAt',
                    populate: {
                        path: 'author',
                        select: 'avatar username discriminator status'
                    }
                }
            })
            .exec()

        res.status(200).send(guilds)
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
} )

// get user direct messages
router.get( '/@me/channels', (req, res) => {
    Guild.find({})
        .then( guild => {
            res.status(200).send(guild)
        } )
        .catch( err => res.status(500).send( { message: err } ) )
} )

// add friend
router.post('/@me/relationships', authJwt, async (req, res) => {
    try {
        const { username, discriminator } = req.body
        const senderId = req.user._id.toString()
    
        const [sender, user] = await Promise.all([
            User.findById(senderId),
            User.findOne({ username, discriminator }),
        ])

        const userId = user._id.toString()
    
        if (!user || !sender) return res.status(404).send({ message: 'User not found'})
        if (userId === senderId.toString()) return res.status(404).send({ message: 'User not found'})
        if (user.friends.includes(senderId) && sender.friends.includes(userId)) return res.status(200).send({ message: 'Already friends'})
    
        if (user.sentFriendRequests.includes(senderId)) {

            user.friends.addToSet(senderId)
            user.sentFriendRequests.pull(senderId)
            await user.save()
    
            sender.friends.addToSet(userId)
            await sender.save()

            const addFriendData = {
                user: {
                    _id: senderId,
                    avatar: sender.avatar,
                    username: sender.username,
                    discriminator: sender.discriminator,
                    status: sender.customStatus.status ? sender.customStatus.status : sender.status
                },
                target: {
                    _id: userId,
                    avatar: user.avatar,
                    username: user.username,
                    discriminator: user.discriminator,
                    status: user.customStatus.status ? user.customStatus.status : user.status
                },
                actionType: 'ADD_FRIEND'
            }

            const addFriendUserIds = [senderId, userId]

            sendToAllUserIds(req.io, addFriendUserIds, 'FRIEND_ACTION', addFriendData)

            const dmChannel = await Channel.exists({
                'participants.user': { $all: [userId, senderId] }
            })

            if (!dmChannel) {
                const newDMChannel = new Channel({
                    type: 'dm',
                    position: 0,
                    participants: [
                        { user: userId },
                        { user: senderId }
                    ],
                    messages: []
                })
                await newDMChannel.save()
    
                user.channels.addToSet(newDMChannel._id)
                sender.channels.addToSet(newDMChannel._id)
        
                await sender.save()
                await user.save()
    
                const populatedDMChannel = await Channel.findById(newDMChannel._id)
                    .populate({
                        path: 'participants.user',
                        select: 'avatar username discriminator status customStatus'
                    })
    
                for( const participant of populatedDMChannel.participants ) {
                    if( participant.user.customStatus.status ) {
                        participant.user.status = participant.user.customStatus.status
                    }
                }
    
                sendToAllUserIds(req.io, addFriendUserIds, 'CHANNEL_CREATE', populatedDMChannel)
            }
    
            return res.status(200).json({ message: 'Friend added successfully' })
        }
    

        sender.sentFriendRequests.addToSet(userId)
        await sender.save()
        
        user.pendingFriendRequests.addToSet(senderId)
        await user.save()

        const sendRequestData = {
            user: {
                _id: senderId,
                avatar: sender.avatar,
                username: sender.username,
                discriminator: sender.discriminator,
                status: sender.customStatus.status ? sender.customStatus.status : sender.status
            },
            target: {
                _id: userId,
                avatar: user.avatar,
                username: user.username,
                discriminator: user.discriminator,
                status: user.customStatus.status ? user.customStatus.status : user.status
            },
            actionType: 'SEND_REQUEST'
        }

        const sendRequestUserIds = [ senderId, userId ]

        sendToAllUserIds(req.io, sendRequestUserIds, 'FRIEND_ACTION', sendRequestData)
    
        return res.status(200).json({ message: 'Friend request sent successfully' })
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' })
    }
})

// remove friend
router.delete('/@me/relationships/:friendId', authJwt, async (req, res) => {
    try {
        const friendId = req.params.friendId
        const userId = req.user._id.toString()

        const [user, friend] = await Promise.all([
            User.findById(userId),
            User.findById(friendId)
        ])
    
        if (!user || !friend) {
            return res.status(404).json({ message: 'User not found' })
        }
    
        // Check if friendId is in friends array
        if (!user.friends.includes(friendId) && !friend.friends.includes(userId)) {
            return res.status(400).json({ message: 'Friend not found' })
        }
    

        user.friends.pull(friendId)
        await user.save()
    
        friend.friends.pull(userId)
        await friend.save()


        const removeFriendData = {
            user: userId,
            target: friendId,
            actionType: 'REMOVE_FRIEND'
        }

        const removeFriendUserIds = [userId, friendId]

        sendToAllUserIds(req.io, removeFriendUserIds, 'FRIEND_ACTION', removeFriendData)
    
        return res.status(200).json({ message: 'Friend removed successfully' })
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})
  


// accept friend request
router.put('/@me/relationships/:senderId/accept', authJwt, async (req, res) => {
    try {
        const senderId = req.params.senderId
        const receiverId = req.user._id.toString()

        const [sender, receiver] = await Promise.all([
            User.findById(senderId),
            User.findById(receiverId),
        ])

        if (!sender || !receiver) return res.status(404).json({ message: 'User not found' })

        if (!receiver.pendingFriendRequests.includes(senderId)) return res.status(400).json({ message: 'Friend request not found' })
        

        sender.friends.addToSet(receiverId)
        sender.sentFriendRequests.pull(receiverId)
        await sender.save()

        receiver.friends.addToSet(senderId)
        receiver.pendingFriendRequests.pull(senderId)
        await receiver.save()

        const addFriendData = {
            user: {
                _id: senderId,
                avatar: sender.avatar,
                username: sender.username,
                discriminator: sender.discriminator,
                status: sender.customStatus.status ? sender.customStatus.status : sender.status
            },
            target: {
                _id: receiverId,
                avatar: receiver.avatar,
                username: receiver.username,
                discriminator: receiver.discriminator,
                status: receiver.customStatus.status ? receiver.customStatus.status : receiver.status
            },
            actionType: 'ADD_FRIEND'
        }

        const addFriendUserIds = [senderId, receiverId]

        sendToAllUserIds(req.io, addFriendUserIds, 'FRIEND_ACTION', addFriendData)

        const dmChannel = await Channel.exists({
            'participants.user': {
                $all: [receiverId, senderId]
            },
            isGroup: false
        })

        if (!dmChannel) {
            const newDMChannel = new Channel({
                type: 'dm',
                position: 0,
                participants: [
                    { user: receiverId },
                    { user: senderId }
                ],
                messages: []
            })
            await newDMChannel.save()

            receiver.channels.addToSet(newDMChannel._id)
            sender.channels.addToSet(newDMChannel._id)
    
            await sender.save()
            await receiver.save()

            const populatedDMChannel = await Channel.findOne({
                'participants.user': {
                    $all: [receiverId, senderId]
                },
                isGroup: false
            }).populate([{
                path: 'messages',
                select: 'content channel author attachments embeds reactions pinned editedTimestamp deleted deletedTimestamp createdAt',
                populate: {
                    path: 'author',
                    select: 'avatar username discriminator status'
                }
            }, {
                path: 'participants.user',
                select: 'avatar username discriminator status customStatus'
            }])

            for( const participant of populatedDMChannel.participants ) {
                if( participant.user.customStatus.status ) {
                    participant.user.status = participant.user.customStatus.status
                }
            }

            sendToAllUserIds(req.io, addFriendUserIds, 'CHANNEL_CREATE', populatedDMChannel)
        } else {
            const populatedDMChannel = await Channel.findById(dmChannel._id)
                .populate([{
                    path: 'messages',
                    select: 'content channel author attachments embeds reactions pinned editedTimestamp deleted deletedTimestamp createdAt',
                    populate: {
                        path: 'author',
                        select: 'avatar username discriminator status'
                    }
                }, {
                    path: 'participants.user',
                    select: 'avatar username discriminator status customStatus'
                }])

            const usersSetToVisible = []
            for( const participant of populatedDMChannel.participants ) {
                if( !participant.isVisible ) {
                    participant.isVisible = true
                    usersSetToVisible.push(participant.user._id.toString())
                }
            }
            await populatedDMChannel.save()

            for( const participant of populatedDMChannel.participants ) {
                if( participant.user.customStatus.status ) {
                    participant.user.status = participant.user.customStatus.status
                }
            }

            sendToAllUserIds(req.io, usersSetToVisible, 'CHANNEL_CREATE', populatedDMChannel)
        }

        return res.status(200).json({ message: 'Friend request accepted successfully' })
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' })
    }
})


// decline friend request
router.delete('/@me/relationships/:senderId/decline', authJwt, async (req, res) => {
    try {
        const senderId = req.params.senderId
        const userId = req.user._id.toString()
        const user = await User.findById(userId)
        const sender = await User.findById(senderId)
    
        if (!user || !sender) {
            return res.status(404).json({ message: 'User not found' })
        }
    
        // Check if senderId is in pendingFriendRequests
        if (!user.pendingFriendRequests.includes(senderId) && !sender.sentFriendRequests.includes(userId)) {
            return res.status(400).json({ message: 'Friend request not found' })
        }
    
        // Remove senderId from user's pendingFriendRequests
        user.pendingFriendRequests.pull(senderId)
        await user.save()
    
        // Remove userId from sender's sentFriendRequests
        sender.sentFriendRequests.pull(userId)
        await sender.save()

        const removeRequestData = {
            user: userId,
            target: senderId,
            actionType: 'REMOVE_REQUEST'
        }
        const removeRequestUserIds = [senderId, userId]

        sendToAllUserIds(req.io, removeRequestUserIds, 'FRIEND_ACTION', removeRequestData)
    
        return res.status(200).json({ message: 'Friend request declined successfully' })
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

// cancel friend request
router.delete('/@me/relationships/:recipientId/cancel', authJwt, async (req, res) => {
    try {
        const recipientId = req.params.recipientId
        const userId = req.user._id.toString()
        const user = await User.findById(userId)
        const recipient = await User.findById(recipientId)
    
        if (!user || !recipient) {
            return res.status(404).json({ message: 'User not found' })
        }
    
        // Check if recipientId is in sentFriendRequests
        if (!user.sentFriendRequests.includes(recipientId) && !recipient.pendingFriendRequests.includes(userId)) {
            return res.status(400).json({ message: 'Friend request not found' })
        }
    
        // Remove recipientId from user's sentFriendRequests
        user.sentFriendRequests.pull(recipientId);
        await user.save()
    
        // Remove logged-in user's ID from recipient's pendingFriendRequests
        recipient.pendingFriendRequests.pull(userId)
        await recipient.save()

        const cancelRequestData = {
            user: userId,
            target: recipientId,
            actionType: 'REMOVE_REQUEST'
        }
        const cancelRequestUsers = [recipientId, userId]

        sendToAllUserIds(req.io, cancelRequestUsers, 'FRIEND_ACTION', cancelRequestData)
    
        return res.status(200).json({ message: 'Friend request cancelled successfully' })
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

module.exports = router