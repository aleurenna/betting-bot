/**
 * Módulo de cálculos para apuestas
 * EV, Kelly Criterion, Arbitrage Detection
 */

/**
 * Calcula Expected Value
 * EV = (Probabilidad × Odds) - 1
 * Positivo = Buena apuesta
 */
export function calcularEV(probabilidad, odds) {
  if (odds <= 0 || probabilidad <= 0 || probabilidad > 1) return null;
  return (probabilidad * odds) - 1;
}

/**
 * Kelly Criterion - Qué porcentaje de bankroll apostar
 * f* = (bp - q) / b
 * b = odds - 1
 * p = probabilidad
 * q = 1 - p
 */
export function kellyPercentage(probabilidad, odds, fractionKelly = 0.25) {
  if (odds <= 1 || probabilidad <= 0 || probabilidad >= 1) return 0;
  
  const b = odds - 1;
  const q = 1 - probabilidad;
  const f = (b * probabilidad - q) / b;
  
  // Aplicar fractional kelly (25% = más conservador)
  return Math.max(0, f * fractionKelly);
}

/**
 * Calcula cantidad a apostar basado en Kelly Criterion
 * @param {number} bankroll - Bankroll actual en unidades monetarias
 * @param {number} probabilidad - Probabilidad estimada (0-1)
 * @param {number} odds - Odds decimales
 * @param {number} minApuesta - Apuesta mínima (ej: $1, ₡100)
 * @param {number} maxApuesta - Apuesta máxima por evento (% del bankroll)
 * @returns {object} { cantidad, kelly_pct, riesgo_nivel }
 */
export function calcularApuesta(bankroll, probabilidad, odds, minApuesta = 1, maxApuesta = 0.05) {
  if (odds <= 1 || probabilidad <= 0 || probabilidad >= 1 || bankroll <= 0) {
    return { cantidad: 0, kelly_pct: 0, riesgo_nivel: 'muy_bajo' };
  }

  // Calcular Kelly %
  const kelly = kellyPercentage(probabilidad, odds, 0.25);
  
  // Calcular cantidad
  let cantidad = bankroll * kelly;
  
  // Respetar máximo por evento (5% del bankroll)
  const maxPorEvento = bankroll * maxApuesta;
  cantidad = Math.min(cantidad, maxPorEvento);
  
  // Redondear a unidad mínima
  cantidad = Math.max(minApuesta, Math.round(cantidad / minApuesta) * minApuesta);
  
  // Determinar nivel de riesgo
  const riesgoRatio = cantidad / bankroll;
  let riesgoNivel = 'bajo';
  if (riesgoRatio > 0.1) riesgoNivel = 'medio';
  if (riesgoRatio > 0.15) riesgoNivel = 'alto';
  if (riesgoRatio > 0.25) riesgoNivel = 'muy_alto';

  return {
    cantidad: cantidad,
    kelly_pct: (kelly * 100).toFixed(2),
    riesgo_ratio: (riesgoRatio * 100).toFixed(2),
    riesgo_nivel: riesgoNivel,
    ganancia_esperada: (cantidad * (odds - 1) * probabilidad).toFixed(2),
    pérdida_esperada: (cantidad * (1 - probabilidad) * -1).toFixed(2)
  };
}

/**
 * Calcula resultado esperado de la apuesta
 */
export function calcularGananciaEsperada(apuesta, odds, probabilidad) {
  const ganancia = apuesta * odds * probabilidad;
  const pérdida = apuesta * (1 - probabilidad) * -1;
  const valor_esperado = ganancia + pérdida;
  
  return {
    ganancia_si_gana: (apuesta * (odds - 1)).toFixed(2),
    pérdida_si_pierde: (-apuesta).toFixed(2),
    ganancia_esperada: ganancia.toFixed(2),
    pérdida_esperada: Math.abs(pérdida).toFixed(2),
    valor_esperado: valor_esperado.toFixed(2)
  };
}

/**
 * Probabilidad implícita desde odds decimales
 */
export function probImplicita(odds) {
  if (odds <= 0) return 0;
  return 1 / odds;
}

/**
 * Detecta arbitraje entre odds
 * Retorna porcentaje de ganancia si existe
 * arb% < 0 = hay ganancia
 */
