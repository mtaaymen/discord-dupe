const jwt = require('jsonwebtoken')
const config = require('../config')
const db = require('../models')
const User = db.user

const authJwt = async (req, res, next) => {
    try {
        const token = req.headers.authorization.split(' ')[1] // Extract token from Authorization header
        const decodedToken = jwt.verify(token, config.JWT_SECRET) // Verify token and decode payload
        const user = await User.findById(decodedToken.userId) // Retrieve user from database
        if (!user) return res.status(404).json({ message: 'User not found' })
        if( decodedToken.version !== user.version ) return res.status(401).json({ message: 'Token outdated' })
        req.user = user // Attach user object to request object
        next() // Call next middleware or route handler
    } catch (error) {
        res.status(401).json({ message: 'Invalid token' })
    }
}



module.exports = authJwt