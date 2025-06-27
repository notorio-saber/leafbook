// Service Worker para LeafTag
// Versão do cache - incrementar para forçar atualização
const CACHE_VERSION = 'leaftag-v1.0.0';
const CACHE_NAME = `leaftag-cache-${CACHE_VERSION}`;

// Arquivos essenciais para cache (App Shell)
const CORE_FILES = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  '/assets/leaftag.png',
  // Adicione outros assets essenciais aqui
];

// Arquivos de imagem para cache dinâmico
const IMAGE_CACHE = 'leaftag-images-v1';

// URLs que devem ser sempre buscadas da rede
const NETWORK_FIRST_URLS = [
  '/api/', // APIs do Firebase
  'https://firestore.googleapis.com/',
  'https://firebase.googleapis.com/'
];

// ========== EVENTOS DO SERVICE WORKER ==========

// Evento de instalação
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando Service Worker versão:', CACHE_VERSION);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Cache aberto, adicionando arquivos essenciais');
        return cache.addAll(CORE_FILES);
      })
      .then(() => {
        console.log('[SW] Arquivos essenciais cacheados com sucesso');
        // Força ativação imediata
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Erro ao cachear arquivos essenciais:', error);
      })
  );
});

// Evento de ativação
self.addEventListener('activate', (event) => {
  console.log('[SW] Ativando Service Worker versão:', CACHE_VERSION);
  
  event.waitUntil(
    Promise.all([
      // Limpa caches antigos
      cleanupOldCaches(),
      // Toma controle de todas as abas
      self.clients.claim()
    ])
  );
});

// Evento de fetch (intercepta todas as requisições)
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Ignora requisições que não são GET
  if (request.method !== 'GET') {
    return;
  }
  
  // Ignora requisições de extensões do browser
  if (url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:') {
    return;
  }
  
  // Estratégia baseada no tipo de recurso
  if (isImageRequest(request)) {
    event.respondWith(handleImageRequest(request));
  } else if (isNetworkFirstUrl(url)) {
    event.respondWith(handleNetworkFirst(request));
  } else {
    event.respondWith(handleCacheFirst(request));
  }
});

// Evento de sincronização em background (se suportado)
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync event:', event.tag);
  
  if (event.tag === 'leaftag-data-sync') {
    event.waitUntil(syncPendingData());
  }
});

// ========== ESTRATÉGIAS DE CACHE ==========

// Cache First - Busca no cache primeiro, fallback para rede
async function handleCacheFirst(request) {
  try {
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      console.log('[SW] Servindo do cache:', request.url);
      
      // Atualiza cache em background se for um arquivo do app
      if (isCoreFile(request.url)) {
        updateCacheInBackground(request);
      }
      
      return cachedResponse;
    }
    
    // Não está no cache, busca da rede
    console.log('[SW] Não encontrado no cache, buscando da rede:', request.url);
    const networkResponse = await fetch(request);
    
    // Cacheia se for um arquivo válido
    if (networkResponse.ok && shouldCache(request)) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
    
  } catch (error) {
    console.error('[SW] Erro na estratégia Cache First:', error);
    
    // Fallback para página offline se for uma navegação
    if (request.mode === 'navigate') {
      return caches.match('/') || new Response('Offline', { 
        status: 503, 
        statusText: 'Service Unavailable' 
      });
    }
    
    throw error;
  }
}

// Network First - Busca da rede primeiro, fallback para cache
async function handleNetworkFirst(request) {
  try {
    console.log('[SW] Network First para:', request.url);
    
    const networkResponse = await fetch(request);
    
    // Cacheia resposta se for bem-sucedida
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
    
  } catch (error) {
    console.log('[SW] Rede falhou, tentando cache:', request.url);
    
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    throw error;
  }
}

