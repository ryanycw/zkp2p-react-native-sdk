# zkp2p-react-native-sdk

React Native SDK for ZKP2P - A peer-to-peer fiat-to-crypto on/off-ramp powered by zero-knowledge proofs.

## Installation

```sh
yarn add @zkp2p/zkp2p-react-native-sdk @react-native-async-storage/async-storage @react-native-cookies/cookies react-native-webview @zkp2p/webview-intercept viem react-native-svg react-native-device-info
```

### iOS Setup
```sh
cd ios && pod install
```

### Additional Dependencies

- `react-native-device-info`: Used for dynamic memory management in proof generation
- `react-native-svg`: Required for animated UI components

## Quick Start

The SDK supports two modes:
- **Full Mode**: Access all features including blockchain operations (requires wallet & API key)
- **Proof-Only Mode**: Generate proofs without wallet or API key

### Full Mode Setup

```tsx
import { Zkp2pProvider, useZkp2p } from '@zkp2p/zkp2p-react-native-sdk';
import { createWalletClient, custom } from 'viem';

// 1. Setup wallet client
const walletClient = createWalletClient({
  chain: base,
  transport: custom(window.ethereum),
});

// 2. Wrap your app with Zkp2pProvider
function App() {
  return (
    <Zkp2pProvider
      walletClient={walletClient}
      apiKey="your-api-key"
      chainId={8453} // Base
      prover="reclaim_gnark" // or "reclaim_snarkjs"
    >
      <YourApp />
    </Zkp2pProvider>
  );
}
```

### Proof-Only Mode Setup

```tsx
// No wallet or API key required!
function App() {
  return (
    <Zkp2pProvider
      chainId={8453} // Base
      prover="reclaim_gnark"
    >
      <YourApp />
    </Zkp2pProvider>
  );
}

// 3. Use the SDK in your components
function PaymentFlow() {
  const {
    flowState,
    initiate,
    authenticate,
    generateProof,
    zkp2pClient, // null in proof-only mode
    proofData,
    metadataList,
  } = useZkp2p();

  // Check mode
  const isProofOnlyMode = !zkp2pClient;
  
  // Your component logic
}
```

## API Reference

### Provider Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `walletClient` | `WalletClient` | Optional | Viem wallet client for blockchain interactions (required for full mode) |
| `apiKey` | `string` | Optional | Your ZKP2P API key (required for full mode) |
| `chainId` | `number` | `8453` | Blockchain chain ID (8453 for Base, 31337 for Hardhat) |
| `environment` | `'production' \| 'staging'` | `'production'` | Environment (production or staging) |
| `prover` | `'reclaim_snarkjs' \| 'reclaim_gnark'` | `'reclaim_gnark'` | Proof generation method |
| `witnessUrl` | `string` | `'https://witness-proxy.zkp2p.xyz'` | Witness server URL |
| `baseApiUrl` | `string` | `'https://api.zkp2p.xyz/v1'` | ZKP2P API base URL |
| `rpcTimeout` | `number` | `30000` | RPC timeout in milliseconds |
| `configBaseUrl` | `string` | `'https://raw.githubusercontent.com/zkp2p/providers/main/'` | Provider configuration base URL |
| `storage` | `Storage` | Optional | App-provided secure storage instance (e.g., SecureStore). Required to persist credentials/consent. |
| `renderConsentSheet` | `(props) => ReactNode` | Optional | If provided, SDK renders this after visible login when consent is unset. Your component must call `onAccept` / `onSkip` / `onDeny`. |

### Core Flow Functions

#### 1. `signalIntent(args)`
Signal your intent to buy/sell crypto. This must be called before initiating the payment flow.

```typescript
const { zkp2pClient } = useZkp2p();

const signalArgs = {
  depositId: '123', // The deposit ID you want to fulfill
  amount: '100', // Amount in USD
  // ... other contract parameters
};

const tx = await zkp2pClient.signalIntent(signalArgs);
```

#### 2. `initiate(platform, actionType, options?)`
Start the payment proof generation flow. Opens payment provider authentication.

