function getExchangeRate() {
    return new Promise( async ( resolve, reject ) => {
        try {
            const data = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd')
                .then( res => res.json() )
  
            const usdToEthRate = data?.ethereum?.usd
            if( !usdToEthRate ) return reject(null)
  
            resolve( usdToEthRate )
            console.log(`Current ETH/USD exchange rate: 1 ETH = $${usdToEthRate}`)
        } catch (error) {
            reject(null)
            console.error('Error fetching exchange rates:', error.message)
        }
    })
}
  
module.exports = {
    getExchangeRate
}