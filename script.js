// ========== CONFIGURAÇÃO E VARIÁVEIS GLOBAIS ==========

// Variáveis globais do aplicativo
let especies = [];
let currentFamily = '';
let editingIndex = -1;
let currentLocation = null;
let selectedPhotos = [];
let isOnline = navigator.onLine;
let db = null;

// Variáveis PWA
//let deferredPrompt = null;
let isInstalled = false;

// Configuração do IndexedDB
const DB_NAME = 'LeafTagDB';
const DB_VERSION = 1;
const STORES = {
  especies: 'especies',
  familias: 'familias',
  pendingSync: 'pendingSync'
};

// ========== INICIALIZAÇÃO DO APLICATIVO ==========

function startApp() {
  console.log('LeafTag Registros iniciado');
  
  // Verifica se já está instalado como PWA
  checkIfInstalled();
  
  // Inicializa IndexedDB
  initIndexedDB();
  
  // Setup dos event listeners
  setupEventListeners();
  
  // Atualiza status de conexão
  updateConnectionStatus();
  
  // Auto-fecha splash screen após 2 segundos
  setTimeout(() => {
    closeSplash();
  }, 2000);
  
  // Carrega dados iniciais
  loadInitialData();
}

function initIndexedDB() {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  
  request.onerror = () => {
    console.error('Erro ao abrir IndexedDB');
    // Fallback para localStorage
    loadFromLocalStorage();
  };
  
  request.onsuccess = (event) => {
    db = event.target.result;
    console.log('IndexedDB inicializado com sucesso');
    loadFromIndexedDB();
  };
  
  request.onupgradeneeded = (event) => {
    db = event.target.result;
    
    // Store para espécies
    if (!db.objectStoreNames.contains(STORES.especies)) {
      const especiesStore = db.createObjectStore(STORES.especies, { 
        keyPath: 'id', 
        autoIncrement: true 
      });
      especiesStore.createIndex('familia', 'familia', { unique: false });
      especiesStore.createIndex('nomePopular', 'nomePopular', { unique: false });
      especiesStore.createIndex('nomeCientifico', 'nomeCientifico', { unique: false });
    }
    
    // Store para operações pendentes de sincronização
    if (!db.objectStoreNames.contains(STORES.pendingSync)) {
      db.createObjectStore(STORES.pendingSync, { 
        keyPath: 'id', 
        autoIncrement: true 
      });
    }
    
    console.log('Estrutura do IndexedDB criada');
  };
}

function setupEventListeners() {
  // Event listeners para conexão de rede
  window.addEventListener('online', () => {
    isOnline = true;
    updateConnectionStatus();
    attemptSync();
  });
  
  window.addEventListener('offline', () => {
    isOnline = false;
    updateConnectionStatus();
  });
  
  // Event listener para seleção de fotos
  const fotoInput = document.getElementById('fotoInput');
  if (fotoInput) {
    fotoInput.addEventListener('change', function(e) {
      handlePhotoSelection(e.target.files);
    });
  }
  
  // Event listener para busca em tempo real
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', function(e) {
      if (e.target.value.length > 0) {
        document.querySelector('.search-clear').style.display = 'block';
      } else {
        document.querySelector('.search-clear').style.display = 'none';
      }
      buscarEspecies();
    });
  }
  
  // Event listener para busca de famílias
  const familySearch = document.getElementById('familySearch');
  if (familySearch) {
    familySearch.addEventListener('input', filtrarFamilias);
  }
}

function loadInitialData() {
  // Carrega dados do IndexedDB ou localStorage
  if (db) {
    loadFromIndexedDB();
  } else {
    loadFromLocalStorage();
  }
  
  updateUI();
}

function loadFromLocalStorage() {
  especies = JSON.parse(localStorage.getItem('especies')) || [];
  console.log('Dados carregados do localStorage:', especies.length, 'espécies');
}

function loadFromIndexedDB() {
  if (!db) return;
  
  const transaction = db.transaction([STORES.especies], 'readonly');
  const store = transaction.objectStore(STORES.especies);
  const request = store.getAll();
  
  request.onsuccess = () => {
    especies = request.result;
    console.log('Dados carregados do IndexedDB:', especies.length, 'espécies');
    updateUI();
    
    // Migra dados do localStorage se necessário
    migrateFromLocalStorage();
  };
  
  request.onerror = () => {
    console.error('Erro ao carregar dados do IndexedDB');
    loadFromLocalStorage();
  };
}

function migrateFromLocalStorage() {
  const localData = JSON.parse(localStorage.getItem('especies')) || [];
  
  if (localData.length > 0 && especies.length === 0) {
    console.log('Migrando dados do localStorage para IndexedDB');
    localData.forEach(especie => {
      saveToIndexedDB(especie);
    });
    
    // Remove dados do localStorage após migração
    localStorage.removeItem('especies');
  }
}

function updateConnectionStatus() {
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');
  
  if (statusIndicator && statusText) {
    if (isOnline) {
      statusIndicator.className = 'status-indicator online';
      statusText.textContent = 'Online';
    } else {
      statusIndicator.className = 'status-indicator offline';
      statusText.textContent = 'Offline';
    }
  }
}

function updateUI() {
  // Atualiza contador de famílias na tela principal
  const familiesCount = document.getElementById('familiesCount');
  if (familiesCount) {
    const uniqueFamilies = new Set(especies.map(e => e.familia || 'Sem Família'));
    familiesCount.textContent = uniqueFamilies.size;
  }
  
  // Atualiza datalist de famílias no formulário
  updateFamiliesList();
}

function updateFamiliesList() {
  const familiasList = document.getElementById('familiasList');
  if (familiasList) {
    const familias = [...new Set(especies.map(e => e.familia).filter(f => f))];
    familiasList.innerHTML = familias.map(familia => 
      `<option value="${familia}">`
    ).join('');
  }
}

// ========== NAVEGAÇÃO ENTRE TELAS ==========

