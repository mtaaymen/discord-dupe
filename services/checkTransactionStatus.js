
const { Web3 } = require('web3')
const config = require('../config')
const db = require("../models")

const { sendToAllUserIds } = require('../sockets/helpers')

const web3 = new Web3(new Web3.providers.HttpProvider(config.WEB3_PROVIDER))

const User = db.user
const TransactionsQueue = db.transactionsQueue
const UserSubscriptions = db.userSubscriptions
const Subscriptions = db.subscriptions

global.transactionsInterval = null


async function checkTransactionStatus(io) {
  console.log('checking transactions status')
  const pendingTransactions = await TransactionsQueue.find({ status: 'pending' })

  if (pendingTransactions.length === 0) {

    clearInterval(global.transactionsInterval)
    global.transactionsInterval = null

  } else {

    for (const transaction of pendingTransactions) {
      const receipt = await web3.eth.getTransactionReceipt(transaction.transactionHash)

      if (receipt) {
        if( receipt.status ) {
          await UserSubscriptions.create({
            user: transaction.user,
            subscription: transaction.subscriptionId,
            plan: transaction.plan
          })

          const subDoc = await Subscriptions.findById(transaction.subscriptionId)

          await User.findOneAndUpdate( {_id: transaction.user}, { $addToSet: { badges: subDoc.badge } } )

          const txId = web3.utils.sha3( `${receipt.from}-${receipt.to}-${receipt.value}-${receipt.gas}` )

          const socketData = {
            selectedSub: subDoc,
            reciept: {
              status: 'confirmed',
              transactionID: txId
            }
          }

          sendToAllUserIds(io, [transaction.user.toString()], 'TX_CONFIRMED', socketData)

          transaction.status = 'confirmed'
        } else {
          transaction.status = 'failed'
        }

        await transaction.save()
      }
    }
    
  }
}

module.exports = {
  checkTransactionStatus
}