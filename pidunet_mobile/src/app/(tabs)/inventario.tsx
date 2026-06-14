import { StyleSheet, Text, View, FlatList, ActivityIndicator, TouchableOpacity, ScrollView } from 'react-native';
import { api } from '@/lib/api';
import { useEffect, useState } from 'react';

export default function InventarioScreen() {
  const [productos, setProductos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'disponible' | 'principal' | 'secundaria' | 'agotado'>('disponible');

  useEffect(() => {
    fetchProductos();
  }, []);

  async function fetchProductos() {
    try {
      const { data, error } = await api.get('/api/products');
      
      if (error) {
        console.error('Error fetching productos:', error);
      } else {
        setProductos(data || []);
      }
    } finally {
      setLoading(false);
    }
  }

  const renderItem = ({ item }: { item: any }) => {
    let stockToShow = item.stock;
    if (activeTab === 'principal') stockToShow = item.stock_principal || 0;
    else if (activeTab === 'secundaria') stockToShow = item.stock_secundaria || 0;

    let stockColor = '#22c55e'; // Green
    if (stockToShow <= 0) {
      stockColor = '#ef4444'; // Red
    } else if (stockToShow <= (item.stock_minimo || 5)) {
      stockColor = '#eab308'; // Yellow
    }

    return (
      <View style={styles.card}>
        <Text style={styles.productName}>{item.nombre}</Text>
        <Text style={styles.productCode}>Código: {item.codigo}</Text>
        <View style={styles.row}>
          <Text style={styles.stock}>
            Stock: <Text style={{ fontWeight: 'bold', color: stockColor }}>{stockToShow}</Text>
          </Text>
          <Text style={styles.price}>${item.costo_usd}</Text>
        </View>
      </View>
    );
  };

  const filteredProductos = productos.filter(p => {
    let stockToShow = p.stock;
    if (activeTab === 'principal') stockToShow = p.stock_principal || 0;
    else if (activeTab === 'secundaria') stockToShow = p.stock_secundaria || 0;
    
    let totalStock = (p.stock || 0) + (p.stock_principal || 0) + (p.stock_secundaria || 0);

    if (activeTab === 'agotado') {
      return totalStock <= 0;
    } else {
      return stockToShow > 0;
    }
  });

  return (
    <View style={styles.container}>

      <View style={styles.tabContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'disponible' && styles.activeTab]} 
            onPress={() => setActiveTab('disponible')}
          >
            <Text style={[styles.tabText, activeTab === 'disponible' && styles.activeTabText]}>Venta</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'principal' && styles.activeTab]} 
            onPress={() => setActiveTab('principal')}
          >
            <Text style={[styles.tabText, activeTab === 'principal' && styles.activeTabText]}>Principal</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'secundaria' && styles.activeTab]} 
            onPress={() => setActiveTab('secundaria')}
          >
            <Text style={[styles.tabText, activeTab === 'secundaria' && styles.activeTabText]}>Secundaria</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'agotado' && styles.activeTab]} 
            onPress={() => setActiveTab('agotado')}
          >
            <Text style={[styles.tabText, activeTab === 'agotado' && styles.activeTabText]}>Agotado</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#0000ff" style={{ marginTop: 20 }} />
      ) : filteredProductos.length === 0 ? (
        <Text style={styles.emptyText}>No hay productos en esta lista.</Text>
      ) : (
        <FlatList
          data={filteredProductos}
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
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    margin: 16,
    color: '#333',
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
  productCode: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  stock: {
    fontSize: 14,
    color: '#444',
  },
  price: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0d6efd',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    color: '#666',
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#e5e5e5',
    borderRadius: 8,
    overflow: 'hidden',
  },
  tab: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeTab: {
    backgroundColor: '#0d6efd',
  },
  tabText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  activeTabText: {
    color: '#fff',
  }
});
