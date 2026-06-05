import AsyncStorage from '@react-native-async-storage/async-storage';

export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://pidunet.vercel.app';

export const api = {
  get: async (endpoint: string) => {
    return request(endpoint, 'GET');
  },
  post: async (endpoint: string, body: any) => {
    return request(endpoint, 'POST', body);
  },
  put: async (endpoint: string, body: any) => {
    return request(endpoint, 'PUT', body);
  },
  delete: async (endpoint: string) => {
    return request(endpoint, 'DELETE');
  }
};

async function request(endpoint: string, method: string, body?: any) {
  // Fetch session data from AsyncStorage
  const sessionStr = await AsyncStorage.getItem('user_session');
  const tenantSlug = await AsyncStorage.getItem('tenant_slug');
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  // Attach tenant slug for dynamic schema routing in backend
  if (tenantSlug) {
    headers['x-tenant-slug'] = tenantSlug;
  }

  // Si en el futuro implementan JWT, se pasaría aquí.
  // Por ahora la web usa la sesión pero podemos pasar el rol o el ID si lo necesitamos.
  if (sessionStr) {
    try {
      const session = JSON.parse(sessionStr);
      if (session.id) {
        headers['x-user-id'] = session.id.toString();
        headers['x-user-role'] = session.rol || 'vendedor';
      }
    } catch (e) {
      console.warn('Error parsing session in API utility', e);
    }
  }

  const config: RequestInit = {
    method,
    headers,
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${API_URL}${endpoint}`, config);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || data.error || 'API Error');
    }
    
    return { data, error: null };
  } catch (error: any) {
    console.error(`API Error on ${method} ${endpoint}:`, error.message);
    return { data: null, error };
  }
}
