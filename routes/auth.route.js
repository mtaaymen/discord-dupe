const express = require('express')
const router = express.Router()

const speakeasy = require('speakeasy')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const { authJwt } = require('../middlewares')

const mailTransporter = require('../services/createMailTransporter')()


const config = require('../config')
const db = require("../models")
const User = db.user
const Role = db.role
const Guild = db.guild
const Channel = db.channel
const GuildUserProfiles = db.guildUserProfiles
const PasswordReset = db.passwordReset


function validatePassword(email, username, password) {
    // Password must be at least 8 characters long
    if (password.length < 8) return false
    
    // Password cannot contain the user's username or email
    if (password.includes(username) || password.includes(email)) return false
    
    // Password must contain at least one uppercase letter, lowercase letter, number, and special character
    const containsLowercase = /[a-z]/.test(password)
    const containsNumber = /\d/.test(password)
    //const containsSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
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

function getTokenVersion(userToken, headerToken) {
    try {
        const cutHeaderToken = headerToken.split(' ')[1]
        let decodedToken = jwt.decode(cutHeaderToken)
        if( !decodedToken ) decodedToken = jwt.decode(userToken)
        return decodedToken ? decodedToken.version : -1
    } catch {
        return -1
    }
}

function generateCode(length = 10) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let resetCode = '';
  
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * characters.length)
      resetCode += characters.charAt(randomIndex)
    }
  
    return resetCode
}

function isEmail(input) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(input)
}

function validateUsername(username) {
    if (!username) return false
    
    if (username.length < 2 || username.length > 32) return false
  
    let alphanumericRegex = /^[a-zA-Z0-9_]+$/
    if (!alphanumericRegex.test(username)) return false
    
    return true
}

router.post('/signup', async (req, res) => {
    try {
        const { username, dob, email, password } = req.body

        if( !email.match(/^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/) )
            return res.status(400).send({ message: "Email pattern doesn't match.", email: true })

        const emailRegistered = await User.findOne({ email: email })
        if( emailRegistered ) return res.status(400).send({ message: "Email is already registered.", email: true })

        const usernameValidated = validateUsername(username)
        if( !usernameValidated ) return res.status(400).send({ message: "Username is not valid.", username: true })

        const usernameRegistered = await User.findOne({ username: username })
        if( usernameRegistered ) return res.status(400).send({ message: "Username is already registered.", username: true })


        if( !validatePassword(email, username, password) ) return res.status(400).send({ message: "Your password is weak.", password: true })

        let discriminator = ''
        let userExists = true
        while (userExists) {
            discriminator = Math.floor(1000 + Math.random() * 9000).toString() // Generate random 4-digit number
            const existingUser = await User.findOne({ username, discriminator })
            userExists = !!existingUser // Convert to boolean
        }

        let uid
        const userWithBiggestUid = await User.findOne().sort('-uid').select('uid')
        if( !userWithBiggestUid.uid ) {
            userWithBiggestUid.uid = 1
            await userWithBiggestUid.save()

            uid = 2
        } else {
            uid = userWithBiggestUid.uid + 1
        }

        const hashedPassword = await bcrypt.hash(password, 10)
        const user = await User.create({
            uid,
            username,
            dob,
            discriminator,
            email,
            password: hashedPassword
        })
        //const token = jwt.sign({ userId: user._id }, config.JWT_SECRET, { expiresIn: '1h' })'

        const allGuildIds = (await Guild.find({}, '_id')).map(g => g._id)
        const userProfileDocs = allGuildIds.map(_guildId => ({ guild: _guildId, user: user._id }))
        const newGuildMembers = await GuildUserProfiles.insertMany(userProfileDocs)

        for( let _guildId of allGuildIds) {
            const guildMemberDoc = newGuildMembers.find( gm => gm.user.toString() === user._id.toString() && gm.guild.toString() === _guildId.toString() )
            req.io.to(`guild:${_guildId}`).emit('GUILD_MEMBER_ADD', { member: guildMemberDoc, guild: _guildId })
        }

        

        const token = generateToken(user)
        res.json({ message: 'User created successfully', token })
    } catch (err) {
        console.error(err.message)
        res.status(500).json({ error: err.message })
    }
})