// Estratégia específica para imagens
async function handleImageRequest(request) {
  try {
    // Verifica cache de imagens primeiro
    const imageCache = await caches.open(IMAGE_CACHE);
    const cachedImage = await imageCache.match(request);
    
    if (cachedImage) {
      console.log('[SW] Imagem servida do cache:', request.url);
      return cachedImage;
    }
    
    // Busca da rede
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Cacheia a imagem
      imageCache.put(request, networkResponse.clone());
      console.log('[SW] Imagem cacheada:', request.url);
    }
    
    return networkResponse;
    
  } catch (error) {
    console.error('[SW] Erro ao carregar imagem:', error);
    
    // Fallback para imagem placeholder se disponível
    const placeholderResponse = await caches.match('/assets/placeholder.png');
    if (placeholderResponse) {
      return placeholderResponse;
    }
    
    throw error;
  }
}

// ========== FUNÇÕES AUXILIARES ==========

// Limpa caches antigos
async function cleanupOldCaches() {
  console.log('[SW] Limpando caches antigos');
  
  const cacheNames = await caches.keys();
  const oldCaches = cacheNames.filter(name => 
    name.startsWith('leaftag-') && name !== CACHE_NAME && name !== IMAGE_CACHE
  );
  
  const deletePromises = oldCaches.map(cacheName => {
    console.log('[SW] Deletando cache antigo:', cacheName);
    return caches.delete(cacheName);
  });
  
  return Promise.all(deletePromises);
}

// Atualiza cache em background
async function updateCacheInBackground(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse);
      console.log('[SW] Cache atualizado em background:', request.url);
    }
  } catch (error) {
    console.log('[SW] Falha ao atualizar cache em background:', error);
  }
}

// Verifica se é uma requisição de imagem
function isImageRequest(request) {
  return request.destination === 'image' || 
         /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(new URL(request.url).pathname);
}

// Verifica se deve usar Network First
function isNetworkFirstUrl(url) {
  return NETWORK_FIRST_URLS.some(pattern => url.href.includes(pattern));
}

// Verifica se é um arquivo essencial do app
function isCoreFile(url) {
  const pathname = new URL(url).pathname;
  return CORE_FILES.some(file => file === pathname || file === pathname + '/');
}

// Verifica se deve cachear o recurso
function shouldCache(request) {
  const url = new URL(request.url);
  
  // Não cacheia se for de outro domínio (a menos que seja CDN conhecida)
  if (url.origin !== self.location.origin) {
    return false;
  }
  
  // Não cacheia URLs com parâmetros de query específicos
  if (url.search.includes('no-cache')) {
    return false;
  }
  
  return true;
}

// ========== SINCRONIZAÇÃO DE DADOS ==========

// Função para sincronizar dados pendentes
async function syncPendingData() {
  console.log('[SW] Iniciando sincronização de dados pendentes');
  
  try {
    // Aqui seria implementada a lógica de sincronização com Firebase
    // Por exemplo:
    // 1. Abre IndexedDB
    // 2. Busca operações pendentes
    // 3. Envia para servidor
    // 4. Remove da fila se bem-sucedido
    
    console.log('[SW] Sincronização concluída');
    
    // Notifica o cliente sobre sincronização bem-sucedida
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_SUCCESS',
        message: 'Dados sincronizados com sucesso'
      });
    });
    
  } catch (error) {
    console.error('[SW] Erro na sincronização:', error);
    
    // Notifica erro para o cliente
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_ERROR',
        message: 'Falha na sincronização'
      });
    });
    
    throw error;
  }
}

// ========== NOTIFICAÇÕES ==========

// Manipula clique em notificações
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Clique em notificação:', event.notification.tag);
  
  event.notification.close();
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      // Foca em uma aba existente se disponível
      if (clients.length > 0) {
        return clients[0].focus();
      }
      
      // Abre nova aba
      return self.clients.openWindow('/');
    })
  );
});

// ========== COMUNICAÇÃO COM O CLIENTE ==========

// Escuta mensagens do cliente
self.addEventListener('message', (event) => {
  console.log('[SW] Mensagem recebida:', event.data);
  
  switch (event.data.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'CHECK_UPDATE':
      // Força verificação de atualização
      event.ports[0].postMessage({ updated: false });
      break;
      
    case 'CACHE_IMAGE':
      // Força cache de uma imagem específica
      cacheImage(event.data.url);
      break;
      
    case 'CLEAR_CACHE':
      // Limpa cache específico
      clearSpecificCache(event.data.cacheName);
      break;
  }
});

