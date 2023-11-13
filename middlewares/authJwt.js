const jwt = require('jsonwebtoken')
const config = require('../config')
const db = require('../models')
const User = db.user

const authJwt = async (req, res, next) => {
    try {
        const token = req.headers.authorization.split(' ')[1]
        const decodedToken = jwt.verify(token, config.JWT_SECRET)
        const user = await User.findById(decodedToken.userId)
            .select('mfaEnabled uid avatar banner version blockedUsers createdAt username bio guilds dob email friends mutedChannels mutedServers pendingFriendRequests sentFriendRequests phone status reputations givenReputations vouches givenVouches')
            .populate({
                path: 'channels',
                select: 'owner name last_message_id lastTimestamp isGroup participants permissions type server',
            })
            .populate({ 
                path: 'badges',
                select: 'icon id description',
            })

        if( !user?.channels ) {
            user.channels = []
            await user.save()
        }

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