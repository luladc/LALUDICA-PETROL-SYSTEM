document.addEventListener('DOMContentLoaded', () => {
    // API URL Base
    const API_BASE = 'http://localhost:3000/api';

    // Global State
    let globalConfig = null;
    let currentLimit = null;

    // Login logic
    const loginScreen = document.getElementById('login-screen');
    const appContainer = document.getElementById('app-container');
    const formLogin = document.getElementById('form-login');

    if (!sessionStorage.getItem('logged_in')) {
        loginScreen.style.display = 'flex';
        appContainer.style.display = 'none';
    } else {
        loginScreen.style.display = 'none';
        appContainer.style.display = 'flex';
        initApp();
    }

    formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        const pwd = document.getElementById('login-password').value;
        try {
            const res = await fetchAPI('/login', { method: 'POST', body: JSON.stringify({ password: pwd }) });
            if (res.success) {
                sessionStorage.setItem('logged_in', 'true');
                loginScreen.style.display = 'none';
                appContainer.style.display = 'flex';
                initApp();
            }
        } catch (e) {
            // Toast will show error
        }
    });

    function initApp() {
        // Init view
        loadDashboard();
    }

    // Elements
    const navLinks = document.querySelectorAll('.nav-links li');
    const sections = document.querySelectorAll('.view-section');
    const toast = document.getElementById('toast');

    // POS Elements
    const posPlacaInput = document.getElementById('pos-placa');
    const posLitrosInput = document.getElementById('pos-litros');
    const limitIndicator = document.getElementById('limit-indicator');
    const limitValueSpan = document.getElementById('limit-value');
    const clientStatusSpan = document.getElementById('client-status');
    const posAlert = document.getElementById('pos-alert');
    const btnDespachar = document.getElementById('btn-despachar');

    // Navigation Logic
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            navLinks.forEach(n => n.classList.remove('active'));
            link.classList.add('active');
            const targetId = link.getAttribute('data-target');
            
            sections.forEach(sec => sec.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');

            // Refresh data based on view
            if (targetId === 'dashboard') loadDashboard();
            if (targetId === 'pos' || targetId === 'supply') loadTanquesSelects();
            if (targetId === 'settings') loadConfig();
        });
    });

    // --- UTILS ---
    function showToast(message, isError = false) {
        toast.textContent = message;
        toast.className = `toast show ${isError ? 'error' : ''}`;
        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    async function fetchAPI(endpoint, options = {}) {
        try {
            const response = await fetch(`${API_BASE}${endpoint}`, {
                headers: { 'Content-Type': 'application/json' },
                ...options
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Error en la petición');
            return data;
        } catch (error) {
            showToast(error.message, true);
            throw error;
        }
    }

    // --- DASHBOARD ---
    async function loadDashboard() {
        if (!globalConfig) await loadConfigData();
        const tanques = await fetchAPI('/tanques');
        const container = document.getElementById('tanks-container');
        container.innerHTML = '';

        tanques.forEach(tanque => {
            const stockActual = tanque.stock_actual || 0;
            const porcentaje = Math.min((stockActual / tanque.capacidad_maxima) * 100, 100);
            
            let fillClass = 'fill-safe';
            if (stockActual <= globalConfig.alerta_stock_minimo || stockActual <= tanque.stock_minimo) {
                fillClass = 'fill-danger';
            } else if (porcentaje < 30) {
                fillClass = 'fill-warning';
            }

            const isGasolina = tanque.tipo.toLowerCase() === 'gasolina';

            container.innerHTML += `
                <div class="tank-card">
                    <div class="tank-header">
                        <h3>⛽ ${tanque.id}</h3>
                        <span class="tank-type ${isGasolina ? 'type-gasolina' : 'type-diesel'}">${tanque.tipo}</span>
                    </div>
                    <div class="stock-info">
                        <div class="stock-value">${stockActual.toFixed(2)}</div>
                        <div class="stock-unit">/ ${tanque.capacidad_maxima} L</div>
                    </div>
                    <div class="progress-bg">
                        <div class="progress-fill ${fillClass}" style="width: ${porcentaje}%"></div>
                    </div>
                    <small>Mínimo requerido: ${tanque.stock_minimo} L</small>
                </div>
            `;
        });

        // Load Ventas de Hoy
        const ventasHoyBody = document.getElementById('ventas-hoy-tbody');
        try {
            const ventas = await fetchAPI('/ventas/hoy');
            if (ventas.length === 0) {
                ventasHoyBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-secondary);">No hay ventas registradas hoy.</td></tr>';
            } else {
                ventasHoyBody.innerHTML = ventas.map(v => `
                    <tr>
                        <td>${new Date(v.fecha).toLocaleString()}</td>
                        <td style="font-weight: 600;">${v.placa}</td>
                        <td>${v.tanque_id}</td>
                        <td style="color: var(--warning-color); font-weight: bold;">${v.litros.toFixed(2)} L</td>
                    </tr>
                `).join('');
            }
        } catch (e) {
            ventasHoyBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--danger-color);">Error al cargar ventas.</td></tr>';
        }
    }

    // --- TANQUES SELECTS ---
    async function loadTanquesSelects() {
        const tanques = await fetchAPI('/tanques');
        const posSelect = document.getElementById('pos-tanque');
        const supSelect = document.getElementById('sup-tanque');
        
        const optionsHTML = tanques.map(t => `<option value="${t.id}">${t.id} - ${t.tipo} (Disp: ${t.stock_actual.toFixed(2)}L)</option>`).join('');
        posSelect.innerHTML = optionsHTML;
        supSelect.innerHTML = optionsHTML;
    }

    // --- PUNTO DE VENTA (CRÍTICO) ---
    // Debounce function para no consultar la API en cada tecla
    let typingTimer;
    posPlacaInput.addEventListener('input', () => {
        clearTimeout(typingTimer);
        const placa = posPlacaInput.value.trim().toUpperCase();
        posPlacaInput.value = placa; // auto uppercase
        
        limitIndicator.classList.remove('show');
        posLitrosInput.disabled = true;
        btnDespachar.disabled = true;
        currentLimit = null;

        if (placa.length >= 6) {
            typingTimer = setTimeout(() => verificarLimite(placa), 500);
        }
    });

    async function verificarLimite(placa) {
        try {
            const data = await fetchAPI(`/clientes/${placa}/limite`);
            currentLimit = data.limite;
            
            limitValueSpan.textContent = `${currentLimit.toFixed(2)} L`;
            limitIndicator.classList.add('show');
            
            if (currentLimit > 0) {
                clientStatusSpan.textContent = "Habilitado";
                clientStatusSpan.style.color = "#10b981";
                posLitrosInput.disabled = false;
                btnDespachar.disabled = false;
            } else {
                clientStatusSpan.textContent = "Inhabilitado";
                clientStatusSpan.style.color = "#ef4444";
                posLitrosInput.disabled = true;
                btnDespachar.disabled = true;
                showToast("El cliente no tiene cupo disponible.", true);
            }
            posAlert.style.display = 'none'; // reset alert
            posLitrosInput.value = ''; // reset input
        } catch (error) {
            console.error("Error validando límite");
        }
    }

    posLitrosInput.addEventListener('input', () => {
        if (currentLimit === null) return;
        const val = parseFloat(posLitrosInput.value);
        if (val > currentLimit) {
            // Escenario A: Excede el límite. Botón deshabilitado y se alerta al operador.
            btnDespachar.disabled = true;
            posAlert.style.display = 'block';
        } else {
            // Escenario B: Dentro del límite. Botón habilitado.
            btnDespachar.disabled = false;
            posAlert.style.display = 'none';
        }
    });

    document.getElementById('form-venta').addEventListener('submit', async (e) => {
        e.preventDefault();
        const tanqueSelect = document.getElementById('pos-tanque');
        const tanque_id = tanqueSelect.value;
        const tanque_texto = tanqueSelect.options[tanqueSelect.selectedIndex].text.split(' (')[0];
        const placa = posPlacaInput.value.trim();
        const litros = parseFloat(posLitrosInput.value);

        try {
            const btn = document.getElementById('btn-despachar');
            btn.disabled = true;
            btn.textContent = 'Procesando...';

            await fetchAPI('/ventas', {
                method: 'POST',
                body: JSON.stringify({ tanque_id, placa, litros })
            });
            
            showToast('Venta registrada con éxito.');
            
            // Show Invoice Modal
            const now = new Date();
            document.getElementById('inv-empresa').textContent = globalConfig.nombre;
            document.getElementById('inv-fecha').textContent = now.toLocaleString();
            document.getElementById('inv-placa').textContent = placa;
            document.getElementById('inv-tanque').textContent = tanque_texto;
            document.getElementById('inv-litros').textContent = litros.toFixed(2) + ' L';
            
            document.getElementById('invoice-modal').classList.add('show');

            document.getElementById('form-venta').reset();
            limitIndicator.classList.remove('show');
            posLitrosInput.disabled = true;
            btn.disabled = true;
            btn.textContent = 'Procesar';
            loadTanquesSelects(); // Actualizar disponibilidad
        } catch (error) {
            document.getElementById('btn-despachar').disabled = false;
            document.getElementById('btn-despachar').textContent = 'Procesar';
        }
    });

    // --- ABASTECIMIENTO ---
    document.getElementById('form-ingreso').addEventListener('submit', async (e) => {
        e.preventDefault();
        const tanque_id = document.getElementById('sup-tanque').value;
        const litros = parseFloat(document.getElementById('sup-litros').value);
        const factura_proveedor = document.getElementById('sup-factura').value;

        try {
            await fetchAPI('/ingresos', {
                method: 'POST',
                body: JSON.stringify({ tanque_id, litros, factura_proveedor })
            });
            showToast('Ingreso registrado a tanque correctamente.');
            document.getElementById('form-ingreso').reset();
            loadTanquesSelects();
        } catch (error) {}
    });

    // --- CONFIGURACIÓN ---
    async function loadConfigData() {
        globalConfig = await fetchAPI('/configuracion');
    }

    async function loadConfig() {
        await loadConfigData();
        document.getElementById('cfg-nombre').value = globalConfig.nombre;
        document.getElementById('cfg-nit').value = globalConfig.nit;
        document.getElementById('cfg-holgura').value = globalConfig.factor_holgura;
        document.getElementById('cfg-nuevos').value = globalConfig.cupo_base_nuevos;
        document.getElementById('cfg-alerta').value = globalConfig.alerta_stock_minimo;
    }

    document.getElementById('form-config').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            nombre: document.getElementById('cfg-nombre').value,
            nit: document.getElementById('cfg-nit').value,
            factor_holgura: parseFloat(document.getElementById('cfg-holgura').value),
            cupo_base_nuevos: parseFloat(document.getElementById('cfg-nuevos').value),
            alerta_stock_minimo: parseInt(document.getElementById('cfg-alerta').value),
            direccion: globalConfig.direccion,
            ciudad: globalConfig.ciudad,
            contacto: globalConfig.contacto
        };

        try {
            await fetchAPI('/configuracion', {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            showToast('Configuración global actualizada.');
            await loadConfigData();
        } catch (error) {}
    });

    // Removed Init loadDashboard here, moved to initApp()
});
