const db = require('../models')
const Guild = db.guild
const Channel = db.channel
const Role = db.role

const PERMISSIONS_VALUES = {
    CREATE_INSTANT_INVITE: 0x0000000000000001,
    KICK_MEMBERS: 0x0000000000000002,
    BAN_MEMBERS: 0x0000000000000004,
    ADMINISTRATOR: 0x0000000000000008,
    MANAGE_CHANNELS: 0x0000000000000010,
    MANAGE_GUILD: 0x0000000000000020,
    ADD_REACTIONS: 0x0000000000000040,
    VIEW_AUDIT_LOG: 0x0000000000000080,
    VIEW_CHANNEL: 0x0000000000000400,
    SEND_MESSAGES: 0x0000000000000800,
    SEND_TTS_MESSAGES: 0x0000000000001000,
    MANAGE_MESSAGES: 0x0000000000002000,
    EMBED_LINKS: 0x0000000000004000,
    ATTACH_FILES: 0x0000000000008000,
    READ_MESSAGE_HISTORY: 0x0000000000010000,
    MENTION_EVERYONE: 0x0000000000020000,
    USE_EXTERNAL_EMOJIS: 0x0000000000040000,
    VIEW_GUILD_INSIGHTS: 0x0000000000080000,
    CHANGE_NICKNAME: 0x0000000004000000,
    MANAGE_NICKNAMES: 0x0000000008000000,
    MANAGE_ROLES: 0x0000000010000000,
    MANAGE_GUILD_EXPRESSIONS: 0x0000000040000000,
    USE_APPLICATION_COMMANDS: 0x0000000080000000,
    MANAGE_THREADS: 0x0000000400000000,
    CREATE_PUBLIC_THREADS: 0x0000000800000000,
    CREATE_PRIVATE_THREADS: 0x0000001000000000,
    USE_EXTERNAL_STICKERS: 0x0000002000000000,
    SEND_MESSAGES_IN_THREADS: 0x0000004000000000,
    MODERATE_MEMBERS: 0x0000010000000000,
    SEND_VOICE_MESSAGES: 0x0000400000000000
}

function encodePermissions(permissions) {
    let encodedValue = 0n
  
    for (const permission of permissions) {
        const value = PERMISSIONS_VALUES[permission]
        if (value !== undefined) {
            encodedValue |= BigInt(value)
        }
    }
    return Number(encodedValue)
}
  
function decodePermissions(encodedValue) {
    const permissions = []
    for (const permission in PERMISSIONS_VALUES) {
        const value = BigInt(PERMISSIONS_VALUES[permission])
        if ((BigInt(encodedValue) & value) === value) {
            permissions.push(permission)
        }
    }
    return permissions
}

function checkPermission(permission, allowed, denied) {
    const allowedPermissions = decodePermissions(allowed)
    const deniedPermissions = decodePermissions(denied)

    if (deniedPermissions.includes(permission)) {
        return { allowed: false, denied: true }
    }

    if (allowedPermissions.includes(permission)) {
        return { allowed: true, denied: false }
    }

    const requiredPermissionValue = PERMISSIONS_VALUES[permission]

    for (const [p, value] of Object.entries(PERMISSIONS_VALUES)) {
        if ((requiredPermissionValue & value) === value) {
            if (deniedPermissions.includes(p)) {
                return { allowed: false, denied: true }
            }
            if (allowedPermissions.includes(p)) {
                return { allowed: true, denied: false }
            }
        }
    }

    return { allowed: false, denied: false }
}

function hasPermissions(allowed, denied, required) {
    const missingPermissions = []
    const deniedPermissions = []

    if (allowed & PERMISSIONS_VALUES.ADMINISTRATOR) {
        return true
    }

    for (const permission of required) {
        const result = checkPermission(permission, allowed, denied)

        if (!result.allowed) {
            if (result.denied) {
                deniedPermissions.push(permission)
                return false
            } else {
                missingPermissions.push(permission)
            }
        }
    }

    if (missingPermissions.length > 0) return missingPermissions

    return true
}

function checkRolesOverwritePermissions(permissionsList, userRoles, requiredPermissions) {
    let missingPermissions = requiredPermissions

    for (let i = 0; i < userRoles.length; i++) {
        const role = userRoles[i]

        
        const rolePermissions = permissionsList.find( p => p._type === 0 && p.id.toString() === role._id.toString() )
        if(!rolePermissions) continue
        const hasAllPermissions = hasPermissions(rolePermissions.allow, rolePermissions.deny, missingPermissions)

        // if true skip because it needs to check for the rest of the permissions
        // if false means permission denied means stop so return false anyways

        if (hasAllPermissions === false) {
            return false
        } else if (Array.isArray(hasAllPermissions)) {
            missingPermissions = hasAllPermissions
        } else missingPermissions = []
    }

    if( missingPermissions.length ) return missingPermissions

    return true
}

