const express = require('express')
const router = express.Router()

const { authJwt } = require('../middlewares')
const { sendToAllUserIds } = require('../sockets/helpers')

const db = require("../models")
const Channel = db.channel
const User = db.user
const Guild = db.guild

// get user info
router.get( '/@me', authJwt, (req, res) => {
    res.status(200).send(req.user)
} )

// add reputation to user
router.put('/:accountId/reputations', authJwt, async (req, res) => {
    try {
        const { accountId } = req.params
        const userId = req.user._id.toString()

        if( userId === accountId ) return res.status(404).json({ message: "You can't add reputution to yourself" })

        if (!db.mongoose.Types.ObjectId.isValid(accountId)) return res.status(400).json({ message: 'Invalid account id' })
        const account = await User.findById(accountId)
        if(!account) return res.status(404).json({ message: 'Account not found' })
        const user = await User.findById(userId)

        if( !account.reputations.find( r => r.user?.toString() === userId ) && user.givenReputations.includes( accountId ) ) {
            user.givenReputations = user.givenReputations.filter( id => id.toString() !== accountId )
            await user.save()
        }

        account.reputations = account.reputations.filter( r => r.reason && r.user )

        if( account.reputations.find( r => r.user?.toString() === userId ) ) {
            account.reputations = account.reputations.filter( r => r.user.toString() !== userId )
            account.reputationsCount = account.reputations.length
            user.givenReputations = user.givenReputations.filter( id => id.toString() !== accountId )
        } else {
            const { reason } = req.body
            if( !reason || typeof reason !== "string" || reason.length < 3 ) return res.status(404).json({ message: "Enter a valid reason" })

            const repObject = {
                user: userId,
                reason: reason
            }

            account.reputations.addToSet( repObject )
            account.reputationsCount = account.reputations.length
            user.givenReputations.addToSet( accountId )
        }
        await account.save()
        await user.save()

        sendToAllUserIds(req.io, [accountId], 'REPUTATION_UPDATE', {userId: accountId, reputations: account.reputations})
        req.io.emit('REPUTATION_UPDATE', {userId: accountId, reputationsCount: account.reputations.length})

        res.status(200).json({givenReputations: user.givenReputations})
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

// add vouch to user
router.put('/:accountId/vouches', authJwt, async (req, res) => {
    try {
        const { reason } = req.body
        if( !reason || typeof reason !== "string" || reason.length < 3 ) return res.status(404).json({ message: "Enter a valid reason" })
    
        const { accountId } = req.params
        const userId = req.user._id.toString()

        if( userId === accountId ) return res.status(404).json({ message: "You can't add reputution to yourself" })

        if (!db.mongoose.Types.ObjectId.isValid(accountId)) return res.status(400).json({ message: 'Invalid account id' })
        const account = await User.findById(accountId)
        if(!account) return res.status(404).json({ message: 'Account not found' })
        const user = await User.findById(userId)

        account.vouches = account.vouches.filter( v => v.reason && v.user )

        if( account.vouches.find( v => v.user?.toString() === userId ) ) return res.status(404).json({ message: 'Already vouched for account' })

        const vouchObject = {
            user: userId,
            reason: reason
        }

        account.vouches.addToSet( vouchObject )
        account.vouchesCount = account.vouches.length
        user.givenVouches.addToSet( accountId )
        
        await account.save()
        await user.save()

        sendToAllUserIds(req.io, [accountId], 'VOUCH_UPDATE', {userId: accountId, vouches: account.vouches})
        req.io.emit('VOUCH_UPDATE', {userId: accountId, vouchesCount: account.vouches.length})

        res.status(200).json({givenVouches: user.givenVouches})
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

// get user profile
router.get( '/:profileId/profile', authJwt, async (req, res) => {
    try {
        const userId = req.user._id.toString()
        const { profileId } = req.params
        const { with_mutual_guilds, with_mutual_friends_count } = req.query
        if (!db.mongoose.Types.ObjectId.isValid(profileId)) return res.status(400).json({ message: 'Invalid profile id' })

        const profile = await User.findById(profileId).select('avatar username discriminator status createdAt vouchesCount reputationsCount')
        if(!profile) return res.status(404).json({ message: 'Profile not found' })

        const result = {
            user: profile,
        }

        if( with_mutual_guilds ) {
            mutual_guilds = await Guild.find( {
                members: { $all: [userId, profileId] }
            } ).select('_id')

            result.mutual_guilds = mutual_guilds
        }
        if( with_mutual_friends_count ) {
            const mutual_friends = await User.find({
                friends: { $all: [userId, profileId] }
            }).select('_id')

            result.mutual_friends = mutual_friends.map( mf => mf._id )
            result.mutual_friends_count = mutual_friends.length
        }

        res.status(200).json(result)

    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
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
            .populate({
                path: 'channels',
                select: 'name type topic parent position messages',
                populate: {
                    path: 'messages',
                    select: 'content channel author attachments embeds reactions pinned editedTimestamp deleted deletedTimestamp createdAt',
                    populate: {
                        path: 'hasReply',
                        select: 'content author'
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

// get global users
router.get('/@me/globalUsers', authJwt, async (req, res) => {
    try {
        const userId = req.user._id.toString()
        const user = await User.findById(userId)
            .select('friends sentFriendRequests pendingFriendRequests')
            .populate([
                { path: 'guilds', select: 'members' },
                { path: 'channels', select: 'participants' }
            ])
            .lean()
            .exec()


        const fullGuildsMembers = user.guilds.flatMap( g => g.members )
        const fullChannelsParticipants = user.channels.flatMap( c => c.participants )

        const fullRelatedUsers = [
            ...user.friends,
            ...user.sentFriendRequests || [],
            ...user.pendingFriendRequests || [],
            ...fullGuildsMembers,
            ...fullChannelsParticipants
        ].map( id => id.toString() )//.filter( id => id !== userId )

        const UsersToSet = new Set(fullRelatedUsers)
        
        const resultPromises = Array.from(UsersToSet).map( globalUserId => {
            return User.findById(globalUserId).select('avatar username discriminator status customStatus createdAt vouchesCount reputationsCount')
        } )
        
        const globalUsers = await Promise.all(resultPromises)

        for( const globalUser of globalUsers ) {
            if( globalUser.customStatus.status ) {
                globalUser.status = globalUser.customStatus.status
            }
            //globalUser.set('customStatus', undefined, { strict: false })
        }

        res.status(200).json(globalUsers)
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

// get user direct messages
router.get( '/@me/channels', (req, res) => {
    Guild.find({})
        .then( guild => {
            res.status(200).send(guild)
        } )
        .catch( err => res.status(500).send( { message: err } ) )
} )

// create user channel
router.post( '/@me/channels', authJwt, async (req, res) => {
    try {
        const { participants } = req.body
        if( !Array.isArray(participants) ) return res.status(404).send({ message: 'Participants list not found'})

        if( participants.length ) {
            const participantsValid = participants.some( participantId => db.mongoose.Types.ObjectId.isValid(participantId) )
            if( !participantsValid ) return res.status(404).send({ message: 'Participant not valid id'})
        }

        if( participants.length > 10 ) return res.status(403).send({ message: 'Groups can only go up to 10 participants.'})

        const userId = req.user._id.toString()
        const user = await User.findById(userId)

        if( participants.length === 1 ) {
            let channelId
            const receiverId = participants[0]
            const receiver = await User.findById(receiverId)
            if( !receiver ) return res.status(404).send({ message: 'User not found'})

            const dmChannel = await Channel.exists({
                participants: {
                    $all: [userId, receiverId], $size: 2
                },
                isGroup: false
            })
    
            if (!dmChannel) {
                const newDMChannel = await Channel.create({
                    type: 'dm',
                    position: 0,
                    participants: [
                        receiverId,
                        userId 
                    ],
                    permissions: [{
                        _type: 1,
                        allow: 70508330735680,
                        deny: 0,
                        id: receiverId
                    },
                    {
                        _type: 1,
                        allow: 70508330735680,
                        deny: 0,
                        id: userId
                    }]
                })

                channelId = newDMChannel._id.toString()
    
                receiver.channels.addToSet(newDMChannel._id)
                user.channels.addToSet(newDMChannel._id)
        
                await user.save()
                await receiver.save()
    
                const populatedDMChannel = await Channel.findById(newDMChannel._id)
                    .populate({
                        path: 'messages',
                        select: 'content channel author attachments embeds reactions pinned editedTimestamp deleted deletedTimestamp createdAt'
                    })

                const usersRecievedChannel = [userId, receiverId]
    
                sendToAllUserIds(req.io, usersRecievedChannel, 'CHANNEL_CREATE', populatedDMChannel)
            } else {
                channelId = dmChannel._id.toString()
                
                const usersRecievedChannel = []
                if( !user.channels.includes(dmChannel._id.toString()) ) {
                    user.channels.addToSet(dmChannel._id)
                    await user.save()
                    usersRecievedChannel.push( userId )
                }
    
                if( usersRecievedChannel.length ) {
                    const populatedDMChannel = await Channel.findById(dmChannel._id)
                        .populate({
                            path: 'messages',
                            select: 'content channel author attachments embeds reactions pinned editedTimestamp deleted deletedTimestamp createdAt'
                        })
        
                    sendToAllUserIds(req.io, usersRecievedChannel, 'CHANNEL_CREATE', populatedDMChannel)
                }
            }
            return res.status(200).json({ message: 'Dm channel created successfully', channel: channelId })
        }

        const channelParticipants = [userId, ...participants]
        const permissions = participants.map( participant => {
            return {
                _type: 1,
                allow: 70508330735680,
                deny: 0,
                id: participant
            }
        } )

        const newGroupDMChannel = await Channel.create({
            type: 'dm',
            position: 0,
            participants: channelParticipants,
            permissions,
            owner: userId,
            isGroup: true
        })

        let newChannelName = `${user.username}'s Group`

        if( participants.length ) {
            const participantNames = []
            const participantPromises = channelParticipants.map(async participant => {
                const participantDoc = await User.findById(participant)
                participantNames.push( participantDoc.username )
                participantDoc.channels.addToSet(newGroupDMChannel._id)
                return participantDoc.save()
            })

            await Promise.all(participantPromises)
            newChannelName = participantNames.join(', ').slice(0, 100)
        }

        newGroupDMChannel.name = newChannelName
        await newGroupDMChannel.save()
          
        user.channels.addToSet(newGroupDMChannel._id)
        await user.save()

        const populatedGroupDMChannel = await Channel.findById(newGroupDMChannel._id)
            .populate({
                path: 'messages',
                select: 'content channel author attachments embeds reactions pinned editedTimestamp deleted deletedTimestamp createdAt'
            })

        sendToAllUserIds(req.io, channelParticipants, 'CHANNEL_CREATE', populatedGroupDMChannel)
        res.status(200).json({ message: 'Group DM channel created successfully', channel: newGroupDMChannel._id.toString() })
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
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

        const userId = user?._id?.toString()
    
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
                user: senderId,
                target: userId,
                actionType: 'ADD_FRIEND'
            }

            const addFriendUserIds = [senderId, userId]

            sendToAllUserIds(req.io, addFriendUserIds, 'FRIEND_ACTION', addFriendData)

            const dmChannel = await Channel.exists({
                participants: { $all: [userId, senderId] }
            })

            if (!dmChannel) {
                const newDMChannel = await Channel.create({
                    type: 'dm',
                    position: 0,
                    participants: [
                        userId,
                        senderId
                    ],
                    permissions: [{
                        _type: 1,
                        allow: 70508330735680,
                        deny: 0,
                        id: userId
                    },
                    {
                        _type: 1,
                        allow: 70508330735680,
                        deny: 0,
                        id: senderId
                    }]
                })
    
                user.channels.addToSet(newDMChannel._id)
                sender.channels.addToSet(newDMChannel._id)
        
                await sender.save()
                await user.save()
    
                const populatedDMChannel = await Channel.findById(newDMChannel._id)
    
                sendToAllUserIds(req.io, addFriendUserIds, 'CHANNEL_CREATE', populatedDMChannel)
            }
    
            return res.status(200).json({ message: 'Friend added successfully' })
        }
    

        const senderRequestAdded = sender.sentFriendRequests.addToSet(userId)
        await sender.save()
        
        const userRequestAdded = user.pendingFriendRequests.addToSet(senderId)
        await user.save()

        const sendRequestData = {
            user: senderId,
            target: userId,
            actionType: 'SEND_REQUEST'
        }

        const sendRequestUserIds = []

        if( senderRequestAdded.length ) sendRequestUserIds.push( senderId )
        if( userRequestAdded.length ) sendRequestUserIds.push( userId )

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
            user: senderId,
            target: receiverId,
            actionType: 'ADD_FRIEND'
        }

        const addFriendUserIds = [senderId, receiverId]

        sendToAllUserIds(req.io, addFriendUserIds, 'FRIEND_ACTION', addFriendData)

        const dmChannel = await Channel.exists({
            participants: {
                $all: [receiverId, senderId]
            },
            isGroup: false
        })

        if (!dmChannel) {
            const newDMChannel = await Channel.create({
                type: 'dm',
                position: 0,
                participants: [
                    receiverId,
                    senderId 
                ],
                permissions: [{
                    _type: 1,
                    allow: 70508330735680,
                    deny: 0,
                    id: receiverId
                },
                {
                    _type: 1,
                    allow: 70508330735680,
                    deny: 0,
                    id: senderId
                }]
            })

            receiver.channels.addToSet(newDMChannel._id)
            sender.channels.addToSet(newDMChannel._id)
    
            await sender.save()
            await receiver.save()

            const populatedDMChannel = await Channel.findById(newDMChannel._id)
                .populate([{
                    path: 'messages',
                    select: 'content channel author attachments embeds reactions pinned editedTimestamp deleted deletedTimestamp createdAt'
                }])

            sendToAllUserIds(req.io, addFriendUserIds, 'CHANNEL_CREATE', populatedDMChannel)
        } else {
            const usersRecievedChannel = []
            if( !sender.channels.includes(dmChannel._id.toString()) ) {
                sender.channels.addToSet(dmChannel._id)
                await sender.save()
                usersRecievedChannel.push( sender._id.toString() )
            }

            if( !receiver.channels.includes(dmChannel._id.toString()) ) {
                receiver.channels.addToSet(dmChannel._id)
                await receiver.save()
                usersRecievedChannel.push( receiver._id.toString() )
            }

            const populatedDMChannel = await Channel.findById(dmChannel._id)
                .populate([{
                    path: 'messages',
                    select: 'content channel author attachments embeds reactions pinned editedTimestamp deleted deletedTimestamp createdAt'
                }])

            sendToAllUserIds(req.io, usersRecievedChannel, 'CHANNEL_CREATE', populatedDMChannel)
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