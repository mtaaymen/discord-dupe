const db = require('../models')
const Guild = db.guild
const Channel = db.channel
const Role = db.role


function checkPermissions(permissionNames, objectType) {
    return async function(req, res, next) {
        const objectId = req.params.id;
        const ObjectModel = objectType === 'server' ? Guild : Channel
        
        const object = await ObjectModel.findById(objectId)

        if (!object) return res.status(404).send(`Cannot find ${objectType} with id ${objectId}`)
        
        const missingPermissions = []

        for (const permissionName of permissionNames) {
        // Check if the user has the permission directly
            const userPermission = object.permissions.find( p =>
                p.name === permissionName && p.allowedTo.includes(req.user._id)
            )

            if (userPermission && userPermission.allowed) continue
            
            // Check if any of the user's roles have the permission
            const rolePermissions = req.user.roles.flatMap(role => 
                role.permissions.filter(p => p.name === permissionName && p.allowed)
            )

            const rolePermission = object.permissions.find(p =>
                p.name === permissionName && req.user.roles.some(roleId =>
                    rolePermissions.some(p => p.allowedTo.includes(roleId))
                )
            )

            if (!rolePermission || !rolePermission.allowed) missingPermissions.push(permissionName)
            
        }

        if (missingPermissions.length > 0) {
            const message = `You do not have permission to ${permissionNames.join(' and ')} this ${objectType}`
            return res.status(403).send(message)
        }

        // User has all required permissions, so continue to the next middleware
        next()
    }
}

const checkChannelPermissions = (permissionNames, channelId) => {
    return async (req, res, next) => {
        const {  user } = req

        const channel = await Channel.findById(channelId).populate('server')
        const server = channel.server

        try {
            // Find all roles that the user is a member of
            const userRoles = await Role.find({ members: user._id })

            // Find the role ids and user ids that are allowed to perform the action for each permission name
            const allowedIdsByPermission = permissionNames.reduce((acc, permissionName) => {
                const allowedTo = channel.permissions.find(p => p.name === permissionName && p.allowed).allowedTo
                const allowedRoleIds = allowedTo.filter(a => a.ref === 'Role').map(a => a._id.toString())
                const allowedUserIds = allowedTo.filter(a => a.ref === 'User').map(a => a._id.toString())
                return { ...acc, [permissionName]: { allowedRoleIds, allowedUserIds } }
            }, {})

            // Check if any of the user's roles or the user itself is allowed to perform any of the actions, or if the user is the server owner
            if (userRoles.some(role => permissionNames.some(permissionName => allowedIdsByPermission[permissionName].allowedRoleIds.includes(role._id.toString()))) ||
                    permissionNames.some(permissionName => allowedIdsByPermission[permissionName].allowedUserIds.includes(user._id.toString())) ||
                    server.owner.toString() === user._id.toString()) {
                next()
            } else {
                res.status(403).json({ error: 'You do not have permission to perform this action.' })
            }
        } catch (error) {
            res.status(500).json({ error: 'An error occurred while checking permissions.' })
        }
    }
}

module.exports = checkChannelPermissions