export function detectarArbitraje(oddsCasa1, oddsCasa2) {
  const sumInversas = (1 / oddsCasa1) + (1 / oddsCasa2);
  const arbPercentage = (sumInversas - 1) * 100;
  
  return {
    existe: arbPercentage < 0,
    ganancia: Math.abs(arbPercentage),
    margen: (1 - sumInversas) * 100
  };
}

/**
 * Detecta oportunidades de arbitraje triple
 * Para 3 outcomes (Home, Draw, Away)
 */
export function detectarArbTriple(oddHome, oddDraw, oddAway) {
  const sumInversas = (1 / oddHome) + (1 / oddDraw) + (1 / oddAway);
  
  if (sumInversas < 1) {
    // Hay arbitraje
    const gananciaPorcentaje = ((1 / sumInversas) - 1) * 100;
    return {
      existe: true,
      gananciaPorcentaje: gananciaPorcentaje.toFixed(2),
      apuestas: {
        home: (1 / oddHome / sumInversas * 100).toFixed(2) + '%',
        draw: (1 / oddDraw / sumInversas * 100).toFixed(2) + '%',
        away: (1 / oddAway / sumInversas * 100).toFixed(2) + '%'
      }
    };
  }
  
  return { existe: false };
}

/**
 * Calcula el mejor odds promedio entre bookmakers
 */
export function mejorOdds(oddsArray) {
  if (!oddsArray || oddsArray.length === 0) return null;
  return Math.max(...oddsArray);
}

/**
 * Detecta line movement (movimiento de línea = dinero inteligente)
 * Positivo = baja a favor del favorite
 * Negativo = sube desfavorable
 */
export function detectarLineMovement(oddAntes, oddAhora) {
  const cambio = oddAhora - oddAntes;
  const porcentaje = ((cambio / oddAntes) * 100).toFixed(2);
  
  return {
    cambio: cambio.toFixed(4),
    porcentaje: porcentaje,
    direccion: cambio < 0 ? 'favorable' : 'desfavorable'
  };
}

/**
 * Scoring para apuestas - Combina múltiples factores
 * Retorna 0-100
 */
export function scoreApuesta(datos) {
  let score = 0;
  
  // EV (máx 30 puntos)
  if (datos.ev > 0.05) score += 30;
  else if (datos.ev > 0.02) score += 20;
  else if (datos.ev > 0) score += 10;
  
  // Line movement (máx 20 puntos)
  if (datos.lineMovement && datos.lineMovement.direccion === 'favorable') {
    score += parseInt(datos.lineMovement.porcentaje) > 2 ? 20 : 10;
  }
  
  // Diferencial de odds (máx 20 puntos)
  if (datos.diferencialOdds > 0.15) score += 20;
  else if (datos.diferencialOdds > 0.10) score += 15;
  else if (datos.diferencialOdds > 0.05) score += 10;
  
  // Forma (máx 20 puntos)
  if (datos.formaUltimos5 && datos.formaUltimos5.positivosPorcentaje > 0.7) score += 20;
  else if (datos.formaUltimos5 && datos.formaUltimos5.positivosPorcentaje > 0.5) score += 10;
  
  // Consenso casas (máx 10 puntos)
  if (datos.consensoCasas >= 3) score += 10;
  
  return Math.min(100, score);
}

/**
 * Calcula ROI esperado
 * ROI = ((Ganancia - Inversión) / Inversión) × 100
 */
export function calcularROIEsperado(apuestaUnidades, odds, probabilidad) {
  const gananciaEsperada = apuestaUnidades * odds * probabilidad;
  const pérdidaEsperada = apuestaUnidades * (1 - probabilidad);
  const gananciaNetaEsperada = gananciaEsperada - pérdidaEsperada;
  const roi = (gananciaNetaEsperada / apuestaUnidades) * 100;
  
  return roi.toFixed(2);
}

export default {
  calcularEV,
  kellyPercentage,
  calcularApuesta,
  calcularGananciaEsperada,
  probImplicita,
  detectarArbitraje,
  detectarArbTriple,
  mejorOdds,
  detectarLineMovement,
  scoreApuesta,
  calcularROIEsperado
};
