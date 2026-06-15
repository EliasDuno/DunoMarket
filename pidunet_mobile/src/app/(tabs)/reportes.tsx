import { StyleSheet, Text, View, FlatList, ActivityIndicator, Button, TouchableOpacity, Platform } from 'react-native';
import { api } from '@/lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';

export default function ReportesScreen() {
  const [ventas, setVentas] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [endDate, setEndDate] = useState(new Date());
  
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const router = useRouter();

  useEffect(() => {
    fetchReports();
  }, [startDate, endDate]);

  async function fetchReports() {
    setLoading(true);
    try {
      const payload = {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
      };
      
      const { data: dashData } = await api.post('/api/reports/dashboard', payload);
      if (dashData?.success) {
        setDashboard(dashData.dashboard);
      }
      
      const { data: histData } = await api.post('/api/reports/history', payload);
      if (histData?.success) {
        setVentas(histData.history || []);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    await AsyncStorage.removeItem('user_session');
    await AsyncStorage.removeItem('tenant_slug');
    router.replace('/(auth)/login');
  }

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <Text style={styles.productName}>{item.cliente || 'Cliente General'}</Text>
      <View style={styles.row}>
        <Text style={styles.details}>{new Date(item.fecha).toLocaleDateString()} - {item.metodo_pago}</Text>
        <Text style={styles.total}>${Number(item.total_usd).toFixed(2)}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View />
        <Button title="Salir" color="#d32f2f" onPress={handleSignOut} />
      </View>

      <View style={styles.filtersContainer}>
        <View style={styles.datePickerWrapper}>
          <Text style={styles.dateLabel}>Desde:</Text>
          <TouchableOpacity style={styles.dateBtn} onPress={() => setShowStartPicker(true)}>
            <Text style={styles.dateBtnText}>{startDate.toLocaleDateString()}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.datePickerWrapper}>
          <Text style={styles.dateLabel}>Hasta:</Text>
          <TouchableOpacity style={styles.dateBtn} onPress={() => setShowEndPicker(true)}>
            <Text style={styles.dateBtnText}>{endDate.toLocaleDateString()}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {showStartPicker && (
        <DateTimePicker
          value={startDate}
          mode="date"
          display="default"
          onChange={(event, date) => {
            if (Platform.OS === 'android') setShowStartPicker(false);
            if (date) setStartDate(date);
          }}
        />
      )}

      {showEndPicker && (
        <DateTimePicker
          value={endDate}
          mode="date"
          display="default"
          onChange={(event, date) => {
            if (Platform.OS === 'android') setShowEndPicker(false);
            if (date) setEndDate(date);
          }}
        />
      )}
      
      {dashboard && (
        <View style={styles.dashboardContainer}>
          <View style={[styles.dashCard, { borderLeftColor: '#3b82f6' }]}>
            <Text style={styles.dashValue}>${Number(dashboard.total_ventas_usd).toFixed(2)}</Text>
            <Text style={styles.dashLabel}>Ventas Totales (USD)</Text>
          </View>
          <View style={[styles.dashCard, { borderLeftColor: '#10b981' }]}>
            <Text style={styles.dashValue}>{Number(dashboard.total_ventas_bs).toFixed(2)} Bs</Text>
            <Text style={styles.dashLabel}>Ventas Totales (Bs)</Text>
          </View>
          <View style={[styles.dashCard, { borderLeftColor: '#f59e0b', width: '100%', marginTop: 8 }]}>
            <Text style={styles.dashValue}>${Number(dashboard.est_profit_usd).toFixed(2)}</Text>
            <Text style={styles.dashLabel}>Ganancia Estimada (USD)</Text>
          </View>
        </View>
      )}

      <Text style={styles.sectionTitle}>Historial de Ventas</Text>

      {loading ? (
        <ActivityIndicator size="large" color="#4caf50" style={{ marginTop: 20 }} />
      ) : ventas.length === 0 ? (
        <Text style={styles.emptyText}>No hay ventas en este rango de fecha.</Text>
      ) : (
        <FlatList
          data={ventas}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    margin: 16,
    marginTop: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
  },
  filtersContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  datePickerWrapper: {
    flex: 1,
    marginHorizontal: 4,
  },
  dateLabel: {
    color: '#666',
    fontSize: 12,
    marginBottom: 4,
  },
  dateBtn: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  dateBtnText: {
    color: '#333',
  },
  dashboardContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  dashCard: {
    backgroundColor: '#fff',
    width: '48%',
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  dashValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111',
  },
  dashLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginHorizontal: 16,
    marginBottom: 8,
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  details: {
    fontSize: 14,
    color: '#666',
  },
  total: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0d6efd',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    color: '#666',
  }
});
