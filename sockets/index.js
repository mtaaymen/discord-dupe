const jwt = require('jsonwebtoken')
const config = require('../config')
const { joinRooms, leaveRooms } = require('./helpers')

module.exports = (socket) => {
  console.log(`Socket ${socket.id} connected`);

    socket.on('authenticate', (token) => {
        jwt.verify(token, config.JWT_SECRET, (err, decoded) => {
            if (err) {
                console.error(err)
                socket.disconnect()
            } else {
                console.log(`User ${decoded.username} authenticated`)
                socket.decoded = decoded
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

    socket.on('disconnect', () => {
        //console.log(`Socket ${socket.id} disconnected`)
        leaveRooms(socket, 'channel', socket["_channel"] || [])
        leaveRooms(socket, 'guild', socket["_guild"] || [])
    })  
}