function checkRolesPermissions(userRoles, requiredPermissions) {
    let missingPermissions = requiredPermissions

    for (let i = 0; i < userRoles.length; i++) {
        const role = userRoles[i]

        const rolePermissions = role.permissions || 0
        const hasAllPermissions = hasPermissions(rolePermissions, 0, missingPermissions)

        // if true skip because it needs to check for the rest of the permissions
        // if false means permission denied means stop so return false anyways

        if (hasAllPermissions === false) {
            return false
        } else if (Array.isArray(hasAllPermissions)) {
            missingPermissions = hasAllPermissions
        } else missingPermissions = []
    }

    if( missingPermissions.length ) return missingPermissions

    return true
}


async function checkChannelPermissions(user, channelId, requiredPermissions) {
    const channel = await Channel.findById(channelId)
        .populate({
            path: 'server',
            select: 'owner'
        })

    const userIsChannelOwner = channel.owner && channel.owner.toString() === user._id.toString()
    if( userIsChannelOwner ) return true

    const userIsServerOwner = channel.server && channel.server.owner.toString() === user._id.toString()
    if( userIsServerOwner ) return true

    //console.log( '\n-----\n' )

    let missingPermissions

    const mixedChannelPermissions = [...channel.permissions.users, ...channel.permissions.roles]
    const sortedChannelPermissions = mixedChannelPermissions.sort( (a, b) => a.position - b.position )
    const userPermissions = sortedChannelPermissions.find( p => p._type === 1 && p.id.toString() === user._id.toString() )
    if( userPermissions ) {
        const userHasDirectPermission = hasPermissions(userPermissions.allow, userPermissions.deny, requiredPermissions)
        if (userHasDirectPermission === true) {
            //console.log('(USER) User has all required permissions')
            return true
        } else if (Array.isArray(userHasDirectPermission)) {
            //console.log(`(USER) User is missing the following permissions: ${userHasDirectPermission.join(', ')}`)
            if( !channel.server ) return false
            missingPermissions = userHasDirectPermission
        } else {
            //console.log(`(USER) User is explicitly denied the following permissions: ${requiredPermissions.join(', ')}`)
            return false
        }
    } else {
        //console.log(`(USER) User is missing the following permissions: ${requiredPermissions.join(', ')}`)
        if( !channel.server ) return false
        missingPermissions = requiredPermissions
    }

    const userRoles = await Role.find({ members: user._id, server: channel?.server?._id })
        .select('permissions server')

    const everyoneRole = await Guild.findById(channel?.server?._id, 'everyone_role')
        .populate('everyone_role', 'permissions server')

    const nonEveryoneRoles = userRoles.filter(roleId => {
        return !everyoneRole._id === roleId
    })

    const fullUserRoles = [everyoneRole.everyone_role, ...nonEveryoneRoles]

    const userHasPermissionByRole = checkRolesOverwritePermissions(sortedChannelPermissions, fullUserRoles, missingPermissions)
    if (userHasPermissionByRole === true) {
        //console.log('(ROLE-1) User has all required permissions')
        return true
    } else if (Array.isArray(userHasPermissionByRole)) {
        //console.log(`(ROLE-1) User is missing the following permissions: ${userHasPermissionByRole.join(', ')}`)
        missingPermissions = userHasPermissionByRole
    } else {
        //console.log(`(ROLE-1) User is explicitly denied the following permissions: ${requiredPermissions.join(', ')}`)
        return false
    }
    

    const userHasServerPermissionByRole = checkRolesPermissions(fullUserRoles, missingPermissions)
    if (userHasServerPermissionByRole === true) {
        //console.log('(ROLE-2) User has all required permissions')
        return true
    } else if (Array.isArray(userHasServerPermissionByRole)) {
        //console.log(`(ROLE-2) User is missing the following permissions: ${userHasServerPermissionByRole.join(', ')}`)
        return false
    } else {
        //console.log(`(ROLE-2) User is explicitly denied the following permissions: ${requiredPermissions.join(', ')}`)
        return false
    }
}

async function checkServerPermissions(user, serverId, requiredPermissions) {
    const server = await Guild.findById(serverId).select('owner')
    if( !server ) return false


    const userIsServerOwner = server.owner.toString() === user._id.toString()
    if( userIsServerOwner ) return true

    //console.log( '\n-----\n' )

    const userRoles = await Role.find({ members: user._id, server: serverId })

    const userHasServerPermissionByRole = checkRolesPermissions(userRoles, requiredPermissions)
    if (userHasServerPermissionByRole === true) {
        //console.log('(ROLE-2) User has all required permissions')
        return true
    } else if (Array.isArray(userHasServerPermissionByRole)) {
        //console.log(`(ROLE-2) User is missing the following permissions: ${userHasServerPermissionByRole.join(', ')}`)
        return false
    } else {
        ////console.log(`(ROLE-2) User is explicitly denied the following permissions: ${requiredPermissions.join(', ')}`)
        return false
    }
}

module.exports = {
    checkChannelPermissions,
    checkServerPermissions,
    decodePermissions,
    encodePermissions
}