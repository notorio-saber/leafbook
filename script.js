// Variáveis globais
let especies = JSON.parse(localStorage.getItem('especies')) || [];
let currentFamily = '';
let editingIndex = -1;
let currentLocation = null;
let selectedPhotos = [];

// Função chamada no onload do body
function startApp() {
  console.log('LeafTag Registros iniciado');
}

// Função para fechar splash screen
function closeSplash() {
  const splash = document.getElementById('splashScreen');
  const main = document.getElementById('mainScreen');
  
  splash.classList.remove('active');
  main.classList.add('active');
}

// Função para navegar entre telas
function goTo(screenId) {
  // Remove active de todas as telas
  const screens = document.querySelectorAll('.screen');
  screens.forEach(screen => screen.classList.remove('active'));
  
  // Ativa a tela desejada
  document.getElementById(screenId).classList.add('active');
  
  // Carrega dados específicos da tela
  if (screenId === 'galleryScreen') {
    carregarFamilias();
  } else if (screenId === 'searchScreen') {
    buscarEspecies();
  } else if (screenId === 'statisticsScreen') {
    carregarEstatisticas();
  }
}

// ========== FUNÇÕES DO SISTEMA DE REGISTROS ==========

// Função para carregar e exibir famílias
function carregarFamilias() {
  const container = document.getElementById('familiesContainer');
  container.innerHTML = '';
  
  if (especies.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: #777;">Nenhum registro encontrado. Adicione seu primeiro registro!</p>';
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
  
  // Cria cards para cada família
  Object.keys(familias).forEach(familia => {
    const especiesDaFamilia = familias[familia];
    const card = document.createElement('div');
    card.className = 'family-card';
    card.onclick = () => mostrarEspeciesDaFamilia(familia);
    
    const familyInfo = document.createElement('div');
    familyInfo.className = 'family-info';
    
    const familyName = document.createElement('strong');
    familyName.textContent = familia;
    familyName.style.color = '#2c5e3f';
    familyName.style.fontSize = '18px';
    
    const speciesCount = document.createElement('small');
    speciesCount.textContent = `${especiesDaFamilia.length} espécie(s)`;
    speciesCount.style.color = '#777';
    
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

// Função para mostrar espécies de uma família específica
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
      e.nomePopular === especie.nomePopular && 
      e.nomeCientifico === especie.nomeCientifico &&
      e.familia === especie.familia
    );
    
    const card = document.createElement('div');
    card.className = 'card-species';
    card.onclick = () => mostrarDetalhesEspecie(originalIndex);
    
    const foto = especie.fotos && especie.fotos.length > 0 ? especie.fotos[0] : null;
    const gpsIcon = especie.coordenadas ? '📍' : '';
    
    const content = `
      <div style="display: flex; align-items: center; gap: 15px;">
        ${foto ? `<img src="${foto}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px;">` : ''}
        <div style="flex: 1;">
          <strong style="color: #2c5e3f;">${especie.nomePopular || 'Nome não informado'}</strong> ${gpsIcon}<br>
          <em style="color: #666;">${especie.nomeCientifico || ''}</em><br>
          <small style="color: #777;">${especie.local || ''}</small>
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
  
  const button = event.target;
  button.textContent = '🔄 Obtendo localização...';
  button.disabled = true;
  
  navigator.geolocation.getCurrentPosition(
    (position) => {
      currentLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy
      };
      
      document.getElementById('coordinates').textContent = 
        `${currentLocation.latitude.toFixed(6)}, ${currentLocation.longitude.toFixed(6)}`;
      document.getElementById('accuracy').textContent = currentLocation.accuracy.toFixed(0);
      document.getElementById('locationInfo').style.display = 'block';
      
      button.textContent = '✅ Localização obtida';
      button.style.backgroundColor = '#28a745';
    },
    (error) => {
      alert('Erro ao obter localização: ' + error.message);
      button.textContent = '📍 Obter Localização GPS';
      button.disabled = false;
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 300000
    }
  );
}

// ========== MÚLTIPLAS FOTOS ==========

function prepareForm() {
  editingIndex = -1;
  currentFamily = '';
  currentLocation = null;
  selectedPhotos = [];
  limparFormulario();
  goTo('addSpeciesScreen');
}

function novoRegistroParaFamilia() {
  editingIndex = -1;
  currentLocation = null;
  selectedPhotos = [];
  limparFormulario();
  document.getElementById('familia').value = currentFamily;
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
  
  // Reset location button
  const locationBtn = document.querySelector('button[onclick="obterLocalizacao()"]');
  if (locationBtn) {
    locationBtn.textContent = '📍 Obter Localização GPS';
    locationBtn.style.backgroundColor = '';
    locationBtn.disabled = false;
  }
}

// Event listener para múltiplas fotos
document.addEventListener('DOMContentLoaded', function() {
  const fotoInput = document.getElementById('fotoInput');
  if (fotoInput) {
    fotoInput.addEventListener('change', function(e) {
      handlePhotoSelection(e.target.files);
    });
  }
});

function handlePhotoSelection(files) {
  const preview = document.getElementById('photosPreview');
  
  Array.from(files).forEach((file, index) => {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = function(e) {
        selectedPhotos.push(e.target.result);
        
        const photoDiv = document.createElement('div');
        photoDiv.className = 'photo-preview';
        photoDiv.innerHTML = `
          <img src="${e.target.result}" alt="Preview">
          <button class="remove-photo" onclick="removePhoto(${selectedPhotos.length - 1})">×</button>
        `;
        
        preview.appendChild(photoDiv);
      };
      reader.readAsDataURL(file);
    }
  });
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
      <img src="${photo}" alt="Preview">
      <button class="remove-photo" onclick="removePhoto(${index})">×</button>
    `;
    preview.appendChild(photoDiv);
  });
}

