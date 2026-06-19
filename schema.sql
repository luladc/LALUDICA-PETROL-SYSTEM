CREATE TABLE IF NOT EXISTS configuracion (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT DEFAULT 'LaLuDiCa Petrol',
    nit TEXT DEFAULT '123456789',
    direccion TEXT DEFAULT 'Av. Principal 123',
    ciudad TEXT DEFAULT 'Ciudad',
    contacto TEXT DEFAULT '555-0000',
    alerta_stock_minimo INTEGER DEFAULT 20,
    factor_holgura REAL DEFAULT 10.0,
    cupo_base_nuevos REAL DEFAULT 50.0
);

CREATE TABLE IF NOT EXISTS tanques (
    id TEXT PRIMARY KEY,
    tipo TEXT NOT NULL,
    capacidad_maxima REAL NOT NULL,
    stock_minimo REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    documento TEXT,
    nombre TEXT DEFAULT 'Cliente Nuevo',
    placa TEXT UNIQUE NOT NULL,
    tipo TEXT DEFAULT 'Particular',
    estado TEXT DEFAULT 'Activo'
);

CREATE TABLE IF NOT EXISTS ingresos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tanque_id TEXT,
    litros REAL NOT NULL,
    factura_proveedor TEXT,
    fecha DATETIME DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY(tanque_id) REFERENCES tanques(id)
);

CREATE TABLE IF NOT EXISTS salidas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tanque_id TEXT,
    cliente_id INTEGER,
    litros REAL NOT NULL,
    fecha DATETIME DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY(tanque_id) REFERENCES tanques(id),
    FOREIGN KEY(cliente_id) REFERENCES clientes(id)
);

-- Insertar configuración inicial si no existe
INSERT INTO configuracion (id, nombre, nit, direccion, ciudad, contacto, alerta_stock_minimo, factor_holgura, cupo_base_nuevos) 
SELECT 1, 'LaLuDiCa Petrol', '123456789', 'Av. Principal 123', 'Ciudad', '555-0000', 20, 10.0, 50.0
WHERE NOT EXISTS (SELECT 1 FROM configuracion WHERE id = 1);

-- Insertar tanques por defecto si no existen
INSERT INTO tanques (id, tipo, capacidad_maxima, stock_minimo) 
SELECT 'T1', 'Gasolina', 10000, 2000
WHERE NOT EXISTS (SELECT 1 FROM tanques WHERE id = 'T1');

INSERT INTO tanques (id, tipo, capacidad_maxima, stock_minimo) 
SELECT 'T2', 'Diésel', 10000, 2000
WHERE NOT EXISTS (SELECT 1 FROM tanques WHERE id = 'T2');