function closeSplash() {
  const splash = document.getElementById('splashScreen');
  const main = document.getElementById('mainScreen');
  
  splash.classList.remove('active');
  main.classList.add('active');
  
  updateUI();
}

function goTo(screenId) {
  // Remove active de todas as telas
  const screens = document.querySelectorAll('.screen');
  screens.forEach(screen => screen.classList.remove('active'));
  
  // Ativa a tela desejada
  document.getElementById(screenId).classList.add('active');
  
  // Carrega dados específicos da tela
  switch (screenId) {
    case 'galleryScreen':
      carregarFamilias();
      break;
    case 'searchScreen':
      buscarEspecies();
      updateSearchCounter();
      break;
    case 'statisticsScreen':
      carregarEstatisticas();
      break;
    case 'mapScreen':
      loadMapData();
      break;
  }
}

// ========== GERENCIAMENTO DE DADOS (IndexedDB) ==========

function saveToIndexedDB(especie, callback) {
  if (!db) {
    // Fallback para localStorage
    saveToLocalStorage(especie);
    if (callback) callback(true);
    return;
  }
  
  const transaction = db.transaction([STORES.especies], 'readwrite');
  const store = transaction.objectStore(STORES.especies);
  
  // Adiciona timestamp e status de sincronização
  especie.createdAt = especie.createdAt || new Date().toISOString();
  especie.updatedAt = new Date().toISOString();
  especie.synced = false;
  
  let request;
  if (especie.id) {
    request = store.put(especie);
  } else {
    request = store.add(especie);
  }
  
  request.onsuccess = () => {
    console.log('Espécie salva no IndexedDB');
    if (!especie.id) {
      especie.id = request.result;
    }
    
    // Adiciona à fila de sincronização
    queueForSync({
      type: especie.id ? 'update' : 'create',
      data: especie,
      timestamp: new Date().toISOString()
    });
    
    if (callback) callback(true);
  };
  
  request.onerror = () => {
    console.error('Erro ao salvar no IndexedDB');
    saveToLocalStorage(especie);
    if (callback) callback(false);
  };
}

function saveToLocalStorage(especie) {
  especies.push(especie);
  localStorage.setItem('especies', JSON.stringify(especies));
}

function queueForSync(operation) {
  if (!db) return;
  
  const transaction = db.transaction([STORES.pendingSync], 'readwrite');
  const store = transaction.objectStore(STORES.pendingSync);
  
  store.add(operation);
}

function attemptSync() {
  if (!isOnline || !db) return;
  
  console.log('Tentando sincronizar dados...');
  
  const transaction = db.transaction([STORES.pendingSync], 'readonly');
  const store = transaction.objectStore(STORES.pendingSync);
  const request = store.getAll();
  
  request.onsuccess = () => {
    const pendingOperations = request.result;
    if (pendingOperations.length > 0) {
      console.log('Operações pendentes encontradas:', pendingOperations.length);
      processPendingSync(pendingOperations);
    }
  };
}

function processPendingSync(operations) {
  // Aqui seria implementada a sincronização com Firebase
  // Por enquanto, apenas marca como sincronizado
  console.log('Processando sincronização (mock):', operations.length, 'operações');
  
  // Simula sincronização bem-sucedida
  setTimeout(() => {
    clearPendingSync();
    updateSyncStatus('synced');
  }, 1000);
}

function clearPendingSync() {
  if (!db) return;
  
  const transaction = db.transaction([STORES.pendingSync], 'readwrite');
  const store = transaction.objectStore(STORES.pendingSync);
  store.clear();
}

function updateSyncStatus(status) {
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');
  
  if (statusIndicator && statusText && isOnline) {
    if (status === 'syncing') {
      statusIndicator.className = 'status-indicator syncing';
      statusText.textContent = 'Sincronizando...';
    } else if (status === 'synced') {
      statusIndicator.className = 'status-indicator online';
      statusText.textContent = 'Sincronizado';
      
      setTimeout(() => {
        statusText.textContent = 'Online';
      }, 2000);
    }
  }
}

// ========== FUNÇÕES DE FAMÍLIA ==========

