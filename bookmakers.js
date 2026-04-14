/**
 * Módulo de gestión de Bookmakers
 * Prioriza Doradobet y Bet365
 */

/**
 * Detecta si apuesta está disponible en bookmakers específicos
 */
export function detectarDisponibilidad(bookmakers, bookmarkersTarget = ['bet365', 'doradobet']) {
  if (!bookmakers || bookmakers.length === 0) {
    return {
      disponible: false,
      casas: []
    };
  }

  const casasEncontradas = bookmakers
    .filter(b => bookmarkersTarget.some(target => b.key.toLowerCase().includes(target)))
    .map(b => ({
      nombre: b.title || b.key,
      key: b.key
    }));

  return {
    disponible: casasEncontradas.length > 0,
    casas: casasEncontradas,
    cantidad: casasEncontradas.length
  };
}

/**
 * Obtiene mejores odds de bookmakers específicos
 */
export function mejoresOddsBookmakers(bookmakers, outcome, targetBookmakers = ['bet365', 'doradobet']) {
  if (!bookmakers || bookmakers.length === 0) return null;

  const oddsDisponibles = bookmakers
    .filter(b => targetBookmakers.some(target => b.key.toLowerCase().includes(target)))
    .map(b => {
      const h2h = b.markets?.find(m => m.key === 'h2h');
      if (!h2h || !h2h.outcomes) return null;

      const resultado = h2h.outcomes.find(o => o.name === outcome);
      if (!resultado) return null;

      return {
        bookmaker: b.title || b.key,
        key: b.key,
        odds: resultado.price,
        lastUpdate: b.last_update
      };
    })
    .filter(Boolean);

  if (oddsDisponibles.length === 0) return null;

  // Retornar el mejor (odds más alto)
  return oddsDisponibles.reduce((prev, current) => 
    (current.odds > prev.odds) ? current : prev
  );
}

/**
 * Compara odds entre casa principal y mercado general
 * Para detectar value
 */
export function analizarDiferencialPrincipal(mejorOddPrincipal, mejorOddMercado) {
  if (!mejorOddPrincipal || !mejorOddMercado) return null;

  const diferencia = mejorOddPrincipal - mejorOddMercado;
  const porcentaje = ((diferencia / mejorOddMercado) * 100).toFixed(2);

  return {
    diferencia: diferencia.toFixed(4),
    porcentaje: porcentaje,
    ventaja: diferencia > 0 ? 'favorable' : 'desfavorable',
    recomendacion: Math.abs(parseFloat(porcentaje)) > 2 ? 'apostar' : 'vigilar'
  };
}

/**
 * Obtiene disponibilidad y odds de todas las casas conocidas
 */
export function resumenDisponibilidad(bookmakers) {
  if (!bookmakers || bookmakers.length === 0) {
    return { total: 0, detalles: [] };
  }

  const detalles = bookmakers.map(b => {
    const h2h = b.markets?.find(m => m.key === 'h2h');
    const outcomes = h2h?.outcomes || [];
    
    return {
      nombre: b.title || b.key,
      key: b.key,
      cantidad_mercados: outcomes.length,
      actualizado: b.last_update
    };
  });

  return {
    total: bookmakers.length,
    detalles: detalles,
    bet365_disponible: detalles.some(d => d.key.toLowerCase().includes('bet365')),
    doradobet_disponible: detalles.some(d => d.key.toLowerCase().includes('doradobet'))
  };
}

/**
 * Scoring específico para Doradobet + Bet365
 * Bonifica si está en ambas casas
 */
export function scoreDisponibilidadPrincipal(disponibilidad) {
  let bonus = 0;

  if (disponibilidad.casas.length === 2) {
    bonus += 15; // Está en ambas = muy bueno
  } else if (disponibilidad.casas.length === 1) {
    bonus += 10; // Está en al menos una
  }

  return bonus;
}

export default {
  detectarDisponibilidad,
  mejoresOddsBookmakers,
  analizarDiferencialPrincipal,
  resumenDisponibilidad,
  scoreDisponibilidadPrincipal
};