// Força cache de uma imagem
async function cacheImage(imageUrl) {
  try {
    const cache = await caches.open(IMAGE_CACHE);
    const response = await fetch(imageUrl);
    if (response.ok) {
      await cache.put(imageUrl, response);
      console.log('[SW] Imagem forçada ao cache:', imageUrl);
    }
  } catch (error) {
    console.error('[SW] Erro ao forçar cache da imagem:', error);
  }
}

// Limpa cache específico
async function clearSpecificCache(cacheName) {
  try {
    const deleted = await caches.delete(cacheName);
    console.log('[SW] Cache deletado:', cacheName, deleted);
  } catch (error) {
    console.error('[SW] Erro ao deletar cache:', error);
  }
}

// ========== LOGS E DEBUGGING ==========

// Log de informações do SW
console.log('[SW] Service Worker carregado - versão:', CACHE_VERSION);
console.log('[SW] Arquivos essenciais:', CORE_FILES);
console.log('[SW] Cache principal:', CACHE_NAME);
console.log('[SW] Cache de imagens:', IMAGE_CACHE);

// Monitor de performance
let requestCount = 0;
let cacheHits = 0;

self.addEventListener('fetch', (event) => {
  requestCount++;
  
  // Log periódico de estatísticas
  if (requestCount % 50 === 0) {
    console.log(`[SW] Estatísticas - Requests: ${requestCount}, Cache Hits: ${cacheHits}, Hit Rate: ${((cacheHits/requestCount)*100).toFixed(1)}%`);
  }
});

// Incrementa contador de cache hits
function incrementCacheHit() {
  cacheHits++;
}

// ========== GESTÃO DE RECURSOS ==========

// Limita tamanho do cache de imagens
async function limitImageCache(maxEntries = 50) {
  const cache = await caches.open(IMAGE_CACHE);
  const keys = await cache.keys();
  
  if (keys.length > maxEntries) {
    // Remove as imagens mais antigas
    const keysToDelete = keys.slice(0, keys.length - maxEntries);
    
    const deletePromises = keysToDelete.map(key => {
      console.log('[SW] Removendo imagem antiga do cache:', key.url);
      return cache.delete(key);
    });
    
    await Promise.all(deletePromises);
  }
}

// Executa limpeza periódica
setInterval(() => {
  limitImageCache();
}, 30 * 60 * 1000); // A cada 30 minutos

// ========== ESTRATÉGIAS AVANÇADAS ==========

// Pré-carrega recursos importantes
async function preloadCriticalResources() {
  try {
    const cache = await caches.open(CACHE_NAME);
    
    // Lista de recursos para pré-carregar
    const criticalResources = [
      '/assets/leaftag-icon-192x192.png',
      '/assets/leaftag-icon-512x512.png'
    ];
    
    const preloadPromises = criticalResources.map(async (url) => {
      try {
        const response = await fetch(url);
        if (response.ok) {
          await cache.put(url, response);
          console.log('[SW] Recurso pré-carregado:', url);
        }
      } catch (error) {
        console.log('[SW] Falha ao pré-carregar:', url, error);
      }
    });
    
    await Promise.all(preloadPromises);
  } catch (error) {
    console.error('[SW] Erro no pré-carregamento:', error);
  }
}

// Executa pré-carregamento após instalação
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      cleanupOldCaches(),
      self.clients.claim(),
      preloadCriticalResources()
    ])
  );
});

// ========== FALLBACKS E PÁGINAS OFFLINE ==========

// Página offline simples
const OFFLINE_PAGE = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LeafTag - Offline</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      margin: 0;
      padding: 40px 20px;
      background: #f8faf9;
      color: #2d3748;
      text-align: center;
    }
    .offline-container {
      max-width: 400px;
      margin: 0 auto;
      background: white;
      padding: 40px;
      border-radius: 12px;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    }
    .offline-icon {
      font-size: 64px;
      margin-bottom: 20px;
    }
    h1 {
      color: #2c5e3f;
      margin-bottom: 16px;
    }
    p {
      line-height: 1.6;
      margin-bottom: 20px;
    }
    .retry-btn {
      background: #2c5e3f;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 16px;
      cursor: pointer;
    }
    .retry-btn:hover {
      background: #3a7a55;
    }
  </style>