```typescript
const { initiate } = useZkp2p();

const provider = await initiate('venmo', 'transfer_venmo', {
  // Optional: Auto-start with payment action
  initialAction: {
    enabled: true,
    paymentDetails: {
      RECIPIENT_ID: 'john-doe-123',
      AMOUNT: '100'
    }
  }
});
```

#### 3. `generateProof(provider, payload, intentHash, itemIndex?)`
Generate zero-knowledge proof(s) for a specific transaction. Always returns an array of `ProofData`.

```typescript
const { generateProof, provider, interceptedPayload } = useZkp2p();

try {
  const proofs = await generateProof(
    provider,
    interceptedPayload,
    '0x...', // Intent hash from signalIntent
    0 // Transaction index to prove
  );
  
  console.log('Proofs generated:', proofs);
} catch (error) {
  console.error('Proof generation failed:', error);
  // Fallback to manual authentication
  await authenticate('venmo', 'transfer_venmo');
}
```

#### 4. `authenticate(platform, actionType, options?)`
Start or retry the authentication flow for a specific provider. Useful for retry or manual flows.

```typescript
const { authenticate } = useZkp2p();

// Simple authentication without auto-proof
await authenticate('venmo', 'transfer_venmo');

// Or with auto-proof generation
await authenticate('venmo', 'transfer_venmo', {
  autoGenerateProof: {
    intentHash: '0x...',
    itemIndex: 0,
    onProofGenerated: (proofData) => {
      // Handle generated proof
    },
    onProofError: (err) => console.error(err),
  },
});

Note: Both `initiate(...)` and `authenticate(...)` start a new session and clear `proofData`, `metadataList`, and `interceptedPayload` to ensure no stale state carries into the new flow.

### Credential Storage & Consent (SDK-managed)

The SDK can store credentials (username/password) per provider/action when the user consents. You supply:

- `storage`: a `Storage` implementation (e.g., backed by SecureStore or AsyncStorage) via `Zkp2pProvider`.
- `renderConsentSheet`: an app-owned bottom sheet or modal. The SDK will call it after a successful visible login when consent is unset. You call back:
  - `onAccept` → SDK stores credentials and writes provider consent.
  - `onSkip` → SDK does not store; consent remains unset (prompt again next time).
  - `onDeny` → SDK writes provider consent = 'denied' (no further prompts).
Keys used internally (no need to manage these directly):
- Credentials: `zkp2p_cred_{keccak256(platform:actionType:url)}`
- Consent: `zkp2p_consent_{keccak256(platform:actionType:url)}`

Provider config must include login selectors. Optionally set a reveal timeout for invisible autofill flows:

```jsonc
{
  "mobile": {
    "login": {
      "usernameSelector": "#email, input[name=\"email\"]",
      "passwordSelector": "#password, input[name=\"password\"][type=\"password\"]",
      "submitSelector": "button[type=\"submit\"]",
      "revealTimeoutMs": 3000 // how long to keep the WebView minimized after submit before revealing
    }
  }
}
```

Exposing helpers (optional):

```ts
import { useZkp2p } from '@zkp2p/zkp2p-react-native-sdk';
import type { ProviderSettings } from '@zkp2p/zkp2p-react-native-sdk';

const ExampleComponent = ({ providerCfg }: { providerCfg: ProviderSettings }) => {
  const {
    clearAllCredentials,
    clearAllConsents,
    clearProviderCredentials,
    clearProviderConsent,
    getProviderConsent,
  } = useZkp2p();

  const handleClear = async () => {
    await clearAllCredentials();
    await clearAllConsents();
    await clearProviderCredentials(providerCfg);
    await clearProviderConsent(providerCfg);
    const consent = await getProviderConsent(providerCfg);
    console.log('Current consent', consent);
  };

  // ...
};
```

Notes:
- SDK no longer accepts `loginAutomation` or `credentialsKey` in `authenticate(...)` — selectors live in provider config, and keys are computed internally.
- WebView closes immediately on intercept success; consent prompt (your renderer) appears after.
```

#### 5. `fulfillIntent(args)`
Complete the transaction by submitting the proof on-chain.

```typescript
const { zkp2pClient, proofData } = useZkp2p();

const tx = await zkp2pClient.fulfillIntent(fulfillArgs);
```

### Hook Return Values

