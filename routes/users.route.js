const express = require('express')
const router = express.Router()
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const speakeasy = require('speakeasy')
const QRCode = require('qrcode')
const fs = require('fs')

const { authJwt } = require('../middlewares')
const { sendToAllUserIds } = require('../sockets/helpers')
const { checkUserPerk } = require('../services')

const config = require('../config')
const db = require("../models")
const Channel = db.channel
const User = db.user
const Guild = db.guild
const Avatar = db.avatar
const GuildUserProfiles = db.guildUserProfiles

function validateRGBPattern(rgbString) {
    const pattern = /^(rgb|rgba)\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})(,\s*(\d+(\.\d+)?))?\)$/
    const matches = rgbString.match(pattern)
  
    if (matches) {
        const [, colorType, r, g, b, , a] = matches
        const isValidColor = r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255
  
        if (colorType === 'rgba') {
            const isValidAlpha = a >= 0 && a <= 1
            return isValidColor && isValidAlpha
        }
  
        return isValidColor
    }
  
    return false
}

function validateUsername(username) {
    if (!username) return false
    
    if (username.length < 2 || username.length > 32) return false
  
    let alphanumericRegex = /^[a-zA-Z0-9_]+$/
    if (!alphanumericRegex.test(username)) return false
    
    return true
}

function validatePassword(email, username, password) {
    if (password.length < 8) return false
    
    if (password.includes(username) || password.includes(email)) return false
    
    const containsLowercase = /[a-z]/.test(password)
    const containsNumber = /\d/.test(password)

    if (!containsLowercase || !containsNumber /*|| !containsSpecialChar*/) return false

    return true
}

function generateToken(user) {
    user.version += 1
    
    const payload = {
        userId: user._id,
        username: user.username,
        email: user.email,
        discriminator: user.discriminator,
        uid: user.uid,
        version: user.version
    }
    const token = jwt.sign(payload, config.JWT_SECRET)
    user.token = token
    user.save()
    return token
}

