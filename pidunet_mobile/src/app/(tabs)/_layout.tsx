import { Tabs } from 'expo-router';
import AlertBell from '@/components/AlertBell';
import { Image, View } from 'react-native';

export default function TabLayout() {
  return (
    <Tabs 
      screenOptions={{ 
        tabBarActiveTintColor: 'blue',
        headerRight: () => <AlertBell />,
        headerLeft: () => (
          <View style={{ marginLeft: 15 }}>
            <Image 
              source={require('../../../assets/images/icon.png')} 
              style={{ width: 32, height: 32, borderRadius: 8 }} 
              resizeMode="contain"
            />
          </View>
        )
      }}
    >
      <Tabs.Screen
        name="reportes"
        options={{
          title: 'Reportes',
        }}
      />
      <Tabs.Screen
        name="inventario"
        options={{
          title: 'Inventario',
        }}
      />
      <Tabs.Screen
        name="cuentas"
        options={{
          title: 'Cuentas x Pagar',
        }}
      />
    </Tabs>
  );
}
