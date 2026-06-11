// Calcula el proximo service de un vehiculo y su estado de alerta.
// Usa intervalos por km (service_cada_km) y por tiempo (service_cada_meses).
const DIA = 86400000;

export function calcService(v) {
  if (!v) return { estado: 'sin_datos' };
  const cadaKm = Number(v.service_cada_km) || 0;
  const cadaMeses = Number(v.service_cada_meses) || 0;
  if (!cadaKm && !cadaMeses) return { estado: 'sin_config' };

  const odo = v.odometro != null ? Number(v.odometro) : null;
  const baseKm = v.ult_service_km != null ? Number(v.ult_service_km) : (odo != null ? odo : null);
  const baseFecha = v.ult_service_fecha ? new Date(v.ult_service_fecha) : null;

  let proxKm = null, kmRestante = null;
  if (cadaKm && baseKm != null) { proxKm = baseKm + cadaKm; if (odo != null) kmRestante = proxKm - odo; }

  let proxFecha = null, diasRestante = null;
  if (cadaMeses && baseFecha) { proxFecha = new Date(baseFecha); proxFecha.setMonth(proxFecha.getMonth() + cadaMeses); diasRestante = Math.round((proxFecha - Date.now()) / DIA); }
  // si hay intervalo por meses pero nunca hubo service, sugiere desde hoy
  if (cadaMeses && !baseFecha && !proxFecha) { proxFecha = new Date(); proxFecha.setMonth(proxFecha.getMonth() + cadaMeses); diasRestante = cadaMeses * 30; }

  // estado: el mas critico entre km y tiempo
  let estado = 'ok';
  const venceKm = kmRestante != null && kmRestante <= 0;
  const prontoKm = kmRestante != null && kmRestante > 0 && kmRestante <= 500;
  const venceDia = diasRestante != null && diasRestante <= 0;
  const prontoDia = diasRestante != null && diasRestante > 0 && diasRestante <= 15;
  if (venceKm || venceDia) estado = 'vencido';
  else if (prontoKm || prontoDia) estado = 'pronto';

  return { estado, proxKm, kmRestante, proxFecha, diasRestante, cadaKm, cadaMeses };
}

export const SRV_LABEL = {
  ok: ['ok', 'Service al dia'],
  pronto: ['warn', 'Service proximo'],
  vencido: ['falla', 'Service vencido'],
  sin_config: ['gris', 'Sin plan de service'],
  sin_datos: ['gris', '-'],
};