// get user info
router.get( '/@me', authJwt, async (req, res) => {
    try {
        await User.updateOne({_id: req.user._id}, { lastSeen: new Date() })
        res.status(200).send(req.user)
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
} )

// get auth app secret and qrCode
router.get( '/@me/mfa/secret', authJwt, async (req, res) => {
    try {
        const secret = speakeasy.generateSecret({ length: 10 })

        const otpauthURL = speakeasy.otpauthURL({
            secret: secret.ascii,
            label: `${config.APP_NAME}: ${req.user.username}`,
            issuer: config.APP_NAME,
        })

        QRCode.toDataURL(otpauthURL, (err, data_url) => {
            res.status(200).send({ secret: secret.base32, qrCode: data_url })
        })
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
} )

// enable 2fa
router.post( '/@me/mfa/totp/enable', authJwt, async (req, res) => {
    try {
        const { code, password, secret } = req.body

        const userId = req.user._id.toString()
        const user = await User.findById(userId).select('password mfa mfaEnabled')

        if( user.mfaEnabled ) return res.status(400).send({ message: "Two-factor is already enabled in this account.", password: true })

        if( !password ) return res.status(400).send({ message: "Password does not match.", password: true })

        const isMatch = await bcrypt.compare(password, user.password)
        if( !isMatch ) return res.status(400).send({ message: "Password does not match.", password: true })

        if( !secret || secret.length !== 16 ) return res.status(400).send({ message: "Invalid two-factor secret.", secret: true })
        if( !code || code.length !== 6 ) return res.status(400).send({ message: "Invalid two-factor code.", code: true })

        const verified = speakeasy.totp.verify({
            secret: secret,
            encoding: 'base32',
            token: code
        })

        if( !verified ) return res.status(400).send({ message: "Invalid two-factor code.", code: true })

        //const hashedSecret = await bcrypt.hash(secret, 10)

        await User.updateOne({_id: userId}, {
            mfaEnabled: true,
            mfa: {
                secret: secret,
                enabledAt: Date.now(),
            },
        })

        res.status(200).end()
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
} )

// disable 2fa
router.post( '/@me/mfa/totp/disable', authJwt, async (req, res) => {
    try {
        const { code, password } = req.body

        const userId = req.user._id.toString()
        const user = await User.findById(userId).select('password mfa mfaEnabled')

        if( !user.mfaEnabled ) return res.status(400).send({ message: "Two-factor is not enabled in this account.", code: true })

        if( !password ) return res.status(400).send({ message: "Password does not match.", password: true })
        const isMatch = await bcrypt.compare(password, user.password)
        if( !isMatch ) return res.status(400).send({ message: "Password does not match.", password: true })

        if( !code || code.length !== 6 ) return res.status(400).send({ message: "Invalid two-factor code.", code: true })

        const verified = speakeasy.totp.verify({
            secret: user.mfa.secret,
            encoding: 'base32',
            token: code
        })

        if( !verified ) return res.status(400).send({ message: "Invalid two-factor code.", code: true })

        await User.updateOne({_id: userId}, {
            mfaEnabled: false,
            mfa: {
                secret: ""
            }
        })

        res.status(200).end()
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

// request email code
router.put( '/@me/email', authJwt, async (req, res) => {
    try {


        res.status(200).end()
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
} )

// verify email code
router.post( '/@me/email/verify-code', authJwt, async (req, res) => {
    try {
        const { code } = req.body
        console.log(code)


        res.status(200).end()
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
} )

// put https://discord.com/api/v9/users/@me/email
// POST https://discord.com/api/v9/users/@me/email/verify-code {code: "hehe"}

// update user profile info
router.patch( '/@me/profile', authJwt, async (req, res) => {
    try {
        const userId = req.user._id.toString()
        const user = await User.findById(userId).select('bio')

        const fieldMap = {
            'user-bio': "bio"
        }

        const updates = {}
        for (const [key, value] of Object.entries(req.body)) {
            const field = fieldMap[key]
            if (field) updates[field] = value
        }

        if( updates.bio ) {
            if( updates.bio === user.bio ) return res.status(400).send({ message: "Cannot set same bio.", bio: true })
            if( updates.bio.length > 190 ) return res.status(400).send({ message: "Bio too long.", bio: true })

            await User.updateOne({_id: userId}, { bio: updates.bio })

            req.io.emit("USER_UPDATE", {
                userId,
                updates: {
                    bio: updates.bio
                }
            })

            return res.status(200).end()
        }

        res.status(400).end()
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
} )

// update user info
router.patch( '/@me', authJwt, async (req, res) => {
    try {
        const userId = req.user._id.toString()
        const user = await User.findById(userId).select('password email version token twoFactor username')

        const fieldMap = {
            'user-old-password': 'oldPassword',
            'user-username': 'username',
            'user-password': 'password',
            'user-new-password': 'newPassword',
            'user-email': 'email',
            'user-banner-color': "banner"
        }

        const updates = {}
        for (const [key, value] of Object.entries(req.body)) {
            const field = fieldMap[key]
            if (field) updates[field] = value
        }

        const updatedFields = {}

        if( updates.banner ) {
            if( !validateRGBPattern( updates.banner ) ) return res.status(400).send({ message: "Banner color pattern does not match.", banner: true })

            await User.updateOne({_id: userId}, { banner: updates.banner })


            req.io.emit("USER_UPDATE", {
                userId,
                updates: {
                    banner: updates.banner
                }
            })

            user.banner = updates.banner
            updatedFields.banner = updates.banner
        }

        if( updates.username ) {
            if( !updates.password ) return res.status(400).send({ message: "Password does not match.", username: true })

            const usernameValidated = validateUsername(updates.username)
            if( !usernameValidated ) return res.status(400).send({ message: "Username is not valid.", username: true })

            const usernameRegistered = await User.findOne({ username: updates.username })
            if( usernameRegistered ) return res.status(400).send({ message: "Username is already registered.", username: true })

            const isMatch = await bcrypt.compare(updates.password, user.password)
            if( !isMatch ) return res.status(400).send({ message: "Password does not match.", password: true })

            const canChangeUsername = await checkUserPerk(userId, 'CHANGE_USERNAME')
            if( !canChangeUsername ) return res.status(400).send({ message: "You need to unlock the perk to change your username.", username: true })

            await User.updateOne({_id: userId}, { username: updates.username })

            req.io.emit("USER_UPDATE", {
                userId,
                updates: {
                    username: updates.username
                }
            })
            //const token = generateToken(user)

            user.username = updates.username
            updatedFields.username = updates.username
            updatedFields.requiresToken = true

            //return res.status(200).send({username: updates.username, token})
        }

        if( updates.email ) {
            if( !updates.password ) return res.status(400).send({ message: "Password does not match.", oldPassword: true })

            if( !updates.email.match(/^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/) )
                return res.status(400).send({ message: "Email pattern doesn't match.", email: true })

            const emailRegistered = await User.findOne({ email: updates.email })
            if( emailRegistered ) return res.status(400).send({ message: "Email is already registered.", email: true })

            const isMatch = await bcrypt.compare(updates.password, user.password)
            if( !isMatch ) return res.status(400).send({ message: "Password does not match.", password: true })

            await User.updateOne({_id: userId}, { email: updates.email })

            //const token = generateToken(user)

            user.email = updates.email
            updatedFields.email = updates.email
            updatedFields.requiresToken = true

            //return res.status(200).send({email: updates.email, token})
        }

        if( updates.newPassword ) {
            if( !updates.oldPassword ) return res.status(400).send({ message: "Password does not match.", oldPassword: true })

            const isMatch = await bcrypt.compare(updates.oldPassword, user.password)
            if( !isMatch ) return res.status(400).send({ message: "Password does not match.", oldPassword: true })

            if( updates.newPassword === updates.oldPassword ) return res.status(400).send({ message: "Cannot set the same password.", oldPassword: true })

            if( !validatePassword(user.email, user.username, updates.newPassword) ) return res.status(400).send({ message: "Your password is weak.", password: true })

            const hashedPassword = await bcrypt.hash(updates.newPassword, 10)
            await User.updateOne({_id: userId}, { password: hashedPassword })

            return res.status(200).end()
        }


        let token = undefined
        if( updatedFields.requiresToken ) {
            delete updatedFields.requiresToken
            token = generateToken(user)
        }

        if( Object.keys(updatedFields).length ) return res.status(200).send({...updatedFields, token})

        res.status(400).end()
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
} )

// add reputation to user
router.put('/:accountId/reputations', authJwt, async (req, res) => {
    try {
        const { accountId } = req.params
        const userId = req.user._id.toString()

        if( userId === accountId ) return res.status(404).json({ message: "You can't give reputution to yourself" })

        if (!db.mongoose.Types.ObjectId.isValid(accountId)) return res.status(400).json({ message: 'Invalid account id' })
        const account = await User.findById(accountId)
        if(!account) return res.status(404).json({ message: 'Account not found' })

        const canGiveReps = await checkUserPerk(userId, 'REPUTATION_ABILITY')
        if( !canGiveReps ) return res.status(400).send({ message: "You need to unlock the perk to give reputations." })

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
        const { with_mutual_guilds, with_mutual_friends_count, guild_id } = req.query

        if (!db.mongoose.Types.ObjectId.isValid(profileId)) return res.status(400).json({ message: 'Invalid profile id' })

        const user = await User.findById(userId)

        const profile = await User.findById(profileId)
            .select('uid avatar banner username bio status customStatus createdAt vouchesCount reputationsCount guilds')
            .populate({
                path: 'badges',
                select: 'icon id description',
            })

        if(!profile) return res.status(404).json({ message: 'Profile not found' })

        if( profile.customStatus.status ) profile.status = profile.customStatus.status

        const result = {
            user: profile,
        }

        if( with_mutual_guilds === 'true' ) {
            const user_mutalGuildProfiles = (await GuildUserProfiles.find( { user: user._id } )).map( g => g.guild.toString() )
            const profile_mutalGuildProfiles = (await GuildUserProfiles.find( { user: profile._id } )).map( g => g.guild.toString() )

            const user_setGuildIds = new Set(user_mutalGuildProfiles)

            const mutualGuildIds = []

            for (const _guildId of profile_mutalGuildProfiles) {
                if (user_setGuildIds.has(_guildId)) {
                    mutualGuildIds.push(_guildId)
                }
            }

            result.mutual_guilds = mutualGuildIds
        }
        if( with_mutual_friends_count === 'true' ) {
            const mutual_friends = await User.find({
                friends: { $all: [userId, profileId] }
            }).select('_id')

            result.mutual_friends = mutual_friends.map( mf => mf._id )
            result.mutual_friends_count = mutual_friends.length
        }
        if( guild_id && db.mongoose.Types.ObjectId.isValid(guild_id) ) {
            let guildMember = await GuildUserProfiles.findOne( { guild: guild_id, user: profileId } )

            if(!guildMember) guildMember = await GuildUserProfiles.create( {
                guild: guild_id,
                user: profileId
            } )

            result.guild_member = guildMember
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

        const userGuildProfiles = await GuildUserProfiles.find( {
            user: req.user._id
        } ).select('guild')

        const guildsList = userGuildProfiles.map( g => g.guild.toString() )

        const fulluserGuilds = await Guild.find( { _id: { $in: guildsList } } )
            .populate([
                    /*{
                        path: 'invites',
                        populate: [
                            { path: 'inviter', select: 'avatar username banner status' },
                            { path: 'channel', select: 'name' },
                            { path: 'guild', select: 'name' }
                        ]
                    },*/
                    {
                        path: 'channels',
                        select: 'name type topic parent position server rate_limit_per_user',
                    },
                    {
                        path: 'roles'
                    }
            ]).exec()

            const guildsResult = []
            for( const guild of fulluserGuilds ) {
                const guildMembers = await GuildUserProfiles.find( {
                    guild: guild._id,
                    present: true
                } )

                guildsResult.push({
                    ...guild.toObject(),
                    members: guildMembers,
                    icon_data: (() => {
                        const iconExists = fs.existsSync(`./public/server-icons/${guild.icon}.svg`)
                        if( iconExists ) {
                            const filePath = `./public/server-icons/${guild.icon}.svg`
                            const fileData = fs.readFileSync(filePath, 'utf8')
                            return fileData
                        } else return null
                    })()
                })
            }

        res.status(200).send(guildsResult)
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
} )

// leave guild
/*router.delete( '/@me/guilds/:guildId', authJwt, async (req, res) => {
    try {
        const { guildId } = req.params
        const userId = req.user._id.toString()
        if (!db.mongoose.Types.ObjectId.isValid(guildId)) return res.status(400).json({ message: 'Invalid guild id' })

        const guild = await Guild.findById(guildId)
        if(!guild) return res.status(400).json({ message: 'Guild not found' })

        if( guild.owner.toString() === userId ) return res.status(405).json({ message: 'The server owner can not leave' })

        const user = await User.findById(userId)

        await GuildUserProfiles.updateOne({user: userId, guild: guildId}, {present: false})
        await guild.save()

        user.guilds.pull(guildId)
        await user.save()

        req.io.to(`guild:${guildId}`).emit('GUILD_MEMBER_REMOVE', { member: userId, guild: guildId })

        res.status(200).end()
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
} )*/

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
            .exec()

        const fullUserGuildsProfiles = await GuildUserProfiles.find({ user: userId })
        const fullUserGuildsIds = fullUserGuildsProfiles.map(g => g.guild.toString())
        const fullGuildsMembers = Array.from(new Set((await GuildUserProfiles.find({ guild: { $in: fullUserGuildsIds } })).flatMap(g => g.user.toString())))

        const fullChannelsParticipants = user.channels.flatMap( c => c.participants )

        const fullRelatedUsers = [
            ...user.friends,
            ...user.sentFriendRequests || [],
            ...user.pendingFriendRequests || [],
            ...fullGuildsMembers,
            ...fullChannelsParticipants
        ].map( id => id.toString() )//.filter( id => id !== userId )

        const userIds = [...new Set(fullRelatedUsers)]

        const globalUsers = await User.find({ _id: { $in: userIds } })
            .select('uid avatar banner username bio status customStatus createdAt vouchesCount reputationsCount')
            .populate({
                path: 'badges',
                select: 'icon id description',
            })

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
                    permissions: {
                        users: [{
                            allow: 70508330735680,
                            deny: 0,
                            id: receiverId
                        },
                        {
                            allow: 70508330735680,
                            deny: 0,
                            id: userId
                        }]
                    }
                })

                channelId = newDMChannel._id.toString()
    
                //receiver.channels.addToSet(newDMChannel._id)
                user.channels.addToSet(newDMChannel._id)
        
                await user.save()
                //await receiver.save()
    
                const populatedDMChannel = await Channel.findById(newDMChannel._id)
                    .select('owner name last_message_id lastTimestamp isGroup participants permissions type server')
                const usersRecievedChannel = [userId/*, receiverId*/]

                sendToAllUserIds(req.io, usersRecievedChannel, 'CHANNEL_CREATE', populatedDMChannel)

                for( const participant of [user, receiver] ) {
                    const permission = {
                        channel: newDMChannel._id.toString(),
                        permission: {
                            type: 1,
                            allow: 70508330735680,
                            deny: 0,
                            id: {
                                _id: participant._id.toString(),
                                username: participant.username,
                                avatar: participant.avatar
                            }
                        }}

                    sendToAllUserIds(req.io, usersRecievedChannel, 'PERMISSION_UPDATE', permission) 
                }

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
                        .select('owner name last_message_id lastTimestamp isGroup participants permissions type server')
        
                    sendToAllUserIds(req.io, usersRecievedChannel, 'CHANNEL_CREATE', populatedDMChannel)
                }
            }
            return res.status(200).json({ message: 'Dm channel created successfully', channel: channelId })
        }

        const channelParticipants = [userId, ...participants]
        const permissions = participants.map( participant => {
            return {
                allow: 70508330735680,
                deny: 0,
                id: participant
            }
        } )

        const newGroupDMChannel = await Channel.create({
            type: 'dm',
            position: 0,
            participants: channelParticipants,
            permissions: {
                users: permissions
            },
            owner: userId,
            isGroup: true
        })

        let newChannelName = `${user.username}'s Group`
        const populatedParticipants = []
        if( participants.length ) {
            const participantNames = []
            const participantPromises = channelParticipants.map(async participant => {
                const participantDoc = await User.findById(participant)

                populatedParticipants.push(participantDoc)

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
            .select('owner name last_message_id lastTimestamp isGroup participants permissions type server')
        sendToAllUserIds(req.io, channelParticipants, 'CHANNEL_CREATE', populatedGroupDMChannel)


        for( const participant of populatedParticipants ) {
            const permission = {
                channel: newGroupDMChannel._id.toString(),
                permission: {
                    type: 1,
                    allow: 70508330735680,
                    deny: 0,
                    id: {
                        _id: participant._id.toString(),
                        username: participant.username,
                        avatar: participant.avatar
                    }
                }}

            sendToAllUserIds(req.io, channelParticipants, 'PERMISSION_UPDATE', permission)
        }

        
        res.status(200).json({ message: 'Group DM channel created successfully', channel: newGroupDMChannel._id.toString() })
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
} )

// add friend
router.post('/@me/relationships', authJwt, async (req, res) => {
    try {
        const { username } = req.body
        const senderId = req.user._id.toString()
    
        const [sender, user] = await Promise.all([
            User.findById(senderId),
            User.findOne({ username }),
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
                    permissions: {
                        users: [{
                            allow: 70508330735680,
                            deny: 0,
                            id: userId
                        },
                        {
                            allow: 70508330735680,
                            deny: 0,
                            id: senderId
                        }]
                    }
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
                permissions: {
                    users: [{
                        allow: 70508330735680,
                        deny: 0,
                        id: receiverId
                    },
                    {
                        allow: 70508330735680,
                        deny: 0,
                        id: senderId
                    }]
                }
            })

            receiver.channels.addToSet(newDMChannel._id)
            sender.channels.addToSet(newDMChannel._id)
    
            await sender.save()
            await receiver.save()

            const populatedDMChannel = await Channel.findById(newDMChannel._id)
                .select('owner name last_message_id lastTimestamp isGroup participants permissions type server')


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
                .select('owner name last_message_id lastTimestamp isGroup participants permissions type server')

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