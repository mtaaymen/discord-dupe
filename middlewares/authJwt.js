const jwt = require('jsonwebtoken')
const config = require('../config')
const db = require('../models')
const User = db.user

const authJwt = async (req, res, next) => {
    try {
        const token = req.headers.authorization.split(' ')[1]
        const decodedToken = jwt.verify(token, config.JWT_SECRET)
        const user = await User.findById(decodedToken.userId)
            .select('avatar version blockedUsers createdAt username discriminator guilds dob email friends mutedChannels mutedServers pendingFriendRequests sentFriendRequests phone status reputations givenReputations vouches givenVouches')
            .populate({
                path: 'channels',
                select: 'owner name messages isGroup participants permissions type server',
                populate: [{
                    path: 'messages',
                    select: 'content channel author attachments embeds reactions pinned editedTimestamp deleted deletedTimestamp createdAt',
                    populate: {
                        path: 'hasReply',
                        select: 'content author'
                    }
                }]
            })

        /*user.channels = user.channels.filter( channel => {
            const userParticipant = channel.participants.find( participant => {
                return participant.user._id.toString() === decodedToken.userId
            })
          
            if (userParticipant && userParticipant.isVisible === false) {
                return false
            }
            
            return true
        })*/

        if( !user.channels ) {
            user.channels = []
            await user.save()
        }
        
        /*for ( const channel of user.channels ) {
            for( const participant of channel.participants ) {
                if( participant.customStatus.status ) {
                    participant.status = participant.customStatus.status
                }
            }
        }*/

        /*for( const friend of user.friends ) {
            if( friend.customStatus.status ) {
                friend.status = friend.customStatus.status
            }
        }*/

        if (!user) return res.status(404).json({ message: 'User not found' })
        if( decodedToken.version !== user.version ) return res.status(401).json({ message: 'Token outdated' })
        req.user = user
        next()
    } catch (error) {
        console.log( error )
        res.status(401).json({ message: 'Invalid token' })
    }
}



module.exports = authJwt