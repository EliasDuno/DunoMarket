import { Tabs } from 'expo-router';
import AlertBell from '@/components/AlertBell';

export default function TabLayout() {
  return (
    <Tabs 
      screenOptions={{ 
        tabBarActiveTintColor: 'blue',
        headerRight: () => <AlertBell />
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
