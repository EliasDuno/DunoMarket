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
  
  const [startDate, setStartDate] = useState(new Date(new Date().setDate(new Date().getDate() - 30)));
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
        <Text style={styles.title}>Reportes</Text>
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
    backgroundColor: '#0f172a',
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
    color: '#f8fafc',
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
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 4,
  },
  dateBtn: {
    backgroundColor: '#1e293b',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  dateBtnText: {
    color: '#f8fafc',
  },
  dashboardContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  dashCard: {
    backgroundColor: '#1e293b',
    width: '48%',
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
  },
  dashValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#f8fafc',
  },
  dashLabel: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#e2e8f0',
    marginHorizontal: 16,
    marginBottom: 8,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: '#1e293b',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f8fafc',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  details: {
    fontSize: 14,
    color: '#94a3b8',
  },
  total: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4ade80',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    color: '#64748b',
  }
});