```typescript
const {
  // State
  flowState,           // Current flow state: 'idle' | 'authenticating' | 'authenticated' | 'actionStarted' | 'proofGenerating' | 'proofGeneratedSuccess' | 'proofGeneratedFailure'
  provider,            // Current provider configuration
  proofData,           // Generated proof data (ProofData[])
  metadataList,        // List of transactions from authentication
  authError,           // Authentication error if any
  proofError,          // Proof generation error if any
  interceptedPayload,  // Network event data from authentication
  authWebViewProps,    // Props for the authentication WebView
  
  // Methods
  initiate,            // Start the flow
  authenticate,        // Manual authentication
  generateProof,       // Generate proof(s) for transaction (returns ProofData[])
  closeAuthWebView,    // Close authentication modal
  clearSession,        // Clear cookies/storage for a fresh login
  resetState,          // Reset in-memory SDK state and cancel background work
  
  // Client
  zkp2pClient,         // Direct access to contract methods (null in proof-only mode)
} = useZkp2p();
```

## Performance: Lazy Circuit Loading

- Circuits are now loaded lazily per algorithm (e.g., `aes-256-ctr`, `aes-128-ctr`, `chacha20`) instead of at SDK mount. This significantly reduces app startup time.
- The SDK extracts the cipher from the witness and begins preloading that specific circuit just before proof generation. Only one circuit is initialized at a time, on demand.
- If you want to explicitly warm up a circuit even earlier, you may call the native preload via `GnarkBridge.preloadAlgorithm(algorithm)` when you have enough context, though this is optional — the bridge also ensures lazy initialization on first use.

### Complete Flow Example

```typescript
function BuyCrypto() {
  const { 
    flowState, 
    initiate, 
    generateProof,
    zkp2pClient,
    proofData,
    provider,
    interceptedPayload 
  } = useZkp2p();
  
  const handleBuy = async () => {
    try {
      const signalTx = await zkp2pClient.signalIntent({
        processorName: 'venmo',
        depositId: '123',
        tokenAmount: '100',
        payeeDetails: '0x1234567890123456789012345678901234567890',
        toAddress: '0x0000000000000000000000000000000000000000',
        currency: 'USD',
      });
      
      const intentHash = signalTx.responseObject.signedIntent;
      
      await initiate('venmo', 'transfer_venmo', {
        initialAction: {
          enabled: true,
          paymentDetails: {
            venmoUsername: 'crypto-seller',
            note: 'Cash',
            amount: '100.00'
          }
        },
        // Optional: After authenticate step, you can auto-generate proof
        // (Recommended to pass autoGenerateProof in authenticate instead.)
      });
      
      // Example: Manually authenticate and auto-generate proof
      await authenticate('venmo', 'transfer_venmo', {
        autoGenerateProof: {
          intentHash,
          itemIndex: 0,
          onProofGenerated: async (_singleProof) => {
            // For multiple-proof configs, read the array from the hook state
            const proofsToUse = proofData && proofData.length > 0 ? proofData : [];
            if (proofsToUse.length === 0) return;
            const fulfillTx = await zkp2pClient.fulfillIntent({
              paymentProofs: proofsToUse,
              intentHash,
              onSuccess: (tx) => console.log('Transaction complete:', tx.hash),
              onError: (error) => console.error('Fulfillment failed:', error),
            });
            console.log('Transaction complete:', fulfillTx.hash);
          },
          onProofError: async (error) => {
            console.error('Auto-proof failed, trying manual:', error);
            if (provider && interceptedPayload) {
              const proofs = await generateProof(
                provider,
                interceptedPayload,
                intentHash,
                0
              );
              await zkp2pClient.fulfillIntent({ paymentProofs: proofs, intentHash });
            }
          },
        },
      });

    } catch (error) {
      console.error('Buy flow failed:', error);
    }
  };
  
  return (
    <View>
      <Button onPress={handleBuy} title="Buy Crypto" />
      <Text>Status: {flowState}</Text>
    </View>
  );
}
```

### Flow States

