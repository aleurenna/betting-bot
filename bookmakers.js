/**
 * Módulo de Bookmakers - Personalizado
 * 
 * Casas del usuario: 1xBet, Betfair, Betway, Bet365, Doradobet
 * Casas disponibles en API: 1xBet, Betfair Exchange, Betway
 */

// Mapeo de casas del usuario → keys en The Odds API
export const MIS_CASAS = {
  'onexbet':        { nombre: '1xBet',           region: 'eu' },
  'betfair_ex_eu':  { nombre: 'Betfair Exchange', region: 'eu' },
  'betfair_ex_uk':  { nombre: 'Betfair Exchange', region: 'uk' },
  'betway':         { nombre: 'Betway',           region: 'uk' },
  // Bet365 y Doradobet no están en la API gratuita
};

const MIS_KEYS = Object.keys(MIS_CASAS);

/**
 * Filtra bookmakers del evento para solo las casas del usuario
 */
export function filtrarMisCasas(eventBookmakers) {
  if (!eventBookmakers || eventBookmakers.length === 0) return [];
  
  return eventBookmakers.filter(b => 
    MIS_KEYS.some(key => b.key.toLowerCase() === key)
  );
}

/**
 * Obtiene los mejores odds de MIS casas para un outcome
 * Retorna: { odds, bookmaker, key, nombre } o null
 */
export function mejorOddMisCasas(eventBookmakers, outcomeName) {
  if (!eventBookmakers || eventBookmakers.length === 0) return null;

  let mejor = null;

  for (const book of eventBookmakers) {
    const esMia = MIS_KEYS.some(key => book.key.toLowerCase() === key);
    if (!esMia) continue;

    const h2h = book.markets?.find(m => m.key === 'h2h');
    if (!h2h || !h2h.outcomes) continue;

    const outcome = h2h.outcomes.find(o => o.name === outcomeName);
    if (!outcome) continue;

    const info = MIS_CASAS[book.key.toLowerCase()];
    const entry = {
      odds: outcome.price,
      key: book.key,
      bookmaker: book.title || book.key,
      nombre: info?.nombre || book.title || book.key
    };

    if (!mejor || entry.odds > mejor.odds) {
      mejor = entry;
    }
  }

  return mejor;
}

/**
 * Detecta en cuáles de mis casas está disponible el evento
 */
export function detectarDisponibilidad(eventBookmakers) {
  if (!eventBookmakers || eventBookmakers.length === 0) {
    return { disponible: false, casas: [], cantidad: 0 };
  }

  const casasEncontradas = [];

  for (const book of eventBookmakers) {
    const info = MIS_CASAS[book.key.toLowerCase()];
    if (info) {
      casasEncontradas.push({
        nombre: info.nombre,
        key: book.key
      });
    }
  }

  return {
    disponible: casasEncontradas.length > 0,
    casas: casasEncontradas,
    cantidad: casasEncontradas.length
  };
}

/**
 * Scoring basado en disponibilidad en mis casas
 */
export function scoreDisponibilidadPrincipal(disponibilidad) {
  if (disponibilidad.cantidad >= 3) return 15;  // 3+ casas mías
  if (disponibilidad.cantidad === 2) return 10;  // 2 casas
  if (disponibilidad.cantidad === 1) return 5;   // 1 casa
  return 0; // ninguna de mis casas
}

/**
 * Compara odds de mis casas vs mercado general
 */
export function analizarVentajaMisCasas(mejorOddMia, mejorOddMercado) {
  if (!mejorOddMia || !mejorOddMercado) return null;

  const diferencia = mejorOddMia - mejorOddMercado;
  const porcentaje = ((diferencia / mejorOddMercado) * 100).toFixed(2);

  return {
    diferencia: diferencia.toFixed(4),
    porcentaje,
    ventaja: diferencia >= 0 ? 'favorable' : 'peor',
    mensaje: diferencia >= 0 
      ? `Mis odds son +${porcentaje}% vs mercado`
      : `Mercado tiene ${Math.abs(porcentaje)}% mejores odds`
  };
}

export default {
  MIS_CASAS,
  filtrarMisCasas,
  mejorOddMisCasas,
  detectarDisponibilidad,
  scoreDisponibilidadPrincipal,
  analizarVentajaMisCasas
};
