const express = require('express');
const cors = require('cors');
const path = require('path');
const { dbGet, dbAll, dbRun } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- API LOGIN ---
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    // Hardcoded password for simplicity as requested
    if (password === '1234') {
        res.json({ success: true, token: 'fake-jwt-token-123' });
    } else {
        res.status(401).json({ error: 'Contraseña incorrecta' });
    }
});

// --- API CONFIGURACION ---
app.get('/api/configuracion', async (req, res) => {
    try {
        const config = await dbGet("SELECT * FROM configuracion WHERE id = 1");
        res.json(config);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/configuracion', async (req, res) => {
    const { nombre, nit, direccion, ciudad, contacto, alerta_stock_minimo, factor_holgura, cupo_base_nuevos } = req.body;
    try {
        await dbRun(
            `UPDATE configuracion SET 
                nombre = ?, nit = ?, direccion = ?, ciudad = ?, contacto = ?, 
                alerta_stock_minimo = ?, factor_holgura = ?, cupo_base_nuevos = ?
             WHERE id = 1`,
            [nombre, nit, direccion, ciudad, contacto, alerta_stock_minimo, factor_holgura, cupo_base_nuevos]
        );
        res.json({ message: 'Configuración actualizada' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- API TANQUES ---
app.get('/api/tanques', async (req, res) => {
    try {
        const tanques = await dbAll("SELECT * FROM tanques");
        for (let tanque of tanques) {
            // Calcular ingresos
            const ingresosRes = await dbGet("SELECT SUM(litros) as total FROM ingresos WHERE tanque_id = ?", [tanque.id]);
            const totalIngresos = ingresosRes.total || 0;
            
            // Calcular salidas
            const salidasRes = await dbGet("SELECT SUM(litros) as total FROM salidas WHERE tanque_id = ?", [tanque.id]);
            const totalSalidas = salidasRes.total || 0;
            
            tanque.stock_actual = totalIngresos - totalSalidas;
        }
        res.json(tanques);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- API INGRESOS (ABASTECIMIENTO) ---
app.post('/api/ingresos', async (req, res) => {
    const { tanque_id, litros, factura_proveedor } = req.body;
    try {
        await dbRun(
            "INSERT INTO ingresos (tanque_id, litros, factura_proveedor) VALUES (?, ?, ?)",
            [tanque_id, litros, factura_proveedor]
        );
        res.json({ message: 'Ingreso registrado correctamente' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- API CLIENTES Y LÍMITES ---
app.get('/api/clientes/:placa/limite', async (req, res) => {
    const { placa } = req.params;
    try {
        const config = await dbGet("SELECT factor_holgura, cupo_base_nuevos FROM configuracion WHERE id = 1");
        const cliente = await dbGet("SELECT id FROM clientes WHERE placa = ?", [placa]);
        
        let limite = 0;
        let es_nuevo = false;

        if (!cliente) {
            // Cliente nuevo
            es_nuevo = true;
            limite = config.cupo_base_nuevos;
        } else {
            // Cliente existente, calcular Promedio Semanal
            // Sumar todos los litros comprados en los últimos 28 días
            const query = `
                SELECT SUM(litros) as total_28_dias 
                FROM salidas 
                WHERE cliente_id = ? AND fecha >= datetime('now', '-28 days', 'localtime')
            `;
            const result = await dbGet(query, [cliente.id]);
            const total = result.total_28_dias || 0;
            
            if (total === 0) {
                // Si existe pero no compró en 28 días, le damos el cupo base
                limite = config.cupo_base_nuevos;
            } else {
                const promedio_semanal = total / 4.0;
                limite = promedio_semanal + (promedio_semanal * (config.factor_holgura / 100.0));
            }
        }

        res.json({ 
            placa, 
            cliente_id: cliente ? cliente.id : null,
            es_nuevo, 
            limite: Math.round(limite * 100) / 100 // Redondear a 2 decimales
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- API VENTAS (SALIDAS) ---
app.get('/api/ventas/hoy', async (req, res) => {
    try {
        const query = `
            SELECT s.id, s.litros, s.fecha, c.placa, s.tanque_id 
            FROM salidas s 
            JOIN clientes c ON s.cliente_id = c.id 
            WHERE date(s.fecha) = date('now', 'localtime') 
            ORDER BY s.fecha DESC
        `;
        const ventas = await dbAll(query);
        res.json(ventas);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/ventas', async (req, res) => {
    const { tanque_id, placa, litros } = req.body;
    try {
        // 1. Obtener límite
        const config = await dbGet("SELECT factor_holgura, cupo_base_nuevos FROM configuracion WHERE id = 1");
        let cliente = await dbGet("SELECT id FROM clientes WHERE placa = ?", [placa]);
        
        let limite = 0;

        if (!cliente) {
            // Registrar cliente automáticamente
            const result = await dbRun("INSERT INTO clientes (placa) VALUES (?)", [placa]);
            cliente = { id: result.lastID };
            limite = config.cupo_base_nuevos;
        } else {
            const query = `
                SELECT SUM(litros) as total_28_dias 
                FROM salidas 
                WHERE cliente_id = ? AND fecha >= datetime('now', '-28 days', 'localtime')
            `;
            const result = await dbGet(query, [cliente.id]);
            const total = result.total_28_dias || 0;
            if (total === 0) {
                limite = config.cupo_base_nuevos;
            } else {
                const promedio_semanal = total / 4.0;
                limite = promedio_semanal + (promedio_semanal * (config.factor_holgura / 100.0));
            }
        }

        // 2. Validar límite
        if (litros > limite) {
            return res.status(400).json({ 
                error: 'Excede el límite permitido', 
                limite_permitido: Math.round(limite * 100) / 100 
            });
        }

        // 3. Registrar venta
        await dbRun(
            "INSERT INTO salidas (tanque_id, cliente_id, litros) VALUES (?, ?, ?)",
            [tanque_id, cliente.id, litros]
        );
        
        res.json({ message: 'Venta registrada exitosamente', litros_despachados: litros });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor de LaLuDiCa Petrol corriendo en http://localhost:${PORT}`);
});
