const db = require('../models')
const Guild = db.guild
const Channel = db.channel


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
                p.name === permissionName && p.allowedTo.some(roleId =>
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

  
module.exports = checkPermissions