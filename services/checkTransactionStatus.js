
const { Web3 } = require('web3')
const config = require('../config')
const db = require("../models")

const { sendToAllUserIds } = require('../sockets/helpers')
const { getExchangeRate } = require('./getExchangeRate')



const web3 = new Web3(new Web3.providers.HttpProvider(config.WEB3_PROVIDER))

const User = db.user
const TransactionsQueue = db.transactionsQueue
const UserSubscriptions = db.userSubscriptions
const Subscriptions = db.subscriptions



//console.log( web3.eth.accounts.wallet.create(1) )

async function checkTransactionStatus(io) {
  try {
    const pendingTransactions = await TransactionsQueue.find({ status: 'pending' })

    for (const transaction of pendingTransactions) {
      const walletBalance = await web3.eth.getBalance(transaction.address)
      const ethWalletBalance = web3.utils.fromWei(walletBalance, 'ether')

      if( ethWalletBalance >= transaction.amount ) {
        const alreadySubbed = await UserSubscriptions.findOne({user: transaction.user, subscription: transaction.subscriptionId})

        if( alreadySubbed ) {

          transaction.status = 'acquired'
          await transaction.save()

        } else {

          await UserSubscriptions.create({
            user: transaction.user,
            subscription: transaction.subscriptionId,
            plan: transaction.plan
          })
    
          const subDoc = await Subscriptions.findById(transaction.subscriptionId)
    
          await User.findOneAndUpdate( {_id: transaction.user}, { $addToSet: { badges: subDoc.badge } } )
    
          const socketData = {
            selectedSub: subDoc,
            reciept: {
              status: 'confirmed',
              transactionID: transaction._id
            }
          }
    
          sendToAllUserIds(io, [transaction.user.toString()], 'TX_CONFIRMED', socketData)
    
          transaction.sentAmount = ethWalletBalance
          transaction.status = 'confirmed'
          await transaction.save()

        }


      } else if ( (Date.now() - new Date(transaction.createdAt).getTime()) > 3600000 ) {
        transaction.status = 'expired'
        await transaction.save()
      }

    }
  } catch( err ) {
    console.error(err)
  }
}


module.exports = {
  checkTransactionStatus
}