router.post('/forgot', async (req, res) => {
    try {
        const { login } = req.body

        const user = await User.findOne({
            $or: [
                { email: login },
                { username: login },
            ],
        })

        if( !user ) return res.status(404).send({ message: 'Email not found'})

        const payload = {
            email: user.email,
            id: user._id
        }

        const ResetToken = jwt.sign(payload, config.JWT_SECRET)
        const ResetCode = generateCode(30)

        await PasswordReset.create( {
            user: user._id,
            email: user.email,
            code: ResetCode
        } )

        const mailInfo = await mailTransporter.sendMail( {
			from: `"${config.APP_NAME}" <myloginnamehereapp@gmail.com>`,
			to: user.email,
			subject: `Password reset request for ${config.APP_NAME}`,
			html: `<div style="text-align: center;vertical-align: top;direction: ltr;font-size: 0px;padding: 40px 50px;margin: 0 auto; max-width: 640px; border-radius: 4px">
                <div style="vertical-align: top;display: inline-block;direction: ltr;font-size: 13px;text-align: left;width: 100%;">
                    <div style="color: #737f8d;font-family: Helvetica Neue,Helvetica,Arial,Lucida Grande,sans-serif;font-size: 16px;line-height: 24px;text-align: left;" >
                        <h2 style="font-family: Helvetica Neue,Helvetica,Arial,Lucida Grande,sans-serif;font-weight: 500;font-size: 20px;color: #4f545c;letter-spacing: 0.27px;" >Hey ${user.username},</h2>
                        <p>Your ${config.APP_NAME} password can be reset by clicking the button below. If you did not request a new password, please ignore this email.</p>
                    </div>
                    <div style="width: 100%">
                        <div style="width:fit-content;border:none;border-radius:3px;color:white;padding:15px 19px;background-color:#5865f2;margin: 0 auto;" align="center" valign="middle">
                            <a style="text-decoration: none;line-height: 100%;background: #5865f2;color: white;font-family: Ubuntu,Helvetica,Arial,sans-serif;font-size: 15px;font-weight: normal;text-transform: none;margin: 0px;" href="${config.CLIENT_URL}/reset?token=${ResetToken}&code=${ResetCode}">Reset Password</a>
                        </div>
                    </div>
                </div>
            </div>`,
		} )
        console.log( 'mail sent: ',mailInfo.messageId )

        res.status(200).send({ email: user.email})
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Internal server error' })
    }
})

router.post('/reset', async (req, res) => {
    try {
        const { code, token, password } = req.body

        let decodedToken
        let decodeTokenErr
        try {
            decodedToken = jwt.verify(token, config.JWT_SECRET)
        } catch {
            decodeTokenErr = true
        }

        if(decodeTokenErr || !decodedToken?.id || !decodedToken?.email) return res.status(404).send({ message: "Password reset expired or doesn't exist", password: true})

        const passReset = await PasswordReset.findOne( {
            user: decodedToken.id,
            email: decodedToken.email,
            code,
        } )

        if( !passReset ) return res.status(404).send({ message: "Password reset expired or doesn't exist", password: true})

        const user = await User.findById(passReset.user)
        if( !user ) return res.status(404).send({ message: 'Email not found', password: true})
        
        if( !validatePassword(decodedToken.email, user.username, password) ) return res.status(400).send({ message: "Your password is weak.", password: true })

        const hashedPassword = await bcrypt.hash(password, 10)
        const newUser = await User.findOneAndUpdate(
            { _id: passReset.user },
            { password: hashedPassword },
            { new: true }
        )

        await PasswordReset.findByIdAndDelete(passReset._id)

        const newToken = generateToken(newUser)
        res.status(200).json({ token: newToken })
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Internal server error' })
    }
})

router.post('/signin', async (req, res) => {
    try {
        const { email, password } = req.body

        const user = await User.findOne({
            $or: [
              { email: email },
              { username: email },
            ],
        })

        if (!user) throw new Error('Invalid email or password')
        
        const isMatch = await bcrypt.compare(password, user.password)
        if (!isMatch) throw new Error('Invalid email or password')

        if( user.mfaEnabled ) return res.status(200).send({twoFactorAuth: true, email: user.email})

        const currentVersion = user.version
        const tokenVersion = getTokenVersion(user.token ,req.headers.authorization)
        if (tokenVersion === -1 || currentVersion !== tokenVersion) {
            const token = generateToken(user)
            res.status(200).json({ token })
        } else {
            res.status(200).json({ token: user.token })
        }
    } catch (err) {
        res.status(401).json({ message: err.message })
    }
})

router.post('/signin/mfa', async (req, res) => {
    try {
        const { email, password, code } = req.body

        if( !code || code.length !== 6 ) return res.status(400).send({ message: "Invalid two-factor code.", code: true })

        const user = await User.findOne({
            $or: [
              { email: email },
              { username: email },
            ],
        })

        if( !user.mfaEnabled ) return res.status(400).send({ message: "Invalid two-factor code.", code: true })

        if (!user) throw new Error('Invalid email or password')
        
        const isMatch = await bcrypt.compare(password, user.password)
        if (!isMatch) throw new Error('Invalid email or password')

        const verified = speakeasy.totp.verify({
            secret: user.mfa.secret,
            encoding: 'base32',
            token: code
        })

        if(!verified) return res.status(400).send({ message: "Invalid two-factor code.", code: true })

        const currentVersion = user.version
        const tokenVersion = getTokenVersion(user.token ,req.headers.authorization)
        if (tokenVersion === -1 || currentVersion !== tokenVersion) {
            const token = generateToken(user)
            res.status(200).json({ token })
        } else {
            res.status(200).json({ token: user.token })
        }
    } catch (err) {
        res.status(401).json({ message: err.message })
    }
})