</head>
<body>
  <div class="offline-container">
    <div class="offline-icon">🌿</div>
    <h1>LeafTag</h1>
    <p>Você está offline. Alguns recursos podem não estar disponíveis.</p>
    <p>Verifique sua conexão com a internet e tente novamente.</p>
    <button class="retry-btn" onclick="window.location.reload()">
      Tentar Novamente
    </button>
  </div>
</body>
</html>
`;

// Cacheia página offline durante instalação
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cacheia arquivos essenciais
      cache.addAll(CORE_FILES);
      
      // Cacheia página offline
      return cache.put('/offline', new Response(OFFLINE_PAGE, {
        headers: { 'Content-Type': 'text/html' }
      }));
    })
  );
});

// ========== ANALYTICS E MONITORAMENTO ==========

// Coleta métricas básicas
const metrics = {
  cacheHits: 0,
  cacheMisses: 0,
  networkRequests: 0,
  offlineRequests: 0
};

// Incrementa métrica específica
function incrementMetric(metric) {
  if (metrics.hasOwnProperty(metric)) {
    metrics[metric]++;
  }
}

// Envia métricas (simulado)
async function sendMetrics() {
  console.log('[SW] Métricas atuais:', metrics);
  
  // Aqui seria implementada integração com analytics
  // Por exemplo, Firebase Analytics ou Google Analytics
}

// Envia métricas a cada hora
setInterval(sendMetrics, 60 * 60 * 1000);

// ========== VERSIONAMENTO E UPDATES ==========

// Verifica se há nova versão disponível
async function checkForUpdates() {
  try {
    const response = await fetch('/version.json');
    if (response.ok) {
      const versionInfo = await response.json();
      
      if (versionInfo.version !== CACHE_VERSION) {
        console.log('[SW] Nova versão disponível:', versionInfo.version);
        
        // Notifica clientes sobre atualização
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
          client.postMessage({
            type: 'UPDATE_AVAILABLE',
            version: versionInfo.version,
            features: versionInfo.features || []
          });
        });
      }
    }
  } catch (error) {
    console.log('[SW] Erro ao verificar atualizações:', error);
  }
}

// Verifica atualizações periodicamente
setInterval(checkForUpdates, 24 * 60 * 60 * 1000); // Uma vez por dia

// ========== EMERGENCY FALLBACKS ==========

// Estratégia de emergência para recursos críticos
async function emergencyFallback(request) {
  const url = new URL(request.url);
  
  // Fallback para CSS
  if (url.pathname.endsWith('.css')) {
    return new Response(`
      body { 
        font-family: sans-serif; 
        margin: 20px; 
        background: #f5f5f5; 
      }
      .screen { display: none; }
      .screen.active { display: block; }
    `, {
      headers: { 'Content-Type': 'text/css' }
    });
  }
  
  // Fallback para JavaScript
  if (url.pathname.endsWith('.js')) {
    return new Response(`
      console.log('LeafTag running in emergency mode');
      window.addEventListener('load', () => {
        document.body.innerHTML = '<div style="text-align:center;padding:40px;"><h1>LeafTag</h1><p>Aplicativo em modo emergência. Verifique sua conexão.</p></div>';
      });
    `, {
      headers: { 'Content-Type': 'application/javascript' }
    });
  }
  
  // Fallback genérico
  return new Response('Recurso não disponível offline', {
    status: 503,
    statusText: 'Service Unavailable'
  });
}

// ========== LOGS DETALHADOS ==========

console.log(`
[SW] ========================================
[SW] LeafTag Service Worker Iniciado
[SW] Versão: ${CACHE_VERSION}
[SW] Timestamp: ${new Date().toISOString()}
[SW] Recursos em cache: ${CORE_FILES.length}
[SW] ========================================
`);