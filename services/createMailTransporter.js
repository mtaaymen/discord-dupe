const nodemailer = require("nodemailer")

let transporter

const createMailTransporter = () => {
    if( !transporter ) {
        transporter = nodemailer.createTransport( {
            service: 'gmail',
            auth: {
              user: 'myloginnamehereapp@gmail.com',
              pass: 'bxkxrxbwrmrtsjxu'
            }
        } )
    }
    return transporter
}

module.exports = createMailTransporter