# ZKP2P React Native SDK Example

This example app demonstrates the usage of the ZKP2P React Native SDK, showcasing all major features including authentication, transaction extraction, and proof generation.

## Features Demonstrated

1. **Authentication**
   - Provider configuration fetching
   - Authentication flow
   - Stored authentication handling

2. **Proof Generation**
   - RPC communication
   - Proof generation with selected transaction
   - Error handling and loading states

3. **API & Smart Contract Interactions**
   - Creating and managing deposits
   - Signaling and canceling intents
   - Withdrawing deposits
   - Fetching deposits history by owner address
   - Fetching intents history by taker address

4. **Historical Data API Functions**
   - **Get Account Deposits History**: Query any address to see their historical deposits with status filtering
   - **Get Account Intents History**: Query any address to see their historical intents
   - Located in the API Functions screen under "Historical Data API Functions" section
   
   ```typescript
   // Example usage:
   await zkp2pClient.getAccountDepositsHistory({ 
     ownerAddress: '0x...', 
     status: 'ACTIVE' 
   });
   
   await zkp2pClient.getAccountIntentsHistory({ 
     takerAddress: '0x...' 
   });
   ```

## Setup

1. Install dependencies:
```bash
cd example
yarn install
```

2. Set up the environment variables:
```bash
cp .env.example .env
```
Ask for an API key from the ZKP2P team.

3. Run the app:
```bash
# For iOS
cd ios
pod install
cd ..
yarn ios

# For Android
yarn android
```

## Troubleshooting

If you encounter any issues:

1. Check the console logs for error messages
2. Ensure the RPC server is running
3. Verify your network connection
4. Check that the provider configuration is accessible

## Contributing

Feel free to submit issues and enhancement requests!
