const express = require('express')
const router = express.Router()

const { authJwt } = require('../middlewares')

const db = require("../models")
const User = db.user
const Guild = db.guild

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
            .populate({ path: 'owner', select: 'avatar username discriminator avatar status' })
            .populate({ path: 'members', select: 'avatar username discriminator avatar status' })
            .populate({
                path: 'channels',
                select: 'name type topic parent position permissionOverwrites messages',
                populate: {
                    path: 'messages',
                    select: 'content author attachments embeds reactions pinned editedTimestamp deleted deletedTimestamp createdAt',
                    populate: {
                        path: 'author',
                        select: 'avatar username discriminator avatar status'
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

module.exports = router