// ========== SALVAR ESPÉCIE ==========

function salvarEspecie() {
  const nomePopular = document.getElementById('nomePopular').value.trim();
  const nomeCientifico = document.getElementById('nomeCientifico').value.trim();
  const familia = document.getElementById('familia').value.trim();
  const local = document.getElementById('local').value.trim();
  const notas = document.getElementById('notas').value.trim();
  
  if (!nomePopular && !nomeCientifico) {
    alert('Por favor, preencha pelo menos o nome popular ou científico.');
    return;
  }
  
  const especie = {
    nomePopular,
    nomeCientifico,
    familia: familia || 'Sem Família',
    local,
    notas,
    dataRegistro: new Date().toLocaleDateString('pt-BR'),
    fotos: selectedPhotos,
    coordenadas: currentLocation
  };
  
  finalizarSalvamento(especie);
}

function finalizarSalvamento(especie) {
  if (editingIndex >= 0) {
    // Editando espécie existente
    especies[editingIndex] = especie;
  } else {
    // Nova espécie
    especies.push(especie);
  }
  
  // Salva no localStorage
  localStorage.setItem('especies', JSON.stringify(especies));
  
  alert('Registro salvo com sucesso!');
  goTo('galleryScreen');
}

// ========== DETALHES DA ESPÉCIE ==========

function mostrarDetalhesEspecie(index) {
  if (index < 0 || index >= especies.length) return;
  
  const especie = especies[index];
  editingIndex = index;
  
  // Atualiza elementos da tela de detalhes
  document.getElementById('detailTitle').textContent = especie.nomePopular || 'Espécie';
  
  // Galeria de imagens
  const detailImages = document.getElementById('detailImages');
  detailImages.innerHTML = '';
  
  if (especie.fotos && especie.fotos.length > 0) {
    especie.fotos.forEach(foto => {
      const imageDiv = document.createElement('div');
      imageDiv.className = 'detail-image';
      imageDiv.innerHTML = `<img src="${foto}" alt="${especie.nomePopular || 'Espécie'}">`;
      imageDiv.onclick = () => openImageModal(foto);
      detailImages.appendChild(imageDiv);
    });
  }
  
  const detailInfo = document.getElementById('detailInfo');
  let coordenadasInfo = '';
  if (especie.coordenadas) {
    coordenadasInfo = `<p><strong>Coordenadas:</strong> ${especie.coordenadas.latitude.toFixed(6)}, ${especie.coordenadas.longitude.toFixed(6)} (±${especie.coordenadas.accuracy.toFixed(0)}m)</p>`;
  }
  
  detailInfo.innerHTML = `
    <p><strong>Nome Popular:</strong> ${especie.nomePopular || 'Não informado'}</p>
    <p><strong>Nome Científico:</strong> ${especie.nomeCientifico || 'Não informado'}</p>
    <p><strong>Família:</strong> ${especie.familia || 'Não informado'}</p>
    <p><strong>Local:</strong> ${especie.local || 'Não informado'}</p>
    <p><strong>Data do Registro:</strong> ${especie.dataRegistro || 'Não informado'}</p>
    ${coordenadasInfo}
    ${especie.notas ? `<p><strong>Notas:</strong> ${especie.notas}</p>` : ''}
  `;
  
  goTo('speciesDetailScreen');
}

