const jwt = require('jsonwebtoken')
const config = require('../config')
const { joinRooms, leaveRooms, onlineStatus } = require('./helpers')

module.exports = (socket) => {
    //console.log(`Socket ${socket.id} connected`)

    socket.on('authenticate', (token) => {
        jwt.verify(token, config.JWT_SECRET, (err, decoded) => {
            if (err) {
                console.error(err)
                socket.emit('NOT_AUTH', true)
                socket.disconnect()
            } else {
                //console.log(`User ${decoded.username} authenticated`)
                socket.decoded = decoded
                
                onlineStatus( socket, decoded.userId, "online" )
            }
        })
    })

    socket.on('sub_guilds', (guilds) => {
        if (!socket.decoded) {
            //console.error('User not authenticated')
            socket.disconnect()
        } else {
            //console.log(`User ${socket.decoded.username} subscribed to guild:`, guilds)
            joinRooms(socket, 'guild', guilds)
        }
    })

    socket.on('sub_channels', (channels) => {
        if (!socket.decoded) {
            //console.error('User not authenticated')
            socket.disconnect()
        } else {
            //console.log(`User ${socket.decoded.username} subscribed to channels:`, channels)
            joinRooms(socket, 'channel', channels)
        }
    })

    socket.on('unsub_guilds', (guilds) => {
        if (!socket.decoded) {
            //console.error('User not authenticated')
            socket.disconnect()
        } else {
            //console.log(`User ${socket.decoded.username} subscribed to guild:`, guilds)
            leaveRooms(socket, 'guild', guilds)
        }
    })

    socket.on('unsub_channels', (channels) => {
        if (!socket.decoded) {
            //console.error('User not authenticated')
            socket.disconnect()
        } else {
            //console.log(`User ${socket.decoded.username} subscribed to channels:`, channels)
            leaveRooms(socket, 'channel', channels)
        }
    })

    socket.on('custom_status', (statusFields) => {
        if (socket.decoded) {
            onlineStatus( socket, socket.decoded.userId, statusFields.status, true )
        }
    })

    socket.on('user_status', (statusFields) => {
        if (socket.decoded) {
            onlineStatus( socket, socket.decoded.userId, statusFields.status)
        }
    })

    socket.on('disconnect', () => {
        if (socket.decoded) {
            onlineStatus( socket, socket.decoded.userId, "offline" )
        }
        //console.log(`Socket ${socket.id} disconnected`)
        leaveRooms(socket, 'channel', socket["_channel"] || [])
        leaveRooms(socket, 'guild', socket["_guild"] || [])
    })
}
