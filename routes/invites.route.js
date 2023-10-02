const express = require('express')
const router = express.Router()

const { authJwt } = require('../middlewares')
const { sendToAllUserIds } = require('../sockets/helpers')

const db = require("../models")
const User = db.user
const Guild = db.guild
const Role = db.role
const Invite = db.invite
const GuildUserProfiles = db.guildUserProfiles

router.get('/:code', authJwt, async ( req, res ) => {
    try {
        const invite = await Invite.findOne({ code: req.params.code })
            .populate('guild', ['_id', 'name', 'icon', 'description'])
            .populate('channel', ['_id', 'name', 'type'])
            .populate('inviter', ['_id', 'username'])
    
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
        const userId = req.user._id.toString()
        const user = await User.findById(userId)

        const invite = await Invite.findOne({ code })
            .populate('guild')
            .populate('inviter')

        if (!invite) return res.status(404).json({ message: 'Invite not found' })
        
        // Check if user is already a member of the guild
        let guildMember = await GuildUserProfiles.findOne({guild: invite.guild._id, user: userId})
        
        if( guildMember ) {
            if( guildMember.present ) return res.status(403).json({ message: 'You are already a member of this guild' })
                else {
                    guildMember.present = true
                    await guildMember.save()
                }
        }
    
        // create guild memeber
        if(!guildMember) {
            guildMember = await GuildUserProfiles.create( {
                guild: invite.guild._id,
                user: userId
            } )
        }

        // add user to everone role of the guild
        await Role.updateOne({ _id: invite.guild.everyone_role }, { $push: { members: userId } })

        // add server to user servers
        user.guilds.addToSet(invite.guild._id)
        await user.save()
    
        // Increase invite uses
        invite.uses += 1
    
        // Remove invite if max uses reached
        if (invite.uses >= invite.maxUses && !invite.isPermanent) {
            await Invite.deleteOne({ _id: invite._id })
        } else {
            await invite.save()
        }

        req.io.to(`guild:${invite.guild._id}`).emit('GUILD_MEMBER_ADD', { member: guildMember, guild: invite.guild._id })

        const populatedServer = await Guild.findById(invite.guild._id)
            .populate({
                path: 'invites',
                populate: [
                    { path: 'inviter', select: 'avatar username status' },
                    { path: 'channel', select: 'name' },
                    { path: 'guild', select: 'name' }
                ]
            })
            .populate({
                path: 'channels',
                select: 'name type topic parent position server',
            })
            .populate({
                path: 'roles'
            })
            .populate({
                path: 'everyone_role',
                select: 'name color'
            })
            .exec()

        populatedServer.channels.forEach( c => {
            const updatesRes = {
                channel: c._id.toString(),
                permission: {
                    type: 0,
                    allow: 70508330735680,
                    deny: 0,
                    id: {
                        _id: populatedServer.everyone_role._id.toString(),
                        name: populatedServer.everyone_role.name,
                        color: populatedServer.everyone_role.color
                    }
                }
            }
    
            sendToAllUserIds(req.io, [userId], 'PERMISSION_UPDATE', updatesRes)
        })
    
        const guildMembers = await GuildUserProfiles.find( {guild: invite.guild._id} ) 

        return res.status(200).json({ message: 'Invite accepted', guild: {...populatedServer.toObject(), members: guildMembers} })
    } catch (err) {
        console.error(err)
        return res.status(500).json({ message: 'Internal server error' })
    }
})

module.exports = router