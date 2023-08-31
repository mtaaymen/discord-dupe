const db = require('../models')
const UserSubscriptions = db.userSubscriptions
const Subscriptions = db.subscriptions

const PERKS_VALUES = {
    CHANGE_USERNAME: 0x0000000000000001,
    REPUTATION_ABILITY: 0x0000000000000002,
    PREMIUM_SECTIONS: 0x0000000000000004
}

function encodePermissions(permissions) {
    let encodedValue = 0n
  
    for (const permission of permissions) {
        const value = PERKS_VALUES[permission]
        if (value !== undefined) {
            encodedValue |= BigInt(value)
        }
    }
    return Number(encodedValue)
}
  
function decodePermissions(encodedValue) {
    const permissions = []
    for (const permission in PERKS_VALUES) {
        const value = BigInt(PERKS_VALUES[permission])
        if ((BigInt(encodedValue) & value) === value) {
            permissions.push(permission)
        }
    }
    return permissions
}

function checkPermission(permission, allowed) {
    const allowedPermissions = decodePermissions(allowed)

    if (allowedPermissions.includes(permission)) return true

    const requiredPermissionValue = PERKS_VALUES[permission]

    for (const [p, value] of Object.entries(PERKS_VALUES)) {
        if ((requiredPermissionValue & value) === value) {
            if (allowedPermissions.includes(p)) {
                return true
            }
        }
    }

    return false
}

async function checkUserPerk(userId, requiredPermission) {
    let hasAccess = false

    const userSubs = await UserSubscriptions.find({user: userId})
    if(!userSubs.length) return false

    for( const userSub of userSubs ) {
        const sub = await Subscriptions.findById(userSub.subscription)
        if( !sub ) continue
        const subPlan = sub.plans[userSub.plan]

        const actionAllowed = checkPermission(requiredPermission, subPlan.perks)
        if( !hasAccess ) hasAccess = actionAllowed
    }


    return hasAccess
}

module.exports = {
    checkUserPerk
}