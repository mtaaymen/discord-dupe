const db = require("../models")

const User = db.user

const checkAdmin = async (req, res, next) => {
    const userId = req.user._id.toString()
    const user = await User.findById(userId, 'adminAccess')

    if( user.adminAccess !== 1 && user.adminAccess !== 2 ) return res.status(401).json({ message: 'no admin access' })
    req.adminAccess = user.adminAccess
    next()
}

module.exports = checkAdmin