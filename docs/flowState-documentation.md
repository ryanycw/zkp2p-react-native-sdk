# FlowState Documentation

## Introduction

The `flowState` is a critical state management system in the zkp2p React Native SDK that tracks the current stage of the authentication and proof generation process. It provides developers with a clear understanding of where the user is in the flow and enables appropriate UI responses.

## FlowState Type Definition

```typescript
export type FlowState =
  | 'idle'
  | 'authenticating'
  | 'authenticated'
  | 'actionStarted'
  | 'proofGenerating'
  | 'proofGeneratedSuccess'
  | 'proofGeneratedFailure';
```

## State Descriptions

### `idle`
The default state when no active process is running. This is the initial state when the provider is loaded and the state returns to after completing or cancelling operations.

**When it occurs:**
- Initial component mount
- After authentication failure/cancellation
- After proof generation completion or cancellation
- When user navigates away from authenticated state

**UI implications:**
- No modal overlays
- Ready to accept new operations

### `authenticating`
The user is currently authenticating with the payment provider through a WebView.

**When it occurs:**
- After calling `initiate()` without an actionLink
- After calling `authenticate()`
- After completing an initial action (from `actionStarted`)

**UI implications:**
- Auth WebView is displayed
- User can minimize or close the WebView
- Loading indicators may be shown

**Code example:**
```typescript
const { flowState, initiate } = useZkp2p();

// Triggers authenticating state
await initiate('venmo', 'payment');
```

### `authenticated`
Authentication was successful and transaction/payment data has been extracted.

**When it occurs:**
- After successful interception of provider response
- When session is restored from storage

**UI implications:**
- WebView is closed
- Transaction list is available in `metadataList`
- Ready for proof generation

**Available data:**
```typescript
const { flowState, metadataList, interceptedPayload } = useZkp2p();

if (flowState === 'authenticated') {
  // Access extracted transactions
  console.log('Transactions:', metadataList);
  // Access raw intercepted data
  console.log('Payload:', interceptedPayload);
}
```

### `actionStarted`
An initial action is required before authentication (e.g., opening a payment app via deep link).

**When it occurs:**
- When provider config includes `mobile.actionLink`
- After calling `initiate()` with `initialAction` options

**UI implications:**
- May show WebView for in-app actions
- May redirect to external app
- Transition to authentication after completion

**Code example:**
```typescript
await initiate('cashapp', 'payment', {
  initialAction: {
    enabled: true,
    urlVariables: {
      userId: 'user123'
    }
  }
});
```

### `proofGenerating`
A cryptographic proof is being generated from the authenticated data.

**When it occurs:**
- After calling `generateProof()`
- Automatically if `autoGenerateProof` option is set

**UI implications:**
- Modal spinner overlay is shown
- "Authenticating..." message displayed
- User can cancel via exit button

**Code example:**
```typescript
const { generateProof, flowState } = useZkp2p();

if (flowState === 'authenticated') {
  // Generate proof for first transaction
  await generateProof(provider, payload, intentHash, 0);
}
```

### `proofGeneratedSuccess`
Proof generation completed successfully.

**When it occurs:**
- After successful proof generation
- Before automatic transition to `idle` (1 second delay)

**UI implications:**
- Success checkmark shown
- "Successfully Authenticated!" message
- Modal closes automatically after 1 second

**Available data:**
```typescript
const { flowState, proofData } = useZkp2p();

if (flowState === 'proofGeneratedSuccess') {
  // Access generated proof(s)
  console.log('Proofs:', proofData);
}
```

### `proofGeneratedFailure`
Proof generation failed due to an error.

**When it occurs:**
- Network errors during proof generation
- Invalid data or parameters
- Witness server errors
- User-cancelled proof generation (gnark)

**UI implications:**
- Error message displayed
- Retry and Close buttons available
- Error details shown to user

**Error handling:**
```typescript
const { flowState, proofError } = useZkp2p();

if (flowState === 'proofGeneratedFailure') {
  console.error('Proof error:', proofError?.message);
  // User can retry or close
}
```

**Note:** `proofError` is now exposed in the SDK context (v0.0.1-rc.22+)

## Using FlowState in Your Application

### Basic Usage
```typescript
import { useZkp2p } from '@zkp2p/react-native-sdk';

function MyComponent() {
  const { flowState, initiate, generateProof } = useZkp2p();

  // React to state changes
  useEffect(() => {
    switch (flowState) {
      case 'authenticated':
        console.log('Ready to generate proof');
        break;
      case 'proofGeneratedSuccess':
        console.log('Proof ready for use');
        break;
      case 'proofGeneratedFailure':
        console.log('Handle proof error');
        break;
    }
  }, [flowState]);

  return (
    <View>
      <Text>Current State: {flowState}</Text>
      {/* Render UI based on flowState */}
    </View>
  );
}
```