function carregarFamilias() {
  const container = document.getElementById('familiesContainer');
  container.innerHTML = '';
  
  if (especies.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🌿</div>
        <h3>Nenhum registro encontrado</h3>
        <p>Adicione seu primeiro registro dendrológico!</p>
        <button class="quick-add-btn" onclick="prepareForm()">
          <span class="plus-icon">+</span>
          Adicionar Primeiro Registro
        </button>
      </div>
    `;
    return;
  }
  
  // Agrupa espécies por família
  const familias = {};
  especies.forEach((especie, index) => {
    const familia = especie.familia || 'Sem Família';
    if (!familias[familia]) {
      familias[familia] = [];
    }
    familias[familia].push({...especie, originalIndex: index});
  });
  
  // Ordena famílias alfabeticamente
  const familiasOrdenadas = Object.keys(familias).sort();
  
  // Cria cards para cada família
  familiasOrdenadas.forEach(familia => {
    const especiesDaFamilia = familias[familia];
    const card = document.createElement('div');
    card.className = 'family-card';
    card.onclick = () => mostrarEspeciesDaFamilia(familia);
    
    const familyInfo = document.createElement('div');
    familyInfo.className = 'family-info';
    
    const familyName = document.createElement('strong');
    familyName.textContent = familia;
    
    const speciesCount = document.createElement('small');
    const especiesTexto = especiesDaFamilia.length === 1 ? 'espécie' : 'espécies';
    speciesCount.textContent = `${especiesDaFamilia.length} ${especiesTexto}`;
    
    familyInfo.appendChild(familyName);
    familyInfo.appendChild(speciesCount);
    
    // Adiciona imagens em miniatura (máximo 3)
    const familyImages = document.createElement('div');
    familyImages.className = 'family-images';
    
    especiesDaFamilia.slice(0, 3).forEach(especie => {
      if (especie.fotos && especie.fotos.length > 0) {
        const img = document.createElement('img');
        img.src = especie.fotos[0];
        img.alt = especie.nomePopular || 'Espécie';
        img.loading = 'lazy';
        familyImages.appendChild(img);
      }
    });
    
    card.appendChild(familyInfo);
    if (familyImages.children.length > 0) {
      card.appendChild(familyImages);
    }
    
    container.appendChild(card);
  });
}

function filtrarFamilias() {
  const searchTerm = document.getElementById('familySearch').value.toLowerCase();
  const familyCards = document.querySelectorAll('.family-card');
  
  familyCards.forEach(card => {
    const familyName = card.querySelector('strong').textContent.toLowerCase();
    if (familyName.includes(searchTerm)) {
      card.style.display = 'flex';
    } else {
      card.style.display = 'none';
    }
  });
}

function mostrarEspeciesDaFamilia(familia) {
  currentFamily = familia;
  
  // Atualiza o título
  document.getElementById('familyTitle').textContent = familia;
  
  // Filtra espécies da família
  const especiesDaFamilia = especies.filter(especie => 
    (especie.familia || 'Sem Família') === familia
  );
  
  // Carrega lista de espécies
  const speciesContainer = document.getElementById('speciesList');
  speciesContainer.innerHTML = '';
  
  especiesDaFamilia.forEach((especie, index) => {
    const originalIndex = especies.findIndex(e => 
      e.id === especie.id || (
        e.nomePopular === especie.nomePopular && 
        e.nomeCientifico === especie.nomeCientifico &&
        e.familia === especie.familia
      )
    );
    
    const card = document.createElement('div');
    card.className = 'card-species';
    card.onclick = () => mostrarDetalhesEspecie(originalIndex);
    
    const foto = especie.fotos && especie.fotos.length > 0 ? especie.fotos[0] : null;
    const gpsIcon = especie.coordenadas ? '📍' : '';
    const fotoIcon = foto ? '📷' : '';
    
    const content = `
      <div style="display: flex; align-items: center; gap: 15px;">
        ${foto ? `<img src="${foto}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px;" loading="lazy">` : ''}
        <div style="flex: 1;">
          <strong style="color: var(--primary-color);">${especie.nomePopular || 'Nome não informado'}</strong> ${gpsIcon} ${fotoIcon}<br>
          <em style="color: var(--text-secondary);">${especie.nomeCientifico || ''}</em><br>
          <small style="color: var(--text-secondary);">${especie.local || ''}</small>
        </div>
      </div>
    `;
    
    card.innerHTML = content;
    speciesContainer.appendChild(card);
  });
  
  // Vai para a tela de espécies da família
  goTo('familySpeciesScreen');
}

// ========== GEOLOCALIZAÇÃO ==========

function obterLocalizacao() {
  if (!navigator.geolocation) {
    alert('Geolocalização não é suportada neste navegador.');
    return;
  }
  
  const button = document.getElementById('locationBtn');
  const locationIcon = button.querySelector('.location-icon');
  
  button.textContent = '';
  button.appendChild(locationIcon);
  button.appendChild(document.createTextNode(' Obtendo localização...'));
  button.disabled = true;
  button.classList.add('loading');
  
  const options = {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 300000
  };
  
  navigator.geolocation.getCurrentPosition(
    (position) => {
      currentLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: new Date().toISOString()
      };
      
      document.getElementById('coordinates').textContent = 
        `${currentLocation.latitude.toFixed(6)}, ${currentLocation.longitude.toFixed(6)}`;
      document.getElementById('accuracy').textContent = Math.round(currentLocation.accuracy);
      document.getElementById('locationInfo').style.display = 'block';
      
      button.textContent = '';
      button.appendChild(locationIcon);
      button.appendChild(document.createTextNode(' ✅ Localização obtida'));
      button.style.background = 'var(--success-color)';
      button.classList.remove('loading');
    },
    (error) => {
      console.error('Erro ao obter localização:', error);
      let errorMessage = 'Erro ao obter localização: ';
      
      switch(error.code) {
        case error.PERMISSION_DENIED:
          errorMessage += 'Permissão negada pelo usuário.';
          break;
        case error.POSITION_UNAVAILABLE:
          errorMessage += 'Localização indisponível.';
          break;
        case error.TIMEOUT:
          errorMessage += 'Tempo limite esgotado.';
          break;
        default:
          errorMessage += error.message;
          break;
      }
      
      alert(errorMessage);
      
      button.textContent = '';
      button.appendChild(locationIcon);
      button.appendChild(document.createTextNode(' 📍 Obter Localização GPS'));
      button.disabled = false;
      button.style.background = '';
      button.classList.remove('loading');
    },
    options
  );
}

// ========== GERENCIAMENTO DE FOTOS ==========

function handlePhotoSelection(files) {
  const preview = document.getElementById('photosPreview');
  
  // Limita a 5 fotos
  const maxPhotos = 5;
  const remainingSlots = maxPhotos - selectedPhotos.length;
  const filesToProcess = Array.from(files).slice(0, remainingSlots);
  
  if (files.length > remainingSlots) {
    alert(`Máximo de ${maxPhotos} fotos permitidas. ${remainingSlots} fotos serão adicionadas.`);
  }
  
  filesToProcess.forEach((file, index) => {
    if (file.type.startsWith('image/')) {
      // Comprime e redimensiona a imagem
      compressImage(file, (compressedDataUrl) => {
        selectedPhotos.push(compressedDataUrl);
        updatePhotosPreview();
      });
    }
  });
  
  // Limpa o input para permitir selecionar as mesmas fotos novamente
  document.getElementById('fotoInput').value = '';
}

function compressImage(file, callback) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const img = new Image();
  
  img.onload = function() {
    // Define tamanho máximo
    const maxWidth = 1200;
    const maxHeight = 1200;
    
    let { width, height } = img;
    
    // Calcula novo tamanho mantendo proporção
    if (width > height) {
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
    } else {
      if (height > maxHeight) {
        width = (width * maxHeight) / height;
        height = maxHeight;
      }
    }
    
    canvas.width = width;
    canvas.height = height;
    
    // Desenha e comprime
    ctx.drawImage(img, 0, 0, width, height);
    
    // Converte para base64 com qualidade reduzida
    const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
    callback(compressedDataUrl);
  };
  
  img.src = URL.createObjectURL(file);
}

function removePhoto(index) {
  selectedPhotos.splice(index, 1);
  updatePhotosPreview();
}

function updatePhotosPreview() {
  const preview = document.getElementById('photosPreview');
  preview.innerHTML = '';
  
  selectedPhotos.forEach((photo, index) => {
    const photoDiv = document.createElement('div');
    photoDiv.className = 'photo-preview';
    photoDiv.innerHTML = `
      <img src="${photo}" alt="Preview ${index + 1}" loading="lazy">
      <button class="remove-photo" onclick="removePhoto(${index})" title="Remover foto">×</button>
    `;
    preview.appendChild(photoDiv);
  });
}

// ========== FORMULÁRIO DE ESPÉCIE ==========

function prepareForm() {
  editingIndex = -1;
  currentFamily = '';
  currentLocation = null;
  selectedPhotos = [];
  limparFormulario();
  document.getElementById('formTitle').textContent = 'Novo Registro';
  goTo('addSpeciesScreen');
}

function novoRegistroParaFamilia() {
  editingIndex = -1;
  currentLocation = null;
  selectedPhotos = [];
  limparFormulario();
  document.getElementById('familia').value = currentFamily;
  document.getElementById('formTitle').textContent = `Novo Registro - ${currentFamily}`;
  goTo('addSpeciesScreen');
}

function limparFormulario() {
  document.getElementById('nomePopular').value = '';
  document.getElementById('nomeCientifico').value = '';
  document.getElementById('familia').value = '';
  document.getElementById('local').value = '';
  document.getElementById('notas').value = '';
  document.getElementById('fotoInput').value = '';
  document.getElementById('photosPreview').innerHTML = '';
  document.getElementById('locationInfo').style.display = 'none';
  
  // Reset botão de localização
  const locationBtn = document.getElementById('locationBtn');
  if (locationBtn) {
    const locationIcon = locationBtn.querySelector('.location-icon');
    locationBtn.textContent = '';
    locationBtn.appendChild(locationIcon);
    locationBtn.appendChild(document.createTextNode(' Obter Localização GPS'));
    locationBtn.style.background = '';
    locationBtn.disabled = false;
    locationBtn.classList.remove('loading');
  }
}

function cancelarEdicao() {
  // Volta para a tela anterior apropriada
  if (currentFamily) {
    goTo('familySpeciesScreen');
  } else {
    goTo('galleryScreen');
  }
}

function salvarEspecie() {
  const nomePopular = document.getElementById('nomePopular').value.trim();
  const nomeCientifico = document.getElementById('nomeCientifico').value.trim();
  const familia = document.getElementById('familia').value.trim();
  const local = document.getElementById('local').value.trim();
  const notas = document.getElementById('notas').value.trim();
  
  // Validação
  if (!nomePopular && !nomeCientifico) {
    alert('Por favor, preencha pelo menos o nome popular ou científico.');
    document.getElementById('nomePopular').focus();
    return;
  }
  
  if (!familia) {
    alert('Por favor, informe a família da espécie.');
    document.getElementById('familia').focus();
    return;
  }
  
  // Cria objeto da espécie
  const especie = {
    nomePopular,
    nomeCientifico,
    familia: familia || 'Sem Família',
    local,
    notas,
    dataRegistro: new Date().toLocaleDateString('pt-BR'),
    fotos: [...selectedPhotos],
    coordenadas: currentLocation ? {...currentLocation} : null
  };
  
  // Adiciona ID se editando
  if (editingIndex >= 0 && especies[editingIndex]) {
    especie.id = especies[editingIndex].id;
  }
  
  // Desabilita botão durante salvamento
  const saveBtn = document.getElementById('saveBtn');
  if (saveBtn) {
    saveBtn.textContent = '⏳';
    saveBtn.disabled = true;
  }
  
  finalizarSalvamento(especie);
}

function finalizarSalvamento(especie) {
  const isEditing = editingIndex >= 0;
  
  // Salva no IndexedDB
  saveToIndexedDB(especie, (success) => {
    if (success) {
      if (isEditing) {
        // Atualiza espécie existente
        especies[editingIndex] = especie;
      } else {
        // Adiciona nova espécie
        especies.push(especie);
      }
      
      // Backup no localStorage
      localStorage.setItem('especies', JSON.stringify(especies));
      
      // Atualiza UI
      updateUI();
      
      // Mostra sucesso
      const action = isEditing ? 'atualizado' : 'salvo';
      showToast(`Registro ${action} com sucesso!`, 'success');
      
      // Volta para tela anterior
      if (currentFamily) {
        mostrarEspeciesDaFamilia(currentFamily);
      } else {
        goTo('galleryScreen');
      }
    } else {
      showToast('Erro ao salvar registro. Tente novamente.', 'error');
    }
    
    // Reabilita botão
    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) {
      saveBtn.textContent = '✓';
      saveBtn.disabled = false;
    }
  });
}

function showToast(message, type = 'info') {
  // Cria elemento de toast
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  
  // Adiciona estilos
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'success' ? 'var(--success-color)' : type === 'error' ? 'var(--danger-color)' : 'var(--primary-color)'};
    color: white;
    padding: 12px 20px;
    border-radius: var(--border-radius-small);
    box-shadow: var(--shadow-medium);
    z-index: 10001;
    animation: slideInRight 0.3s ease;
  `;
  
  document.body.appendChild(toast);
  
  // Remove após 3 segundos
  setTimeout(() => {
    toast.style.animation = 'slideOutRight 0.3s ease';
    setTimeout(() => {
      document.body.removeChild(toast);
    }, 300);
  }, 3000);
}

// ========== DETALHES DA ESPÉCIE ==========

function mostrarDetalhesEspecie(index) {
  if (index < 0 || index >= especies.length) return;
  
  const especie = especies[index];
  editingIndex = index;
  
  // Atualiza elementos da tela de detalhes
  document.getElementById('detailTitle').textContent = especie.nomePopular || especie.nomeCientifico || 'Espécie';
  
  // Galeria de imagens
  const detailImages = document.getElementById('detailImages');
  detailImages.innerHTML = '';
  
  if (especie.fotos && especie.fotos.length > 0) {
    especie.fotos.forEach((foto, index) => {
      const imageDiv = document.createElement('div');
      imageDiv.className = 'detail-image';
      imageDiv.innerHTML = `<img src="${foto}" alt="${especie.nomePopular || 'Espécie'} - Foto ${index + 1}" loading="lazy">`;
      imageDiv.onclick = () => openImageModal(foto);
      detailImages.appendChild(imageDiv);
    });
  } else {
    detailImages.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 20px;">Nenhuma foto disponível</p>';
  }
  
  // Informações da espécie
  const detailInfo = document.getElementById('detailInfo');
  let coordenadasInfo = '';
  if (especie.coordenadas) {
    coordenadasInfo = `
      <p><strong>Coordenadas:</strong> ${especie.coordenadas.latitude.toFixed(6)}, ${especie.coordenadas.longitude.toFixed(6)}</p>
      <p><strong>Precisão GPS:</strong> ±${Math.round(especie.coordenadas.accuracy)}m</p>
    `;
  }
  
  detailInfo.innerHTML = `
    <p><strong>Nome Popular:</strong> ${especie.nomePopular || 'Não informado'}</p>
    <p><strong>Nome Científico:</strong> ${especie.nomeCientifico || 'Não informado'}</p>
    <p><strong>Família:</strong> ${especie.familia || 'Não informado'}</p>
    <p><strong>Local de Coleta:</strong> ${especie.local || 'Não informado'}</p>
    <p><strong>Data do Registro:</strong> ${especie.dataRegistro || 'Não informado'}</p>
    ${coordenadasInfo}
    ${especie.notas ? `<p><strong>Notas:</strong> ${especie.notas}</p>` : ''}
  `;
  
  goTo('speciesDetailScreen');
}

function voltarDaEspecie() {
  if (currentFamily) {
    goTo('familySpeciesScreen');
  } else {
    goTo('galleryScreen');
  }
}

function openImageModal(imageSrc) {
  const modal = document.getElementById('imageModal');
  const modalImage = document.getElementById('modalImage');
  
  modalImage.src = imageSrc;
  modal.style.display = 'flex';
  
  // Adiciona classe para animação
  setTimeout(() => {
    modal.classList.add('active');
  }, 10);
}

function fecharImageModal() {
  const modal = document.getElementById('imageModal');
  modal.classList.remove('active');
  
  setTimeout(() => {
    modal.style.display = 'none';
  }, 300);
}

// ========== EDIÇÃO E EXCLUSÃO ==========

function editarEspecie() {
  if (editingIndex < 0) return;
  
  const especie = especies[editingIndex];
  
  // Preenche formulário com dados existentes
  document.getElementById('nomePopular').value = especie.nomePopular || '';
  document.getElementById('nomeCientifico').value = especie.nomeCientifico || '';
  document.getElementById('familia').value = especie.familia || '';
  document.getElementById('local').value = especie.local || '';
  document.getElementById('notas').value = especie.notas || '';
  
  // Carrega fotos existentes
  selectedPhotos = especie.fotos ? [...especie.fotos] : [];
  updatePhotosPreview();
  
  // Carrega localização existente
  currentLocation = especie.coordenadas || null;
  if (currentLocation) {
    document.getElementById('coordinates').textContent = 
      `${currentLocation.latitude.toFixed(6)}, ${currentLocation.longitude.toFixed(6)}`;
    document.getElementById('accuracy').textContent = Math.round(currentLocation.accuracy);
    document.getElementById('locationInfo').style.display = 'block';
    
    const locationBtn = document.getElementById('locationBtn');
    if (locationBtn) {
      const locationIcon = locationBtn.querySelector('.location-icon');
      locationBtn.textContent = '';
      locationBtn.appendChild(locationIcon);
      locationBtn.appendChild(document.createTextNode(' ✅ Localização obtida'));
      locationBtn.style.background = 'var(--success-color)';
    }
  }
  
  document.getElementById('formTitle').textContent = 'Editar Registro';
  goTo('addSpeciesScreen');
}

function confirmarExclusao() {
  document.getElementById('confirmModal').style.display = 'flex';
}

function fecharModal() {
  document.getElementById('confirmModal').style.display = 'none';
}

function excluirEspecieConfirmado() {
  if (editingIndex >= 0) {
    const especieRemovida = especies.splice(editingIndex, 1)[0];
    
    // Salva no IndexedDB (marcar como excluída)
    if (db && especieRemovida.id) {
      const transaction = db.transaction([STORES.especies], 'readwrite');
      const store = transaction.objectStore(STORES.especies);
      store.delete(especieRemovida.id);
      
      // Adiciona à fila de sincronização
      queueForSync({
        type: 'delete',
        data: { id: especieRemovida.id },
        timestamp: new Date().toISOString()
      });
    }
    
    // Backup no localStorage
    localStorage.setItem('especies', JSON.stringify(especies));
    
    showToast('Registro excluído com sucesso!', 'success');
    editingIndex = -1;
    fecharModal();
    updateUI();
    goTo('galleryScreen');
  }
}

// ========== BUSCA E FILTROS ==========

function buscarEspecies() {
  const searchTerm = document.getElementById('searchInput').value.toLowerCase();
  const filterFoto = document.getElementById('filterFoto').checked;
  const filterGPS = document.getElementById('filterGPS').checked;
  
  const resultados = especies.filter(especie => {
    // Filtro de texto
    const textoMatch = !searchTerm || 
      (especie.nomePopular && especie.nomePopular.toLowerCase().includes(searchTerm)) ||
      (especie.nomeCientifico && especie.nomeCientifico.toLowerCase().includes(searchTerm)) ||
      (especie.familia && especie.familia.toLowerCase().includes(searchTerm)) ||
      (especie.local && especie.local.toLowerCase().includes(searchTerm)) ||
      (especie.notas && especie.notas.toLowerCase().includes(searchTerm));
    
    // Filtro de foto
    const fotoMatch = !filterFoto || (especie.fotos && especie.fotos.length > 0);
    
    // Filtro de GPS
    const gpsMatch = !filterGPS || especie.coordenadas;
    
    return textoMatch && fotoMatch && gpsMatch;
  });
  
  updateSearchCounter(resultados.length);
  displaySearchResults(resultados);
}

function updateSearchCounter(count) {
  const counter = document.getElementById('searchCounter');
  if (counter) {
    const resultText = count === 1 ? 'resultado' : 'resultados';
    counter.textContent = `${count} ${resultText}`;
  }
}

function displaySearchResults(resultados) {
  const container = document.getElementById('searchResults');
  container.innerHTML = '';
  
  if (resultados.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <h3>Nenhum resultado encontrado</h3>
        <p>Tente ajustar os filtros ou termos de busca.</p>
      </div>
    `;
    return;
  }
  
  resultados.forEach(especie => {
    const originalIndex = especies.indexOf(especie);
    const card = document.createElement('div');
    card.className = 'card-species';
    card.onclick = () => {
      editingIndex = originalIndex;
      mostrarDetalhesEspecie(originalIndex);
    };
    
    const foto = especie.fotos && especie.fotos.length > 0 ? especie.fotos[0] : null;
    const gpsIcon = especie.coordenadas ? '📍' : '';
    const fotoIcon = foto ? '📷' : '';
    
    card.innerHTML = `
      <div style="display: flex; align-items: center; gap: 15px;">
        ${foto ? `<img src="${foto}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px;" loading="lazy">` : ''}
        <div style="flex: 1;">
          <strong style="color: var(--primary-color);">${especie.nomePopular || 'Nome não informado'}</strong> ${gpsIcon} ${fotoIcon}<br>
          <em style="color: var(--text-secondary);">${especie.nomeCientifico || ''}</em><br>
          <small style="color: var(--text-secondary);">${especie.familia || ''} • ${especie.local || ''}</small>
        </div>
      </div>
    `;
    
    container.appendChild(card);
  });
}

function limparBusca() {
  document.getElementById('searchInput').value = '';
  document.getElementById('filterFoto').checked = false;
  document.getElementById('filterGPS').checked = false;
  document.querySelector('.search-clear').style.display = 'none';
  buscarEspecies();
}

// ========== ESTATÍSTICAS ==========

function carregarEstatisticas() {
  const container = document.getElementById('statsContainer');
  container.innerHTML = '';
  
  if (especies.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📊</div>
        <h3>Sem dados para estatísticas</h3>
        <p>Adicione alguns registros para ver as estatísticas.</p>
      </div>
    `;
    return;
  }
  
  // Total de espécies
  addStatCard(container, especies.length, 'Total de Registros', 'Espécies catalogadas');
  
  // Total de famílias
  const familias = new Set(especies.map(e => e.familia || 'Sem Família'));
  addStatCard(container, familias.size, 'Famílias', 'Diferentes famílias botânicas');
  
  // Com fotos
  const comFotos = especies.filter(e => e.fotos && e.fotos.length > 0).length;
  const percentualFotos = especies.length > 0 ? ((comFotos/especies.length)*100).toFixed(1) : 0;
  addStatCard(container, comFotos, 'Com Fotos', `${percentualFotos}% dos registros`);
  
  // Com GPS
  const comGPS = especies.filter(e => e.coordenadas).length;
  const percentualGPS = especies.length > 0 ? ((comGPS/especies.length)*100).toFixed(1) : 0;
  addStatCard(container, comGPS, 'Com GPS', `${percentualGPS}% dos registros`);
  
  // Família mais comum
  if (especies.length > 0) {
    const contadorFamilias = {};
    especies.forEach(e => {
      const familia = e.familia || 'Sem Família';
      contadorFamilias[familia] = (contadorFamilias[familia] || 0) + 1;
    });
    
    const familiaMaisComum = Object.entries(contadorFamilias)
      .sort(([,a], [,b]) => b - a)[0];
    
    addStatCard(container, familiaMaisComum[1], 'Família mais comum', familiaMaisComum[0]);
  }
  
  // Total de fotos
  const totalFotos = especies.reduce((total, e) => total + (e.fotos ? e.fotos.length : 0), 0);
  addStatCard(container, totalFotos, 'Total de Fotos', 'Imagens armazenadas');
}

function addStatCard(container, number, label, description) {
  const card = document.createElement('div');
  card.className = 'stat-card';
  card.innerHTML = `
    <div class="stat-number">${number}</div>
    <div class="stat-label">${label}</div>
    <div class="stat-description">${description}</div>
  `;
  container.appendChild(card);
}

// ========== MAPA ==========

function loadMapData() {
  const especiesComGPS = especies.filter(e => e.coordenadas);
  const mapCounter = document.getElementById('mapCounter');
  const mapStats = document.getElementById('mapStats');
  
  if (mapCounter) {
    const registroText = especiesComGPS.length === 1 ? 'registro' : 'registros';
    mapCounter.textContent = `${especiesComGPS.length} ${registroText}`;
  }
  
  if (mapStats) {
    mapStats.innerHTML = `
      <div class="map-stat">
        <div class="map-stat-number">${especiesComGPS.length}</div>
        <div class="map-stat-label">Com GPS</div>
      </div>
      <div class="map-stat">
        <div class="map-stat-number">${especies.length - especiesComGPS.length}</div>
        <div class="map-stat-label">Sem GPS</div>
      </div>
    `;
  }
}

// ========== EXPORTAÇÃO DE DADOS ==========

function exportarDados() {
  if (especies.length === 0) {
    alert('Nenhum dado para exportar.');
    return;
  }
  
  // Prepara dados para exportação (sem as imagens em base64)
  const dadosExport = especies.map(especie => ({
    nomePopular: especie.nomePopular,
    nomeCientifico: especie.nomeCientifico,
    familia: especie.familia,
    local: especie.local,
    dataRegistro: especie.dataRegistro,
    coordenadas: especie.coordenadas,
    notas: especie.notas,
    totalFotos: especie.fotos ? especie.fotos.length : 0
  }));
  
  // Cria arquivo CSV
  const csvContent = convertToCSV(dadosExport);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  
  // Download do arquivo
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `leaftag-registros-${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  showToast('Dados exportados com sucesso!', 'success');
}

function convertToCSV(data) {
  if (data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const csvRows = [];
  
  // Adiciona cabeçalhos
  csvRows.push(headers.join(','));
  
  // Adiciona dados
  data.forEach(row => {
    const values = headers.map(header => {
      const value = row[header];
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return JSON.stringify(value);
      return `"${String(value).replace(/"/g, '""')}"`;
    });
    csvRows.push(values.join(','));
  });
  
  return csvRows.join('\n');
}

