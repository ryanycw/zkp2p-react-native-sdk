# FlowState State Machine Diagram

## Overview
The `flowState` represents the current state of the authentication and proof generation flow in the zkp2p SDK.

## State Machine Diagram

```mermaid
stateDiagram-v2
    [*] --> idle: Initial state
    
    idle --> actionStarted: initiate() with actionLink
    idle --> authenticating: initiate() without actionLink<br/>or authenticate()
    
    actionStarted --> authenticating: Action completed
    
    authenticating --> authenticated: Auth successful
    authenticating --> idle: Auth failed/cancelled
    
    authenticated --> proofGenerating: generateProof() called<br/>or auto-generate triggered
    authenticated --> idle: User navigates away
    
    proofGenerating --> proofGeneratedSuccess: Proof generated
    proofGenerating --> proofGeneratedFailure: Proof generation failed
    proofGenerating --> idle: User cancels
    
    proofGeneratedSuccess --> idle: After 1 second
    proofGeneratedFailure --> proofGenerating: User retries
    proofGeneratedFailure --> idle: User closes
    
    idle --> [*]: Component unmounts

    note right of idle
        Default state when no 
        active process is running
    end note
    
    note right of actionStarted
        When provider has an 
        actionLink (e.g., deep link 
        to open payment app)
    end note
    
    note right of authenticating
        WebView is shown for
        user authentication
    end note
    
    note right of authenticated
        Auth successful, 
        transaction data extracted
    end note
    
    note right of proofGenerating
        Spinner modal shown,
        proof being generated
    end note
```

## State Transitions Table

| From State | To State | Trigger | Description |
|------------|----------|---------|-------------|
| `idle` | `actionStarted` | `initiate()` with actionLink | Initial action required before auth |
| `idle` | `authenticating` | `initiate()` without actionLink or `authenticate()` | Direct authentication |
| `actionStarted` | `authenticating` | Action completion | User completes initial action |
| `authenticating` | `authenticated` | Successful auth | Auth WebView intercepted valid response |
| `authenticating` | `idle` | Auth failure/cancel | User cancels or auth fails |
| `authenticated` | `proofGenerating` | `generateProof()` or auto-generate | Proof generation starts |
| `authenticated` | `idle` | User navigation | User goes back without generating proof |
| `proofGenerating` | `proofGeneratedSuccess` | Proof success | Proof generated successfully |
| `proofGenerating` | `proofGeneratedFailure` | Proof error | Proof generation failed |
| `proofGenerating` | `idle` | User cancels | User presses exit button |
| `proofGeneratedSuccess` | `idle` | Timer (1s) | Automatic transition after success |
| `proofGeneratedFailure` | `proofGenerating` | User retry | User clicks retry button |
| `proofGeneratedFailure` | `idle` | User closes | User clicks close button |