### Conditional Rendering
```typescript
function PaymentProofScreen() {
  const { flowState, metadataList, proofData } = useZkp2p();

  if (flowState === 'idle') {
    return <StartButton />;
  }

  if (flowState === 'authenticating' || flowState === 'actionStarted') {
    return <LoadingIndicator message="Please complete authentication" />;
  }

  if (flowState === 'authenticated') {
    return <TransactionList items={metadataList} />;
  }

  if (flowState === 'proofGenerating') {
    // Modal spinner is shown automatically by SDK
    return null;
  }

  if (flowState === 'proofGeneratedSuccess') {
    return <ProofDisplay proof={proofData} />;
  }

  if (flowState === 'proofGeneratedFailure') {
    // Error modal is shown automatically by SDK
    return null;
  }
}
```

### Auto-Generate Proof Flow
```typescript
// Automatically generate proof after authentication
await initiate('venmo', 'payment', {
  autoGenerateProof: {
    intentHash: '0x...', // optional
    itemIndex: 0, // optional, defaults to 0
    onProofGenerated: (proof) => {
      console.log('Auto-generated proof:', proof);
    },
    onProofError: (error) => {
      console.error('Auto-generation failed:', error);
    }
  }
});
```

### State Flow Example
```typescript
function CompletePaymentFlow() {
  const { 
    flowState, 
    initiate, 
    authenticate, 
    generateProof,
    metadataList,
    proofData 
  } = useZkp2p();

  const handleFullFlow = async () => {
    // 1. Start with idle state
    console.log('State:', flowState); // 'idle'

    // 2. Initiate authentication
    await initiate('cashapp', 'payment');
    // State: 'actionStarted' -> 'authenticating'

    // 3. User completes authentication
    // State: 'authenticated'
    
    // 4. Generate proof for first transaction
    if (metadataList.length > 0) {
      await generateProof(provider, payload, intentHash, 0);
      // State: 'proofGenerating' -> 'proofGeneratedSuccess'
    }

    // 5. Access the proof
    console.log('Generated proof:', proofData);
    // State: automatically returns to 'idle' after 1 second
  };

  return <Button onPress={handleFullFlow} title="Start" />;
}
```

## Best Practices

1. **Always check flowState before operations:**
   ```typescript
   if (flowState === 'authenticated') {
     // Safe to generate proof
     await generateProof(...);
   }
   ```

2. **Handle all possible states in your UI:**
   ```typescript
   const getStateMessage = (state: FlowState) => {
     const messages = {
       idle: 'Ready to start',
       authenticating: 'Please log in',
       authenticated: 'Select a transaction',
       actionStarted: 'Opening app...',
       proofGenerating: 'Generating proof...',
       proofGeneratedSuccess: 'Success!',
       proofGeneratedFailure: 'Error occurred'
     };
     return messages[state];
   };
   ```

3. **Use state transitions for analytics:**
   ```typescript
   useEffect(() => {
     analytics.track('flow_state_changed', {
       state: flowState,
       timestamp: Date.now()
     });
   }, [flowState]);
   ```

4. **Implement proper error handling:**
   ```typescript
   if (flowState === 'proofGeneratedFailure') {
     // Log error for debugging
     console.error('Proof generation failed:', proofError);
     
     // Show user-friendly message
     Alert.alert(
       'Authentication Failed',
       'Please try again or contact support.',
       [{ text: 'OK' }]
     );
   }
   ```

## Debugging FlowState

Enable debug logging to track state transitions:

```typescript
useEffect(() => {
  console.log('[FlowState Debug]', {
    current: flowState,
    hasProvider: !!provider,
    hasPayload: !!interceptedPayload,
    transactionCount: metadataList.length,
    proofCount: proofData.length,
    error: authError || proofError
  });
}, [flowState, provider, interceptedPayload, metadataList, proofData, authError, proofError]);
```

## Related APIs

- `initiate()` - Start the authentication flow
- `authenticate()` - Re-authenticate with existing provider
- `generateProof()` - Generate cryptographic proof
- `metadataList` - Extracted transaction data (available when authenticated)
- `proofData` - Generated proofs (available after successful generation)
- `authError` - Authentication errors
- `proofError` - Proof generation errors (exposed in context)