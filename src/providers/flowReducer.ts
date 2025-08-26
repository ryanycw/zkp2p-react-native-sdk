import type { FlowState } from '../types';

export type FlowEvent =
  | { type: 'NEW_SESSION' }
  | { type: 'RESET' }
  | { type: 'ACTION_START' }
  | { type: 'AUTH_OPEN' }
  | { type: 'AUTH_SUCCESS' }
  | { type: 'AUTH_SUCCESS_WITH_ERROR'; error: Error | null }
  | { type: 'AUTH_FAILURE'; error: Error }
  | { type: 'AUTH_CLOSE' }
  | { type: 'PROOF_START' }
  | { type: 'PROOF_SUCCESS' }
  | { type: 'PROOF_FAILURE'; error: Error }
  | { type: 'PROOF_DISMISS' }
  | { type: 'SET_AUTH_ERROR'; error: Error | null }
  | { type: 'SET_PROOF_ERROR'; error: Error | null };

export interface FlowSlice {
  phase: FlowState;
  authError: Error | null;
  proofError: Error | null;
  session: number;
}

export const initialFlow: FlowSlice = {
  phase: 'idle',
  authError: null,
  proofError: null,
  session: 0,
};

export function flowReducer(state: FlowSlice, evt: FlowEvent): FlowSlice {
  switch (evt.type) {
    case 'NEW_SESSION':
    case 'RESET':
      return {
        phase: 'idle',
        authError: null,
        proofError: null,
        session: state.session + 1,
      };
    case 'ACTION_START':
      if (state.phase === 'idle' || state.phase === 'authenticated') {
        return { ...state, authError: null, phase: 'actionStarted' };
      }
      return state;
    case 'AUTH_OPEN':
      return { ...state, authError: null, phase: 'authenticating' };
    case 'AUTH_SUCCESS':
      return { ...state, authError: null, phase: 'authenticated' };
    case 'AUTH_SUCCESS_WITH_ERROR':
      return { ...state, authError: evt.error, phase: 'authenticated' };
    case 'AUTH_FAILURE':
      return { ...state, authError: evt.error, phase: 'idle' };
    case 'AUTH_CLOSE':
      return { ...state, phase: 'idle' };
    case 'PROOF_START':
      return { ...state, proofError: null, phase: 'proofGenerating' };
    case 'PROOF_SUCCESS':
      return { ...state, proofError: null, phase: 'proofGeneratedSuccess' };
    case 'PROOF_FAILURE':
      return {
        ...state,
        proofError: evt.error,
        phase: 'proofGeneratedFailure',
      };
    case 'PROOF_DISMISS':
      return { ...state, proofError: null, phase: 'idle' };
    case 'SET_AUTH_ERROR':
      return { ...state, authError: evt.error };
    case 'SET_PROOF_ERROR':
      return { ...state, proofError: evt.error };
    default:
      return state;
  }
}
