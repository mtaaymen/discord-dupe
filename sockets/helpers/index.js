const db = require('../../models')
const User = db.user

async function adminAccess(socket, userId) {
    try {
        const user = await User.findById(userId)
            .select('adminAccess')

        if(user.adminAccess !== 1 && user.adminAccess !== 2) return socket.emit('NO_ADMIN_ACCESS', true)

        socket.emit('ADMIN_ACCESS', {access: user.adminAccess})
    } catch (error) {
        console.error(error.message)
    }
}

async function onlineStatus(socket, userId, status, custom) {
    try {
        const update = custom
            ? { customStatus: { status: status === 'online' ? null : status } }
            : { status }

        const user = await User.findByIdAndUpdate(userId, update, { new: true})
            .select('username avatar status customStatus')

        if (!user) return console.error(`User ${userId} not found.`)

        const showStatus = user.status === 'offline' ? 'offline' : ( user.customStatus.status || user.status )
        socket.server.emit('PRESENCE_UPDATE', {user, status: showStatus})

        //console.log(`User ${user.username} status changed to ${showStatus}`)
    } catch (error) {
        console.error(error)
    }
}

function sendToAllUserIds(io, userIds = [], event, data) {
    try {
        io.sockets.sockets.forEach( socket => {
            if (socket.decoded && userIds.includes(socket.decoded.userId)) {
                socket.emit(event, data)
            }
        })
    } catch (error) {
        console.error(error.message)
    }
}

function joinRooms(socket, type, roomIds) {
    try {
        const newRooms = []
        const roomsSet = socket[`_${type}`] || new Set()
        roomIds.forEach(roomId => {
            const roomName = roomId.includes(":") ? roomId : `${type}:${roomId}`
            if (!roomsSet.has(roomName)) {
                newRooms.push(roomName)
                roomsSet.add(roomName)
            }
        })

        if (newRooms.length > 0) {
            socket[`_${type}`] = roomsSet
            socket.join(newRooms)
        }
    } catch (error) {
        console.error(error.message)
    }
}

function leaveRooms(socket, type, roomIds) {
    try {
        const roomsToLeave = []
        const roomsSet = socket[`_${type}`] || new Set()
        roomIds.forEach(roomId => {
            const roomName = roomId.includes(":") ? roomId : `${type}:${roomId}`
            if (roomsSet.has(roomName)) {
                roomsToLeave.push(roomName)
                roomsSet.delete(roomName)
            }
        })
        if (roomsToLeave.length > 0) {
            socket[`_${type}`] = roomsSet
            socket.leave(roomsToLeave)
        }
    } catch (error) {
        console.error(error.message)
    }
}

function leaveAndDeleteRoom(io, type, roomId, socket) {
    try {
        const roomName = roomId.includes(":") ? roomId : `${type}:${roomId}`
        socket.leave(roomName)
        socket.rooms.delete(roomName)
        io.of('/').adapter.del(roomName)
    } catch (error) {
        console.error(error.message)
    }
}


function unsubscribeAllUsers(io, type, roomIds) {
    try {
        const roomsToUnsubscribe = Array.isArray(roomIds) ? roomIds : [roomIds]
    
        roomsToUnsubscribe.forEach(roomId => {
            const roomName = roomId.includes(":") ? roomId : `${type}:${roomId}`
            const socketsInRoom = io.sockets.adapter.rooms.get(roomName)
            if (socketsInRoom) {
            socketsInRoom.forEach(socketId => {
                const socket = io.sockets.sockets.get(socketId)
                leaveAndDeleteRoom( io, type, roomId, socket )
                /*socket.leave(roomName)
                socket.rooms.delete(roomName)*/
            })
            }
        })
    } catch (error) {
        console.error(error.message)
    }
}

module.exports = {
    unsubscribeAllUsers,
    joinRooms,
    leaveRooms,
    onlineStatus,
    sendToAllUserIds,
    adminAccess
}