router.get("/permissions", authJwt, async (req, res) => {
    try {
        const userId = req.user._id.toString()

        const fulluserGuilds = await GuildUserProfiles.find( {user: req.user._id } )
            .populate({
                path: 'guild',
                populate: {
                    path: 'channels',
                    select: 'permissions',
                    populate: [{
                        path: 'permissions.users.id',
                        select: 'username avatar'
                    }, {
                        path: 'permissions.roles.id',
                        select: 'name color'
                    }]
                }
            }).exec()

        const guilds = fulluserGuilds.map( f => f.guild )

        const roles = await Role.find({ members: userId })
            .select('permissions server')

        const everyoneRoles = await Guild.find({_id: { $in: guilds }}, 'everyone_role')
            .populate('everyone_role', 'permissions server color name')

        const mappedEveryoneRoles = everyoneRoles.map( r => r.everyone_role )

        const nonEveryoneRoles = roles.filter(roleId => {
            return !everyoneRoles.some(everyoneRole => everyoneRole.everyone_role.equals(roleId))
        })

        const dmChannels = await Channel.find({ participants: userId })
            .select('permissions')
            .populate([{
                path: 'permissions.users.id',
                select: 'username avatar'
            }, {
                path: 'permissions.roles.id',
                select: 'name color'
            }])
            

        const channelPermissions = [
            ...guilds.flatMap( g => {
                return g.channels.map( c => {
                    return {
                        _id: c._id,
                        permissions: [
                            ...c.permissions.users.map( p => {
                                return {
                                    allow: p.allow,
                                    deny: p.deny,
                                    type: p._type,
                                    id: p.id
                                }
                            } ),
                            ...c.permissions.roles.map( p => {
                                return {
                                    allow: p.allow,
                                    deny: p.deny,
                                    type: p._type,
                                    id: p.id
                                }
                            } )
                        ]
                    }
                } )
            }),
            ...dmChannels.map( c => {
                return {
                    _id: c._id,
                    permissions: [
                        ...c.permissions.users.map( p => {
                            return {
                                allow: p.allow,
                                deny: p.deny,
                                type: p._type,
                                id: p.id
                            }
                        } ),
                        ...c.permissions.roles.map( p => {
                            return {
                                allow: p.allow,
                                deny: p.deny,
                                type: p._type,
                                id: p.id
                            }
                        } )
                    ]
                }
            } ),
        ]

        res.status(200).json({channels: channelPermissions, roles: [...nonEveryoneRoles, ...mappedEveryoneRoles]})
        /*const userId = req.user._id
    
        // Find all the servers where the user is a member
        const servers = await Guild.find({ members: userId })
            .populate('roles')
            .populate('channels')
        
    
        // Loop through each server and its channels to retrieve the allowed permissions
        const serverPermissions = await Promise.all(servers.map(async (server) => {
            const guildId = server._id
            const allowedPermissions = ["everyone"]
            const serverPermissions = server.permissions
    
            // Check if the user is the owner of the server and add the permission with owner name
            if (userId.equals(server.owner)) {
                allowedPermissions.push('owner')
            }
    
            // Loop through each permission and check if it's allowed for the user
            serverPermissions.forEach((permission) => {
                if (permission.allowedUsers.some((allowed) => allowed.equals(userId))) {
                    allowedPermissions.push(permission.name)
                }

                server.roles.forEach((role) => {
                    const roleId = role._id
                    if (permission.allowedRoles.some((allowed) => allowed.equals(roleId))) {
                        allowedPermissions.push(permission.name)
                    }
                })
            })
*/

            /*// Loop through each permission and check if it's allowed for the user's roles
            serverPermissions.forEach((permission) => {
                if (permission.allowedUsers.some((allowed) => allowed.equals(userId))) {
                    allowedPermissions.push(permission.name)
                }
            })*/
    
            /*
            // Loop through each channel in the server and retrieve the allowed permissions
            const channelPermissions = await Promise.all(server.channels.map(async (channel) => {
                const channelId = channel._id
                const allowedChannelPermissions = ["everyone"]
                const channelPermissions = channel.permissions
    
                // Loop through each permission and check if it's allowed for the user
                channelPermissions.forEach((permission) => {
                    if (permission.users.some( user => user.user.equals(userId) && user.allowed === 1 )) {
                        allowedChannelPermissions.push(permission.name)
                    }

                    server.roles.forEach((role) => {
                        const roleId = role._id
                        if (permission.roles.some( role => role.role.equals(roleId) && role.allowed === 1 )) {
                            allowedChannelPermissions.push(permission.name)
                        }
                    })
                })
        
                return { channelId, allowedPermissions: Array.from( new Set(allowedChannelPermissions) ) }
            }))
    
            return { guildId, allowedPermissions: Array.from( new Set(allowedPermissions) ), channels: channelPermissions }
        }))*/
    
        //res.json(serverPermissions)
        //res.json([])
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Server error' })
    }
})


router.get('/profile', authJwt, (req, res) => {
    res.json({ user: req.user })
})

module.exports = router