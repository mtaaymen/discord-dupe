const express = require('express')
const router = express.Router()

const { authJwt } = require('../middlewares')

const db = require("../models")
const User = db.user
const Guild = db.guild
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
    
        // Increase invite uses
        invite.uses += 1
    
        // Remove invite if max uses reached
        if (invite.uses >= invite.maxUses && !invite.isPermanent) {
            await Invite.deleteOne({ _id: invite._id })
        } else {
            await invite.save()
        }

        const populatedServer = await Guild.findById(invite.guild._id)
            .populate('channels')
            .populate('roles')
            .exec()
    
        return res.status(200).json({ message: 'Invite accepted', guild: populatedServer })
    } catch (err) {
        console.error(err)
        return res.status(500).json({ message: 'Internal server error' })
    }
})

module.exports = router