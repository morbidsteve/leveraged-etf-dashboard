/**
 * Spanish translations. Partial — falls back to English for any
 * missing keys.
 */

const es: Record<string, string> = {
  // Signals
  'signal.buy': 'COMPRAR',
  'signal.sell': 'VENDER',
  'signal.neutral': 'NEUTRAL',
  'signal.firing': 'Activándose ahora',
  'signal.notFiring': 'No activado',

  // Trade actions
  'trade.opened': 'Operación abierta: {ticker}',
  'trade.closed': 'Cerrado {ticker} · {pnl}',
  'trade.partialClose': 'Cierre parcial: {ticker} · {shares} acciones',
  'trade.takeProfit': '{ticker} · TOMA DE GANANCIA al {pct}%',
  'trade.stopHit': '{ticker} · STOP ACTIVADO al {pct}%',

  // Strategy
  'strategy.enabled': 'Activada "{name}"',
  'strategy.disabled': 'Desactivada "{name}"',
  'strategy.cloned': 'Clonada a "{name}"',
  'strategy.fired': 'Estrategia activada: {name}',

  // Common UI
  'ui.cancel': 'Cancelar',
  'ui.save': 'Guardar',
  'ui.close': 'Cerrar',
  'ui.confirm': 'Confirmar',
  'ui.delete': 'Eliminar',
  'ui.refresh': 'Actualizar',
  'ui.loading': 'Cargando…',
  'ui.error': 'Error',
};

export default es;