- `idle` - No active operation
- `actionStarted` - Payment action initiated (Venmo/CashApp/etc opened)
- `authenticating` - User authenticating with payment provider
- `authenticated` - Authentication complete, transactions available
- `proofGenerating` - Generating zero-knowledge proof
- `proofGeneratedSuccess` - Proof successfully generated
- `proofGeneratedFailure` - Proof generation failed

### Supported Platforms and Actions

| Platform | Action Types | Description |
|----------|-------------|-------------|
| Venmo | `transfer_venmo` | Venmo P2P transfers |
| Cash App | `transfer_cashapp` | Cash App transfers |
| Revolut | `transfer_revolut` | Revolut transfers |
| Wise | `transfer_wise` | Wise transfers |
| MercadoPago | `transfer_mercadopago` | MercadoPago transfers |
| Zelle | `transfer_zelle` | Zelle transfers |

### Error Handling

```typescript
// Check authentication errors
const { authError } = useZkp2p();
if (authError) {
  console.error('Auth failed:', authError.message);
}

// Handle proof generation errors
try {
  await generateProof(provider, interceptedPayload, intentHash, 0);
} catch (error) {
  console.error('Proof generation failed:', error);
  // The SDK provides retry functionality in the UI
}
```

### Advanced Configuration

#### Custom User Agent

The SDK allows configuring custom user agents per provider in the provider configuration:

```typescript
provider.mobile?.userAgent = {
  ios: 'Custom iOS User Agent',
  android: 'Custom Android User Agent'
};
```

#### Multiple Proof Generation

The SDK supports generating multiple proofs for different transaction data:

```typescript
const proofs = await generateProof(
  provider,
  interceptedPayload,
  intentHash,
  0 // itemIndex
);
// Returns ProofData[] - array of proofs if multiple configured
```

#### Dynamic Memory Management

The SDK automatically adjusts proof generation concurrency based on device memory:
- Devices with 8GB+ RAM: Up to 6 concurrent proofs
- Devices with 6GB+ RAM: Up to 4 concurrent proofs
- Devices with 4GB+ RAM: Up to 3 concurrent proofs
- Devices with less than 4GB: Up to 2 concurrent proofs

## Gnark Native Proving

The SDK includes native gnark proving for optimal performance. Circuit files are stored in the `gnark-circuits/` directory and are automatically loaded on initialization.

### Native Libraries
- iOS: Uses `libgnarkprover.xcframework`
- Android: Uses `libgnarkprover.so`

### Performance Optimizations
- Dynamic memory-based concurrency management
- Automatic memory cleanup after proof generation
- Proof cancellation support for better user experience

### Native Bridge Methods
- `executeZkFunction(requestId, functionName, args, algorithm)` — starts proving; emits `GnarkRPCResponse` with `response` or `error`.
- `cancelProofGeneration(requestId)` — cancels an in-flight proof by ID.
- `cleanupMemory()` — cancels all active tasks and frees resources.
- Event: `GnarkRPCResponse` — payload includes `id`, `type` (`response`|`error`), and `response` or `error`.

### Resetting SDK State

- `resetState()` — Resets internal SDK state and cancels background proof tasks:
  - Cancels all active native gnark proofs and cleans up memory
  - Aborts pending RPC requests and remounts the RPC bridge
  - Clears `proofData`, `metadataList`, `interceptedPayload`
  - Closes/minimizes auth webview and resets flow to `idle`

- `clearSession(options?)` — Clears persisted cookies/storage used for web auth. Use this to force fresh logins. It does not cancel native tasks by itself.

## UI Components

### Authentication WebView

The SDK provides a built-in WebView component for authentication:
- Slide-up animation from bottom
- Minimizable to 48px height
- Tap header to minimize/expand
- Clean circular close button
- No backdrop overlay - allows interaction with main app

### Proof Generation Spinner

A modal spinner appears during proof generation:
- Dark themed UI
- Animated progress ring
- Exit button to cancel proof generation
- Retry functionality on failure
- Success/failure states with appropriate messaging

## Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

## Client Methods

### Contract Interactions

