import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';

type Props = {
  visible: boolean;
  platform: string;
  actionType: string;
  onAccept: () => void;
  onDeny: () => void; // "Don't ask again"
  onSkip: () => void; // "Not now"
};

export const ConsentSheet: React.FC<Props> = ({
  visible,
  platform,
  actionType,
  onAccept,
  onDeny,
  onSkip,
}) => {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>
            Save your login for faster verification?
          </Text>
          <Text style={styles.subtitle}>Stored securely on this device.</Text>
          <View style={styles.badgeRow}>
            <Text style={styles.badge}>{platform}</Text>
            <Text style={styles.badge}>{actionType}</Text>
          </View>

          <TouchableOpacity
            style={[styles.fullBtn, styles.primary]}
            onPress={onAccept}
          >
            <Text style={styles.fullBtnText}>Save</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.fullBtn, styles.secondary]}
            onPress={onSkip}
          >
            <Text style={styles.fullBtnText}>Not now</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.fullBtn, styles.danger]}
            onPress={onDeny}
          >
            <Text style={styles.fullBtnText}>Don't ask again</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    padding: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  title: { color: '#111', fontSize: 16, fontWeight: '600', marginBottom: 6 },
  subtitle: { color: '#555', fontSize: 13, marginBottom: 12 },
  badgeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  badge: {
    backgroundColor: '#eee',
    color: '#333',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  rowLabel: { color: '#333' },
  fullBtn: {
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  fullBtnText: { color: '#fff', fontWeight: '600' },
  primary: { backgroundColor: '#007AFF' },
  secondary: { backgroundColor: '#9AA0A6' },
  danger: { backgroundColor: '#ff3b30' },
});

export default ConsentSheet;
