import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import type {
  ProviderSettings,
  InitiateOptions as SDKInitiateOptions,
  AuthenticateOptions as SDKAuthenticateOptions,
} from '../../../src/';
import { useZkp2p } from '../../../src/';

interface Props {
  isAuthenticating: boolean;
  initiate: (
    platform: string,
    actionType: string,
    options?: SDKInitiateOptions
  ) => Promise<ProviderSettings>;
  authenticate: (
    platform: string,
    actionType: string,
    options?: SDKAuthenticateOptions
  ) => Promise<void>;
  onGoBack: () => void;
}

export const AuthenticationScreen: React.FC<Props> = ({
  isAuthenticating,
  initiate,
  authenticate,
  onGoBack,
}) => {
  const [activePlatform, setActivePlatform] = useState<string | null>(null);
  const [autoProofEnabled, setAutoProofEnabled] = useState(false);
  const { clearSession, resetState } = useZkp2p();

  const handleSelect = async (platform: string, action: string) => {
    setActivePlatform(platform);
    try {
      // Wise and Mercado Pago: still use initiate (action step first)
      // Others: use authenticate() directly
      const useAuthenticate = platform !== 'wise' && platform !== 'mercadopago';

      const authOptions: SDKAuthenticateOptions = {
        autoGenerateProof: autoProofEnabled
          ? {
              intentHash:
                '0x0000000000000000000000000000000000000000000000000000000000000001',
              itemIndex: 0,
              onProofGenerated: (proofData) => {
                console.log('Auto-generated proof:', proofData);
              },
              onProofError: (error) => {
                console.error('Auto-generation failed:', error);
              },
            }
          : undefined,
      };

      let initiateOptions: SDKInitiateOptions = {};

      // Add initialAction with URL variables for platforms that need them (Wise and Mercado Pago)
      if (!useAuthenticate) {
        initiateOptions.initialAction = {};

        // Add paymentDetails for MercadoPago to enable auto-fill
        if (platform === 'mercadopago') {
          initiateOptions.initialAction.paymentDetails = {
            RECIPIENT_ID: '0720000791240000001234',
            AMOUNT: '100',
          };
        }

        if (platform === 'wise') {
          initiateOptions.initialAction.paymentDetails = {
            RECIPIENT_ID: 'alexanders6341',
          };
        }
      }

      if (useAuthenticate && authenticate) {
        await authenticate(platform, action, authOptions);
      } else if (initiate) {
        await initiate(platform, action, initiateOptions);
      }
    } finally {
      setActivePlatform(null);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={onGoBack} style={styles.backButton}>
        <Text style={styles.backButtonText}>‹ Back</Text>
      </TouchableOpacity>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Select Platform</Text>

        <View style={styles.toggleContainer}>
          <Text style={styles.toggleLabel}>Auto-generate proof:</Text>
          <TouchableOpacity
            style={[styles.toggle, autoProofEnabled && styles.toggleActive]}
            onPress={() => setAutoProofEnabled(!autoProofEnabled)}
          >
            <Text style={styles.toggleText}>
              {autoProofEnabled ? 'ON' : 'OFF'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.button, styles.clearButton]}
          onPress={async () => {
            try {
              await clearSession?.();
              Alert.alert('Session Cleared', 'All cookies have been cleared.');
            } catch (e) {
              console.error('Failed to clear session', e);
              Alert.alert('Error', 'Failed to clear cookies.');
            }
          }}
        >
          <Text style={styles.buttonText}>Clear Cookies (Force Login)</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.clearButton]}
          onPress={async () => {
            try {
              await resetState?.();
              Alert.alert('SDK Reset', 'Internal SDK state has been reset.');
            } catch (e) {
              console.error('Failed to reset SDK state', e);
              Alert.alert('Error', 'Failed to reset SDK state.');
            }
          }}
        >
          <Text style={styles.buttonText}>Reset SDK State</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.button,
            isAuthenticating && activePlatform === 'venmo' && styles.disabled,
          ]}
          disabled={isAuthenticating && activePlatform === 'venmo'}
          onPress={() => handleSelect('venmo', 'transfer_venmo')}
        >
          {isAuthenticating && activePlatform === 'venmo' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Venmo</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.button,
            isAuthenticating && activePlatform === 'revolut' && styles.disabled,
          ]}
          disabled={isAuthenticating && activePlatform === 'revolut'}
          onPress={() => handleSelect('revolut', 'transfer_revolut')}
        >
          {isAuthenticating && activePlatform === 'revolut' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Revolut</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.button,
            isAuthenticating && activePlatform === 'chase' && styles.disabled,
          ]}
          disabled={isAuthenticating && activePlatform === 'chase'}
          onPress={() => handleSelect('chase', 'transfer_zelle')}
        >
          {isAuthenticating && activePlatform === 'chase' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Chase (Zelle)</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.button,
            isAuthenticating &&
              activePlatform === 'bankofamerica' &&
              styles.disabled,
          ]}
          disabled={isAuthenticating && activePlatform === 'bankofamerica'}
          onPress={() => handleSelect('bankofamerica', 'transfer_zelle')}
        >
          {isAuthenticating && activePlatform === 'bankofamerica' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Bank of America (Zelle)</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.button,
            isAuthenticating && activePlatform === 'citi' && styles.disabled,
          ]}
          disabled={isAuthenticating && activePlatform === 'citi'}
          onPress={() => handleSelect('citi', 'transfer_zelle')}
        >
          {isAuthenticating && activePlatform === 'citi' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Citibank (Zelle)</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.button,
            isAuthenticating &&
              activePlatform === 'mercadopago' &&
              styles.disabled,
          ]}
          disabled={isAuthenticating && activePlatform === 'mercadopago'}
          onPress={() => handleSelect('mercadopago', 'transfer_mercado_pago')}
        >
          {isAuthenticating && activePlatform === 'mercadopago' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Mercado Pago</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.button,
            isAuthenticating && activePlatform === 'wise' && styles.disabled,
          ]}
          disabled={isAuthenticating && activePlatform === 'wise'}
          onPress={() => handleSelect('wise', 'transfer_wise')}
        >
          {isAuthenticating && activePlatform === 'wise' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Wise</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.button,
            isAuthenticating && activePlatform === 'cashapp' && styles.disabled,
          ]}
          disabled={isAuthenticating && activePlatform === 'cashapp'}
          onPress={() => handleSelect('cashapp', 'transfer_cashapp')}
        >
          {isAuthenticating && activePlatform === 'cashapp' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Cash App</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.button,
            isAuthenticating && activePlatform === 'luxon' && styles.disabled,
          ]}
          disabled={isAuthenticating && activePlatform === 'luxon'}
          onPress={() => handleSelect('luxon', 'transfer_luxon')}
        >
          {isAuthenticating && activePlatform === 'luxon' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Luxon</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f5f5f5' },
  scrollContent: { paddingBottom: 40 },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    marginTop: 30,
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    padding: 10,
    backgroundColor: '#fff',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleLabel: {
    fontSize: 16,
    marginRight: 10,
    color: '#333',
  },
  toggle: {
    backgroundColor: '#ddd',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 60,
    alignItems: 'center',
  },
  toggleActive: {
    backgroundColor: '#007AFF',
  },
  toggleText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  clearButton: {
    backgroundColor: '#ff3b30',
  },
  disabled: { backgroundColor: '#9bb8ff' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  backButton: {
    position: 'absolute',
    top: 20,
    left: 20,
    zIndex: 10,
  },
  backButtonText: {
    color: '#007AFF',
    fontSize: 18,
  },
});