```typescript
const { zkp2pClient } = useZkp2p();

// Available methods:
zkp2pClient.signalIntent(params)          // Signal buy/sell intent
zkp2pClient.fulfillIntent(params)         // Complete transaction with proof
zkp2pClient.createDeposit(params)         // Create new deposit
zkp2pClient.withdrawDeposit(params)       // Withdraw deposit
zkp2pClient.cancelIntent(params)          // Cancel pending intent
zkp2pClient.releaseFundsToPayer(params)  // Release escrowed funds

// Query methods:
zkp2pClient.getQuote(params)              // Get price quotes
zkp2pClient.getPayeeDetails(params)       // Get payee information
zkp2pClient.getAccountDeposits(address)   // Get user's deposits
zkp2pClient.getAccountIntent(address)     // Get user's active intent

// Utility methods:
zkp2pClient.getUsdcAddress()              // Get USDC contract address
zkp2pClient.getDeployedAddresses()        // Get all contract addresses
```

## On-chain Views Enrichment

- When calling `getAccountDeposits(address)` and `getAccountIntent(address)`, the SDK parses on-chain views and optionally enriches them with off-chain data when an `apiKey` is set.
- Enrichment adds two fields:
  - `paymentMethod`: platform key derived from the verifier address (e.g., `venmo`, `cashapp`, `revolut`, `wise`). Always set when the verifier is a supported platform.
  - `paymentData`: opaque key-value details fetched from the API, available only when an `apiKey` is provided.

Where the data appears
- Per-verifier: `EscrowDepositView.verifiers[i].verificationData.paymentMethod` and `...verificationData.paymentData`.
- Top-level intent: `EscrowIntent.paymentMethod` and `EscrowIntent.paymentData` (copied from the verifier matching `paymentVerifier`).

Example
```ts
const intentView = await zkp2pClient.getAccountIntent('0xYourAddress');
if (intentView) {
  // Top-level enrichment
  console.log(intentView.intent.paymentMethod); // e.g. 'venmo'
  console.log(intentView.intent.paymentData);   // e.g. { username: 'alice', contact: '...' }

  // Per-verifier enrichment
  for (const v of intentView.deposit.verifiers) {
    console.log(v.verificationData.paymentMethod);
    console.log(v.verificationData.paymentData);
  }
}

const deposits = await zkp2pClient.getAccountDeposits('0xYourAddress');
for (const d of deposits) {
  for (const v of d.verifiers) {
    console.log(v.verificationData.paymentMethod);
    console.log(v.verificationData.paymentData);
  }
}
```

Notes
- Enrichment is best-effort; failures are logged and do not throw.
- `paymentData` requires a valid `apiKey`. `paymentMethod` does not.

## Platform Configuration

- Supported payment platforms are defined once in `ENABLED_PLATFORMS` (src/utils/constants.ts).
- Contract addresses use a typed `ContractSet` that maps those platforms to verifier addresses, keeping config and types in sync.
- Helpers:
  - `platformFromVerifierAddress(addresses, verifierAddress)` resolves the platform key from a verifier contract address.
  - `getPlatformAddressMap(addresses)` returns `{ [platform]: address }` restricted to enabled platforms.

## Type Definitions

### Core Types

```typescript
// Proof data structure
interface ProofData {
  proofType: 'reclaim';
  proof: ReclaimProof;
}

// Flow states
type FlowState =
  | 'idle'
  | 'authenticating'
  | 'authenticated'
  | 'actionStarted'
  | 'proofGenerating'
  | 'proofGeneratedSuccess'
  | 'proofGeneratedFailure';

// Initiate options
interface InitiateOptions {
  authOverrides?: AuthWVOverrides;
  existingProviderConfig?: ProviderSettings;
  initialAction?: {
    enabled?: boolean;
    paymentDetails?: Record<string, string>; // For URL/JS injection
    useExternalActionOverride?: boolean; // Override internal vs external action
  };
}

// Authenticate options
interface AuthenticateOptions {
  authOverrides?: AuthWVOverrides;
  existingProviderConfig?: ProviderSettings;
  autoGenerateProof?: {
    intentHash?: string;
    itemIndex?: number;
    onProofGenerated?: (proofData: ProofData) => void;
    onProofError?: (error: Error) => void;
  };
}

// Fulfill intent params (subset)
interface FulfillIntentParams {
  paymentProofs: ProofData[];
  intentHash: string;
}
```

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