function openImageModal(imageSrc) {
  // Implementar modal de imagem em versão futura
  window.open(imageSrc, '_blank');
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
    document.getElementById('accuracy').textContent = currentLocation.accuracy.toFixed(0);
    document.getElementById('locationInfo').style.display = 'block';
    
    const locationBtn = document.querySelector('button[onclick="obterLocalizacao()"]');
    if (locationBtn) {
      locationBtn.textContent = '✅ Localização obtida';
      locationBtn.style.backgroundColor = '#28a745';
    }
  }
  
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
    especies.splice(editingIndex, 1);
    localStorage.setItem('especies', JSON.stringify(especies));
    alert('Registro excluído com sucesso!');
    editingIndex = -1;
    fecharModal();
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
    const textoMatch = 
      (especie.nomePopular && especie.nomePopular.toLowerCase().includes(searchTerm)) ||
      (especie.nomeCientifico && especie.nomeCientifico.toLowerCase().includes(searchTerm)) ||
      (especie.familia && especie.familia.toLowerCase().includes(searchTerm)) ||
      (especie.local && especie.local.toLowerCase().includes(searchTerm));
    
    // Filtro de foto
    const fotoMatch = !filterFoto || (especie.fotos && especie.fotos.length > 0);
    
    // Filtro de GPS
    const gpsMatch = !filterGPS || especie.coordenadas;
    
    return textoMatch && fotoMatch && gpsMatch;
  });
  
  const container = document.getElementById('searchResults');
  container.innerHTML = '';
  
  if (resultados.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: #777;">Nenhum resultado encontrado.</p>';
    return;
  }
  
  resultados.forEach(especie => {
    const originalIndex = especies.indexOf(especie);
    const card = document.createElement('div');
    card.className = 'card-species';
    card.onclick = () => mostrarDetalhesEspecie(originalIndex);
    
    const foto = especie.fotos && especie.fotos.length > 0 ? especie.fotos[0] : null;
    const gpsIcon = especie.coordenadas ? '📍' : '';
    const fotoIcon = foto ? '📷' : '';
    
    card.innerHTML = `
      <div style="display: flex; align-items: center; gap: 15px;">
        ${foto ? `<img src="${foto}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px;">` : ''}
        <div style="flex: 1;">
          <strong style="color: #2c5e3f;">${especie.nomePopular || 'Nome não informado'}</strong> ${gpsIcon} ${fotoIcon}<br>
          <em style="color: #666;">${especie.nomeCientifico || ''}</em><br>
          <small style="color: #777;">${especie.familia || ''} • ${especie.local || ''}</small>
        </div>
      </div>
    `;
    
    container.appendChild(card);
  });
}

// ========== ESTATÍSTICAS ==========

function carregarEstatisticas() {
  const container = document.getElementById('statsContainer');
  container.innerHTML = '';
  
  // Total de espécies
  const totalCard = document.createElement('div');
  totalCard.className = 'stat-card';
  totalCard.innerHTML = `
    <div class="stat-number">${especies.length}</div>
    <div class="stat-label">Total de Registros</div>
    <div class="stat-description">Espécies catalogadas</div>
  `;
  container.appendChild(totalCard);
  
  // Total de famílias
  const familias = new Set(especies.map(e => e.familia || 'Sem Família'));
  const familiasCard = document.createElement('div');
  familiasCard.className = 'stat-card';
  familiasCard.innerHTML = `
    <div class="stat-number">${familias.size}</div>
    <div class="stat-label">Famílias</div>
    <div class="stat-description">Diferentes famílias botânicas</div>
  `;
  container.appendChild(familiasCard);
  
  // Com fotos
  const comFotos = especies.filter(e => e.fotos && e.fotos.length > 0).length;
  const fotosCard = document.createElement('div');
  fotosCard.className = 'stat-card';
  fotosCard.innerHTML = `
    <div class="stat-number">${comFotos}</div>
    <div class="stat-label">Com Fotos</div>
    <div class="stat-description">${((comFotos/especies.length)*100).toFixed(1)}% dos registros</div>
  `;
  container.appendChild(fotosCard);
  
  // Com GPS
  const comGPS = especies.filter(e => e.coordenadas).length;
  const gpsCard = document.createElement('div');
  gpsCard.className = 'stat-card';
  gpsCard.innerHTML = `
    <div class="stat-number">${comGPS}</div>
    <div class="stat-label">Com GPS</div>
    <div class="stat-description">${((comGPS/especies.length)*100).toFixed(1)}% dos registros</div>
  `;
  container.appendChild(gpsCard);
  
  // Família mais comum
  if (especies.length > 0) {
    const contadorFamilias = {};
    especies.forEach(e => {
      const familia = e.familia || 'Sem Família';
      contadorFamilias[familia] = (contadorFamilias[familia] || 0) + 1;
    });
    
    const familiaMaisComum = Object.entries(contadorFamilias)
      .sort(([,a], [,b]) => b - a)[0];
    
    const familiaComumCard = document.createElement('div');
    familiaComumCard.className = 'stat-card';
    familiaComumCard.innerHTML = `
      <div class="stat-number">${familiaMaisComum[1]}</div>
      <div class="stat-label">Família mais comum</div>
      <div class="stat-description">${familiaMaisComum[0]}</div>
    `;
    container.appendChild(familiaComumCard);
  }
}