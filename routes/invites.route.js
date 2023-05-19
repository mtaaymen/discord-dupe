const express = require('express')
const router = express.Router()

const { authJwt } = require('../middlewares')

const db = require("../models")
const User = db.user
const Guild = db.guild
const Role = db.role
const Invite = db.invite

router.get('/:code', authJwt, async ( req, res ) => {
    try {
        const invite = await Invite.findOne({ code: req.params.code })
            .populate('guild', ['_id', 'name', 'icon', 'description'])
            .populate('channel', ['_id', 'name', 'type'])
            .populate('inviter', ['_id', 'username', 'discriminator'])
    
        if (!invite) return res.status(404).json({ message: 'Invite not found' });
        


        /*const members = await Guild.find({ guild: guild._id }).exec()
        const onlineMembers = members.filter(member => member.isOnline)
        const approximate_member_count = members.length;
        const approximate_presence_count = onlineMembers.length;*/
    
        const response = {
            code: invite.code,
            type: invite.type,
            expires_at: invite.expiresAt,
            guild: invite.guild,
            channel: invite.channel,
            inviter: invite.inviter,
            approximate_member_count: 0,
            approximate_presence_count: 0
        };
    
        return res.status(200).json(response)
    } catch (error) {
        console.error(error)
        return res.status(500).json({ message: 'Internal server error' })
    }
})

router.post('/:code', authJwt, async (req, res) => {
    const code = req.params.code
  
    try {
        const invite = await Invite.findOne({ code })
            .populate('guild')
            .populate('inviter')

        if (!invite) return res.status(404).json({ message: 'Invite not found' })
        
        // Check if user is already a member of the guild
        if (invite.guild.members.includes(req.user._id)) return res.status(403).json({ message: 'You are already a member of this guild' })
        
    
        // Add user to members array of the guild
        await Guild.updateOne({ _id: invite.guild._id }, { $push: { members: req.user._id } })

        // add user to everone role of the guild
        await Role.updateOne({ _id: invite.guild.everyone_role }, { $push: { members: req.user._id } })
    
        // Increase invite uses
        invite.uses += 1
    
        // Remove invite if max uses reached
        if (invite.uses >= invite.maxUses && !invite.isPermanent) {
            await Invite.deleteOne({ _id: invite._id })
        } else {
            await invite.save()
        }

        const member = await User.findOne({_id: req.user._id }).select('avatar username discriminator avatar status')
        req.io.to(`guild:${invite.guild._id}`).emit('GUILD_MEMBER_ADD', { member })

        const populatedServer = await Guild.findById(invite.guild._id)
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
    
        return res.status(200).json({ message: 'Invite accepted', guild: populatedServer })
    } catch (err) {
        console.error(err)
        return res.status(500).json({ message: 'Internal server error' })
    }
})

module.exports = router