// ========== SINCRONIZAÇÃO DE DADOS ==========

function syncData() {
  if (!isOnline) {
    showToast('Conecte-se à internet para sincronizar', 'error');
    return;
  }
  
  updateSyncStatus('syncing');
  
  // Simula sincronização (aqui seria implementada a integração com Firebase)
  setTimeout(() => {
    attemptSync();
    showToast('Sincronização concluída!', 'success');
  }, 2000);
}

// ========== UTILITÁRIOS ==========

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Versão com debounce da busca
const buscarEspeciesDebounced = debounce(buscarEspecies, 300);

// ========== INICIALIZAÇÃO ==========

// Executa quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', function() {
  // Adiciona estilos CSS de animação via JavaScript
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideInRight {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    
    @keyframes slideOutRight {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(100%);
        opacity: 0;
      }
    }
    
    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: var(--text-secondary);
    }
    
    .empty-icon {
      font-size: 64px;
      margin-bottom: 20px;
      opacity: 0.6;
    }
    
    .empty-state h3 {
      color: var(--primary-color);
      margin-bottom: 12px;
      font-size: 20px;
    }
    
    .empty-state p {
      margin-bottom: 24px;
      line-height: 1.5;
    }
    
    .image-modal-content {
      animation: modalImageAppear 0.3s ease;
    }
    
    @keyframes modalImageAppear {
      from {
        transform: scale(0.8);
        opacity: 0;
      }
      to {
        transform: scale(1);
        opacity: 1;
      }
    }
  `;
  document.head.appendChild(style);
});

// ========== PWA E SERVICE WORKER ==========

// Registra service worker se disponível
if ('serviceWorker' in navigator && 'PushManager' in window) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('SW registrado com sucesso:', registration);
        
        // Verifica atualizações
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateAvailable();
            }
          });
        });
      })
      .catch(error => {
        console.log('Falha ao registrar SW:', error);
      });
  });
}

function showUpdateAvailable() {
  const updateNotification = document.createElement('div');
  updateNotification.innerHTML = `
    <div style="
      position: fixed;
      bottom: 20px;
      left: 20px;
      right: 20px;
      background: var(--primary-color);
      color: white;
      padding: 16px;
      border-radius: var(--border-radius);
      box-shadow: var(--shadow-heavy);
      z-index: 10001;
      display: flex;
      justify-content: space-between;
      align-items: center;
    ">
      <span>Nova versão disponível!</span>
      <button onclick="window.location.reload()" style="
        background: white;
        color: var(--primary-color);
        border: none;
        padding: 8px 16px;
        border-radius: var(--border-radius-small);
        font-weight: 600;
        cursor: pointer;
      ">Atualizar</button>
    </div>
  `;
  
  document.body.appendChild(updateNotification);
}

// ========== EVENTOS DE INSTALAÇÃO PWA ==========

let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  console.log('PWA pode ser instalado');
  e.preventDefault();
  deferredPrompt = e;
  showInstallPrompt();
});

function showInstallPrompt() {
  // Cria botão de instalação na tela principal
  const installBtn = document.createElement('button');
  installBtn.textContent = '📱 Instalar App';
  installBtn.className = 'install-prompt';
  installBtn.style.cssText = `
    position: fixed;
    bottom: 80px;
    right: 20px;
    background: var(--accent-color);
    color: white;
    border: none;
    padding: 12px 16px;
    border-radius: var(--border-radius);
    font-weight: 600;
    cursor: pointer;
    box-shadow: var(--shadow-medium);
    z-index: 1001;
    animation: slideInRight 0.3s ease;
  `;
  
  installBtn.onclick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      if (result.outcome === 'accepted') {
        console.log('PWA instalado');
      }
      deferredPrompt = null;
      document.body.removeChild(installBtn);
    }
  };
  
  document.body.appendChild(installBtn);
  
  // Remove o botão após 10 segundos se não foi clicado
  setTimeout(() => {
    if (document.body.contains(installBtn)) {
      installBtn.style.animation = 'slideOutRight 0.3s ease';
      setTimeout(() => {
        if (document.body.contains(installBtn)) {
          document.body.removeChild(installBtn);
        }
      }, 300);
    }
  }, 10000);
}

// ========== FUNÇÕES DE BACKUP E RESTORE ==========

function createBackup() {
  const backup = {
    version: '1.0',
    timestamp: new Date().toISOString(),
    especies: especies,
    totalRegistros: especies.length
  };
  
  const backupJson = JSON.stringify(backup, null, 2);
  const blob = new Blob([backupJson], { type: 'application/json' });
  
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `leaftag-backup-${new Date().toISOString().split('T')[0]}.json`;
  link.click();
  
  showToast('Backup criado com sucesso!', 'success');
}

function restoreBackup(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const backup = JSON.parse(e.target.result);
      
      if (backup.especies && Array.isArray(backup.especies)) {
        especies = backup.especies;
        
        // Salva no IndexedDB
        if (db) {
          const transaction = db.transaction([STORES.especies], 'readwrite');
          const store = transaction.objectStore(STORES.especies);
          
          // Limpa dados existentes
          store.clear().onsuccess = () => {
            // Adiciona dados do backup
            especies.forEach(especie => {
              store.add(especie);
            });
          };
        }
        
        // Backup no localStorage
        localStorage.setItem('especies', JSON.stringify(especies));
        
        updateUI();
        showToast(`Backup restaurado! ${especies.length} registros carregados.`, 'success');
        goTo('galleryScreen');
      } else {
        throw new Error('Formato de backup inválido');
      }
    } catch (error) {
      console.error('Erro ao restaurar backup:', error);
      showToast('Erro ao restaurar backup. Verifique o arquivo.', 'error');
    }
  };
  
  reader.readAsText(file);
}

// ========== PERFORMANCE E OTIMIZAÇÕES ==========

// Lazy loading para imagens
function setupLazyLoading() {
  if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          img.classList.remove('lazy');
          imageObserver.unobserve(img);
        }
      });
    });
    
    document.querySelectorAll('img[data-src]').forEach(img => {
      imageObserver.observe(img);
    });
  }
}

// Otimização de memória - remove imagens não visíveis do DOM
function optimizeMemory() {
  const images = document.querySelectorAll('img');
  images.forEach(img => {
    if (!img.offsetParent) {
      // Imagem não está visível, pode ser removida do DOM
      img.src = '';
    }
  });
}

// ========== ACESSIBILIDADE ==========

// Adiciona suporte a navegação por teclado
document.addEventListener('keydown', (e) => {
  // ESC para fechar modais
  if (e.key === 'Escape') {
    fecharModal();
    fecharImageModal();
  }
  
  // Enter para ativar elementos focados
  if (e.key === 'Enter' && e.target.classList.contains('card-species')) {
    e.target.click();
  }
});

// Adiciona atributos de acessibilidade dinamicamente
function enhanceAccessibility() {
  // Adiciona roles e labels apropriados
  document.querySelectorAll('.card-species').forEach((card, index) => {
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `Ver detalhes da espécie ${index + 1}`);
  });
  
  document.querySelectorAll('.family-card').forEach((card, index) => {
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `Ver espécies da família ${index + 1}`);
  });
}

// ========== PWA E INSTALAÇÃO ==========

// Detecta se pode instalar PWA
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  console.log('PWA pode ser instalado');
  
  if (!isInstalled) {
    showInstallPrompt();
  }
});

// Detecta quando foi instalado
window.addEventListener('appinstalled', (evt) => {
  console.log('PWA foi instalado');
  isInstalled = true;
  deferredPrompt = null;
  hideInstallPrompt();
});

// Verifica se já está rodando como PWA
function checkIfInstalled() {
  if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
    isInstalled = true;
    console.log('App executando como PWA instalado');
  }
}

// Mostra prompt de instalação
function showInstallPrompt() {
  // Cria botão de instalação
  const installBtn = document.createElement('button');
  installBtn.innerHTML = '📱 Instalar App';
  installBtn.className = 'install-prompt';
  installBtn.style.cssText = `
    position: fixed;
    bottom: 80px;
    right: 20px;
    background: var(--accent-color, #6bb381);
    color: white;
    border: none;
    padding: 12px 16px;
    border-radius: 12px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 1001;
    font-size: 14px;
    animation: slideInRight 0.3s ease;
  `;
  
  installBtn.onclick = installPWA;
  document.body.appendChild(installBtn);
  
  // Remove automaticamente após 10 segundos
  setTimeout(() => {
    if (document.body.contains(installBtn)) {
      hideInstallPrompt();
    }
  }, 10000);
}

// Esconde prompt de instalação
function hideInstallPrompt() {
  const installBtn = document.querySelector('.install-prompt');
  if (installBtn && document.body.contains(installBtn)) {
    installBtn.style.animation = 'slideOutRight 0.3s ease';
    setTimeout(() => {
      if (document.body.contains(installBtn)) {
        document.body.removeChild(installBtn);
      }
    }, 300);
  }
}

// Instala PWA
async function installPWA() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    
    if (result.outcome === 'accepted') {
      console.log('Usuário aceitou instalar PWA');
      showToast('App instalado com sucesso!', 'success');
    } else {
      console.log('Usuário recusou instalar PWA');
    }
    
    deferredPrompt = null;
    hideInstallPrompt();
  }
}

// ========== INICIALIZAÇÃO FINAL ==========

// Chama função de inicialização quando a página carregar
window.addEventListener('load', () => {
  setupLazyLoading();
  enhanceAccessibility();
});

// Limpa recursos quando a página é fechada
window.addEventListener('beforeunload', () => {
  if (db) {
    db.close();
  }
});

// Export das funções principais para uso global
window.LeafTag = {
  startApp,
  goTo,
  closeSplash,
  carregarFamilias,
  mostrarEspeciesDaFamilia,
  prepareForm,
  salvarEspecie,
  editarEspecie,
  confirmarExclusao,
  buscarEspecies,
  carregarEstatisticas,
  syncData,
  exportarDados,
  createBackup,
  restoreBackup
};