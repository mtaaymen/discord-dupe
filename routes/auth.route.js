const express = require('express')
const router = express.Router()

const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const { authJwt } = require('../middlewares')


const config = require('../config')
const db = require("../models")
const User = db.user
const Role = db.role
const Guild = db.guild
const Channel = db.guild


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
    
    // Password is considered valid if it passes all the above checks
    return true
}

function generateToken(user) {
    user.version += 1
    
    const payload = {
        userId: user._id,
        username: user.username,
        email: user.email,
        discriminator: user.discriminator,
        version: user.version,
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

router.post('/signup', async (req, res) => {
    try {
        const { username, dob, email, password } = req.body

        if( !email.match(/^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/) )
            return res.status(400).send({ message: "Email pattern doesn't match.", email: true })

        const emailRegistered = await User.findOne({ email: email })
        if( emailRegistered ) return res.status(400).send({ message: "Email is already registered.", email: true })

        if( !validatePassword(email, username, password) ) return res.status(400).send({ message: "Your password is weak.", password: true })

        let discriminator = ''
        let userExists = true
        while (userExists) {
            discriminator = Math.floor(1000 + Math.random() * 9000).toString() // Generate random 4-digit number
            const existingUser = await User.findOne({ username, discriminator })
            userExists = !!existingUser // Convert to boolean
        }

        const hashedPassword = await bcrypt.hash(password, 10)
        const user = new User({ username, dob, discriminator, email, password: hashedPassword })
        //const token = jwt.sign({ userId: user._id }, config.JWT_SECRET, { expiresIn: '1h' });
        const token = generateToken(user)
        res.json({ message: 'User created successfully', token })
    } catch (err) {
        console.error(err.message)
        res.status(500).json({ error: err.message })
    }
})

router.post('/signin', async (req, res) => {
    try {
        const { email, password } = req.body
        const user = await User.findOne({ email })
        if (!user) throw new Error('Invalid email or password')
        
        const isMatch = await bcrypt.compare(password, user.password)
        if (!isMatch) throw new Error('Invalid email or password')

        const currentVersion = user.version
        const tokenVersion = getTokenVersion(user.token ,req.headers.authorization)
        if (tokenVersion === -1 || currentVersion !== tokenVersion) {
            const token = generateToken(user)
            res.json({ token })
        } else {
            res.json({ token: user.token })
        }
    } catch (err) {
        res.status(401).json({ message: err.message })
    }
})

router.get("/permissions", authJwt, async (req, res) => {
    try {
        const userId = req.user._id
    
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
                if (permission.allowedTo.some((allowed) => allowed.equals(userId))) {
                    allowedPermissions.push(permission.name)
                }

                server.roles.forEach((role) => {
                    const roleId = role._id
                    if (permission.allowedTo.some((allowed) => allowed.equals(roleId))) {
                        allowedPermissions.push(permission.name)
                    }
                })
            })

            // Loop through each permission and check if it's allowed for the user's roles
            serverPermissions.forEach((permission) => {
                if (permission.allowedTo.some((allowed) => allowed.equals(userId))) {
                    allowedPermissions.push(permission.name)
                }
            })
    
            // Loop through each channel in the server and retrieve the allowed permissions
            const channelPermissions = await Promise.all(server.channels.map(async (channel) => {
                const channelId = channel._id
                const allowedChannelPermissions = ["everyone"]
                const channelPermissions = channel.permissions
    
                // Loop through each permission and check if it's allowed for the user
                channelPermissions.forEach((permission) => {
                    if (permission.allowedTo.some((allowed) => allowed.equals(userId))) {
                        allowedChannelPermissions.push(permission.name)
                    }

                    server.roles.forEach((role) => {
                        const roleId = role._id
                        if (permission.allowedTo.some((allowed) => allowed.equals(roleId))) {
                            allowedChannelPermissions.push(permission.name)
                        }
                    })
                })
        
                return { channelId, allowedPermissions: Array.from( new Set(allowedChannelPermissions) ) }
            }))
    
            return { guildId, allowedPermissions: Array.from( new Set(allowedPermissions) ), channels: channelPermissions }
        }))
    
        res.json(serverPermissions)
    } catch (err) {
        console.error(err)
        res.status(500).json({ message: 'Server error' })
    }
})


router.get('/profile', authJwt, (req, res) => {
    res.json({ user: req.user })
})

module.exports = router