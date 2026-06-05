import { StyleSheet, Text, View, FlatList, ActivityIndicator, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { api } from '@/lib/api';
import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';

export default function CuentasScreen() {
  const [cuentas, setCuentas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'PENDIENTE' | 'PAGADO'>('PENDIENTE');

  // Modal State
  const [payModalVisible, setPayModalVisible] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchCuentas();
  }, []);

  async function fetchCuentas() {
    try {
      const { data, error } = await api.get('/api/commitments');
      if (error) {
        console.error('Error fetching cuentas:', error);
      } else {
        setCuentas(data || []);
      }
    } finally {
      setLoading(false);
    }
  }

  const handlePay = async () => {
    if (!selectedInvoice) return;
    const monto = parseFloat(amount);
    
    if (isNaN(monto) || monto <= 0) {
      Alert.alert('Error', 'Ingrese un monto válido');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await api.post(`/api/commitments/${selectedInvoice.id}/payments`, {
        monto,
        referencia: reference
      });

      if (error) {
        Alert.alert('Error', 'No se pudo registrar el pago');
      } else {
        Alert.alert('Éxito', 'Pago registrado correctamente');
        setPayModalVisible(false);
        setAmount('');
        setReference('');
        fetchCuentas(); // Recargar datos
      }
    } catch (e) {
      Alert.alert('Error', 'Error de red');
    } finally {
      setSubmitting(false);
    }
  };

  const openPayModal = (invoice: any) => {
    setSelectedInvoice(invoice);
    const pendingAmount = parseFloat(invoice.monto_total_usd) - parseFloat(invoice.monto_pagado_usd || 0);
    setAmount(pendingAmount.toFixed(2));
    setReference('');
    setPayModalVisible(true);
  };

  const filteredCuentas = cuentas.filter(c => {
    if (activeTab === 'PENDIENTE') return c.estado !== 'PAGADO';
    return c.estado === 'PAGADO';
  });

  const renderItem = ({ item }: { item: any }) => {
    const isPendiente = item.estado !== 'PAGADO';
    
    // Lógica de colores de vencimiento
    let statusColor = '#4caf50'; // Verde por defecto (A tiempo)
    let dateColor = '#333';
    
    if (isPendiente && item.fecha_vencimiento) {
      const today = new Date();
      today.setHours(0,0,0,0);
      const dueDate = new Date(item.fecha_vencimiento);
      const diffTime = dueDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
      
      if (diffDays <= 0) {
        statusColor = '#ef4444'; // Rojo
        dateColor = '#ef4444';
      } else if (diffDays <= 5) {
        statusColor = '#f59e0b'; // Amarillo
        dateColor = '#d97706';
      }
    } else if (!isPendiente) {
      statusColor = '#9e9e9e'; // Gris
    }

    const pendingAmount = parseFloat(item.monto_total_usd) - parseFloat(item.monto_pagado_usd || 0);

    return (
      <View style={[styles.card, { borderLeftColor: statusColor }]}>
        <View style={styles.headerRow}>
          <Text style={styles.description}>{item.descripcion}</Text>
          <View style={[styles.badge, isPendiente ? { backgroundColor: statusColor + '20' } : styles.badgePagado]}>
            <Text style={[styles.badgeText, isPendiente ? { color: statusColor } : {}]}>{item.estado}</Text>
          </View>
        </View>
        <Text style={styles.invoice}>Factura: {item.numero_factura || 'N/A'}</Text>
        
        <View style={styles.row}>
          <View>
            <Text style={styles.label}>Total</Text>
            <Text style={styles.amount}>${item.monto_total_usd}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.label}>Vencimiento</Text>
            <Text style={[styles.date, { color: dateColor }]}>
              {new Date(item.fecha_vencimiento).toLocaleDateString()}
            </Text>
          </View>
        </View>

        {isPendiente && (
          <View style={styles.actionRow}>
            <Text style={styles.pendingText}>Falta: ${pendingAmount.toFixed(2)}</Text>
            <TouchableOpacity style={styles.payButton} onPress={() => openPayModal(item)}>
              <Ionicons name="cash-outline" size={18} color="#208AEF" />
              <Text style={styles.payButtonText}>Registrar Pago</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Selector de Pestañas Internas */}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'PENDIENTE' && styles.tabActive]} 
          onPress={() => setActiveTab('PENDIENTE')}
        >
          <Text style={[styles.tabText, activeTab === 'PENDIENTE' && styles.tabTextActive]}>Pendientes</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'PAGADO' && styles.tabActive]} 
          onPress={() => setActiveTab('PAGADO')}
        >
          <Text style={[styles.tabText, activeTab === 'PAGADO' && styles.tabTextActive]}>Historial (Pagadas)</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#0000ff" style={{ marginTop: 20 }} />
      ) : filteredCuentas.length === 0 ? (
        <Text style={styles.emptyText}>No hay facturas en esta categoría.</Text>
      ) : (
        <FlatList
          data={filteredCuentas}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}

      {/* Modal de Pago */}
      <Modal
        visible={payModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setPayModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Registrar Pago</Text>
              <TouchableOpacity onPress={() => setPayModalVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            {selectedInvoice && (
              <View style={{ marginBottom: 15 }}>
                <Text style={styles.invoice}>Factura: {selectedInvoice.numero_factura}</Text>
                <Text style={styles.amount}>Total: ${selectedInvoice.monto_total_usd}</Text>
              </View>
            )}

            <Text style={styles.inputLabel}>Monto a Pagar ($)</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
            />

            <Text style={styles.inputLabel}>Referencia (Opcional)</Text>
            <TextInput
              style={styles.input}
              value={reference}
              onChangeText={setReference}
              placeholder="Ej: Zelle o Transf. 1234"
            />

            <TouchableOpacity 
              style={[styles.submitButton, submitting && { opacity: 0.7 }]} 
              onPress={handlePay}
              disabled={submitting}
            >
              <Text style={styles.submitButtonText}>
                {submitting ? 'Procesando...' : 'Confirmar Pago'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 10,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: '#e6f4fe',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },
  tabTextActive: {
    color: '#208AEF',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  description: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
    flex: 1,
    marginRight: 8,
  },
  invoice: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 12,
  },
  label: {
    fontSize: 12,
    color: '#888',
  },
  amount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111',
  },
  date: {
    fontSize: 14,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  pendingText: {
    fontSize: 14,
    color: '#ef4444',
    fontWeight: '600',
  },
  payButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#208AEF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  payButtonText: {
    color: '#208AEF',
    fontWeight: 'bold',
    marginLeft: 6,
    fontSize: 14,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgePagado: {
    backgroundColor: '#e8f5e9',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#555',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    color: '#666',
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
    padding: 20,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  inputLabel: {
    fontSize: 14,
    color: '#555',
    marginBottom: 5,
    fontWeight: '500',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    marginBottom: 15,
    backgroundColor: '#f9f9f9',
  },
  submitButton: {
    backgroundColor: '#208AEF',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  }
});
