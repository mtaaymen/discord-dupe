function joinRooms(socket, type, roomIds) {
    const newRooms = []
    const roomsSet = socket[`_${type}`] || new Set()
    roomIds.forEach(roomId => {
        const roomName = roomId.includes(":") ? roomId : `${type}:${roomId}`;
        if (!roomsSet.has(roomName)) {
            newRooms.push(roomName)
            roomsSet.add(roomName)
        }
    })
    if (newRooms.length > 0) {
        socket[`_${type}`] = roomsSet
        socket.join(newRooms)
    }
}

function leaveRooms(socket, type, roomIds) {
    const roomsToLeave = []
    const roomsSet = socket[`_${type}`] || new Set()
    roomIds.forEach(roomId => {
        const roomName = roomId.includes(":") ? roomId : `${type}:${roomId}`;
        if (roomsSet.has(roomName)) {
            roomsToLeave.push(roomName)
            roomsSet.delete(roomName)
        }
    })
    if (roomsToLeave.length > 0) {
        socket[`_${type}`] = roomsSet
        socket.leave(roomsToLeave)
    }
}

function leaveAndDeleteRoom(io, type, roomId, socket) {
    const roomName = roomId.includes(":") ? roomId : `${type}:${roomId}`
    socket.leave(roomName)
    socket.rooms.delete(roomName)
    io.of('/').adapter.del(roomName)
}


function unsubscribeAllUsers(io, type, roomIds) {
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
}

module.exports = {
    unsubscribeAllUsers,
    joinRooms,
    leaveRooms
}