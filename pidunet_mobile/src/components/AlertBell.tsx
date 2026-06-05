import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { useRouter } from 'expo-router';

export default function AlertBell() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [count, setCount] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchAlerts();
    // Opcional: Revisar cada 1 minuto (60000ms)
    const interval = setInterval(fetchAlerts, 60000);
    return () => clearInterval(interval);
  }, []);

  async function fetchAlerts() {
    try {
      const { data, error } = await api.get('/api/alerts');
      if (!error && data) {
        setCount(data.count || 0);
        setAlerts(data.alerts || []);
      }
    } catch (e) {
      console.error('Error fetching alerts in bell:', e);
    }
  }

  const handlePress = () => {
    if (count > 0) {
      setModalVisible(true);
    } else {
      // Si no hay alertas, opcionalmente podrías recargar o no hacer nada.
      fetchAlerts();
    }
  };

  const navigateToCuentas = () => {
    setModalVisible(false);
    router.replace('/(tabs)/cuentas');
  };

  const renderItem = ({ item }: { item: any }) => (
    <TouchableOpacity style={styles.alertItem} onPress={navigateToCuentas}>
      <Ionicons name="warning" size={24} color="#ef4444" style={{ marginRight: 12 }} />
      <View style={styles.alertInfo}>
        <Text style={styles.alertTitle}>{item.proveedor_nombre || 'Proveedor'}</Text>
        <Text style={styles.alertSubtitle}>
          ${item.monto_total_usd} - Vence: {new Date(item.fecha_vencimiento).toLocaleDateString()}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View>
      <TouchableOpacity style={styles.bellContainer} onPress={handlePress}>
        <Ionicons name="notifications-outline" size={28} color="#333" />
        {count > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{count}</Text>
          </View>
        )}
      </TouchableOpacity>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setModalVisible(false)}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Alertas de Vencimiento</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={alerts}
              keyExtractor={(item) => item.id.toString()}
              renderItem={renderItem}
              style={{ maxHeight: 400 }}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  bellContainer: {
    marginRight: 15,
    padding: 5,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    right: 2,
    top: 2,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fff',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  alertItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  alertInfo: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  alertSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
});
