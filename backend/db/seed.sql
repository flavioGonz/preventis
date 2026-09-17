-- =====================================================================
--  Datos iniciales de catálogos + datos de ejemplo
-- =====================================================================
INSERT INTO sistemas (nombre) VALUES
  ('Detección de incendios'),
  ('Extinción'),
  ('Alarma de robo'),
  ('CCTV'),
  ('Control de acceso')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO tipos_elemento (nombre) VALUES
  ('Detector de humo'),
  ('Detector térmico'),
  ('Pulsador manual'),
  ('Sirena'),
  ('Central'),
  ('Cámara'),
  ('Extintor'),
  ('Sensor de movimiento')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO estados_equipo (nombre, es_falla, orden) VALUES
  ('OK / Funciona', FALSE, 1),
  ('Funciona con observaciones', FALSE, 2),
  ('En falla', TRUE, 3),
  ('No funciona', TRUE, 4),
  ('No probado', FALSE, 5),
  ('Requiere repuesto', TRUE, 6)
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO tecnicos (nombre, telefono) VALUES
  ('Juan Pérez', '099111222'),
  ('María González', '099333444')
ON CONFLICT DO NOTHING;

-- Cliente de ejemplo
INSERT INTO clientes (nombre, direccion, telefono, frecuencia)
SELECT 'Cliente Demo S.A.', 'Av. Italia 1234, Montevideo', '24001234', 'mensual'
WHERE NOT EXISTS (SELECT 1 FROM clientes WHERE nombre='Cliente Demo S.A.');
