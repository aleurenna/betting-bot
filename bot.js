/**
 * BOT DE APUESTAS CON EV+ STRATEGY v2.0
 * 
 * Mejoras PRO:
 * 1. Regiones combinadas en una sola llamada API
 * 2. Pinnacle como referencia "sharp" para probabilidad real
 * 3. Límite de créditos por ejecución
 * 4. Scoring completo basado en datos reales
 */

import axios from 'axios';
import * as calc from './calculos.js';
import * as db from './database.js';
import * as bookmakers from './bookmakers.js';
import * as stats from './estadisticas.js';
import { enviarTelegram } from './telegram.js';
import dotenv from 'dotenv';

dotenv.config();

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const MAX_CREDITOS_RUN = parseInt(process.env.MAX_CREDITOS_RUN || '30');
let creditosUsadosRun = 0;
let creditosRestantes = 500;

// Bookmaker de referencia (el más sharp del mercado)
const SHARP_BOOKMAKER = 'pinnacle';
const SHARP_FALLBACKS = ['betfair_ex_eu', 'matchbook', 'betclic'];

// Deportes preferidos (se validan contra activos vía API gratis)
const PREFERRED_SPORTS = [
  'soccer_epl', 'soccer_spain_la_liga', 'soccer_italy_serie_a',
  'soccer_germany_bundesliga', 'soccer_france_ligue_one',
  'soccer_uefa_champs_league', 'soccer_uefa_europa_league',
  'soccer_usa_mls', 'soccer_mexico_ligamx', 'soccer_brazil_campeonato',
  'soccer_efl_champ', 'soccer_argentina_primera_division',
  'soccer_portugal_primeira_liga', 'soccer_netherlands_eredivisie',
  'basketball_nba', 'basketball_euroleague',
  'tennis_atp_aus_open_singles', 'tennis_atp_french_open',
  'tennis_atp_wimbledon', 'tennis_atp_us_open',
  'tennis_atp_indian_wells', 'tennis_atp_miami_open',
  'tennis_atp_monte_carlo_masters', 'tennis_atp_madrid_open',
  'tennis_atp_italian_open', 'tennis_atp_cincinnati_open',
  'tennis_atp_shanghai_masters', 'tennis_atp_canadian_open',
  'tennis_wta_french_open', 'tennis_wta_wimbledon', 'tennis_wta_us_open',
  'tennis_wta_madrid_open', 'tennis_wta_italian_open',
  'baseball_mlb'
];

// Filtros de calidad
const ODDS_MIN = parseFloat(process.env.ODDS_MIN || '1.80');
const ODDS_MAX = parseFloat(process.env.ODDS_MAX || '7.00');
const MIN_BOOKMAKERS = parseInt(process.env.MIN_BOOKMAKERS || '8');

// Regiones: eu (1xBet, Betfair, Pinnacle), uk (Betway, Betfair)
const REGIONS_STRING = process.env.REGIONS || 'eu,uk';

// ─────────────────────────────────────────────
// FUNCIÓN PRINCIPAL
// ─────────────────────────────────────────────

export async function ejecutarBot() {
  console.log('🤖 Iniciando análisis de apuestas v2.0...');
  console.log(`⏰ ${new Date().toISOString()}`);
  creditosUsadosRun = 0;
  
  try {
    await db.inicializarDB();
    
    const bankroll = parseFloat(process.env.BANKROLL_INICIAL || '20');
    const moneda = process.env.MONEDA || 'USD';
    const simbolo = moneda === 'CRC' ? '₡' : '$';
    
    console.log(`💰 Bankroll: ${simbolo}${bankroll.toFixed(2)} ${moneda}`);
    console.log(`🔒 Límite créditos esta ejecución: ${MAX_CREDITOS_RUN}`);
    
    // Deportes activos (GRATIS)
    const SPORTS = await obtenerDeportesActivos();
    if (SPORTS.length === 0) {
      console.log('⚠️ No hay deportes activos');
      return [];
    }
    
    // Regiones combinadas = 1 call por deporte en vez de N
    const numRegiones = REGIONS_STRING.split(',').length;
    console.log(`📋 ${SPORTS.length} deportes × ${numRegiones} regiones (1 call/deporte) = ~${SPORTS.length * numRegiones} créditos`);
    
    const eventosRecientes = await db.obtenerEventosRecientes(3);
    console.log(`📋 Eventos recientes (anti-duplicados): ${eventosRecientes.length}`);
    
    let recomendaciones = [];
    let todosLosOdds = []; // Para CLV tracking
    
    for (const sport of SPORTS) {
      if (creditosUsadosRun >= MAX_CREDITOS_RUN) {
        console.log(`🔒 Límite de créditos alcanzado (${creditosUsadosRun}/${MAX_CREDITOS_RUN}). Deteniendo.`);
        break;
      }
      
      try {
        const odds = await obtenerOdds(sport);
        
        if (odds && odds.length > 0) {
          todosLosOdds = [...todosLosOdds, ...odds];
          
          const oddsNoRepetidos = odds.filter(evento => {
            return !eventosRecientes.some(prev => 
              prev.evento === `${evento.home_team} vs ${evento.away_team}` &&
              new Date(prev.fecha_evento).getDate() === new Date(evento.commence_time).getDate()
            );
          });
          
          if (oddsNoRepetidos.length > 0) {
            const analisis = analizarOdds(oddsNoRepetidos, sport, bankroll, moneda);
            recomendaciones = [...recomendaciones, ...analisis];
          }
        }
      } catch (error) {
        console.error(`❌ Error en ${sport}:`, error.message);
      }
    }
    
    // Filtrar EV+ y score alto, ordenar por fecha → score
    const buenasApuestas = recomendaciones
      .filter(r => r.ev > 0.02 && r.score > 50)
      .sort((a, b) => {
        const fechaA = new Date(a.fechaEvento).getTime();
        const fechaB = new Date(b.fechaEvento).getTime();
        if (fechaA !== fechaB) return fechaA - fechaB; // más pronto primero
        return b.score - a.score; // mismo día: mejor score primero
      })
      .slice(0, 10);
    
    console.log(`✅ Apuestas EV+ encontradas: ${buenasApuestas.length}`);
    console.log(`💳 Créditos odds usados: ${creditosUsadosRun}`);
    
    // Enriquecer con estadísticas de API-Football (solo fútbol)
    if (buenasApuestas.length > 0 && process.env.FOOTBALL_API_KEY) {
      console.log('\n📊 Enriqueciendo con estadísticas...');
      for (const apuesta of buenasApuestas) {
        if (!stats.deporteSoportado(apuesta.deporte)) continue;
        
        // Extraer equipos del evento "TeamA vs TeamB"
        const [homeTeam, awayTeam] = apuesta.evento.split(' vs ').map(s => s.trim());
        if (!homeTeam || !awayTeam) continue;
        
        const estadisticas = await stats.obtenerEstadisticas(homeTeam, awayTeam, apuesta.equipo);
        if (estadisticas) {
          // Ajustar score con bonus de stats
          const bonus = stats.calcularBonusStats(estadisticas);
          const scoreAntes = parseInt(apuesta.score);
          apuesta.score = Math.max(0, Math.min(100, scoreAntes + bonus)).toFixed(0);
          apuesta.estadisticas = estadisticas;
          
          if (bonus !== 0) {
            console.log(`   ${apuesta.equipo}: score ${scoreAntes} → ${apuesta.score} (${bonus > 0 ? '+' : ''}${bonus} stats)`);
          }
        }
      }
      console.log(`📊 Stats requests usados: ${stats.getRequestsUsados()}`);
      
      // Re-ordenar por score actualizado
      buenasApuestas.sort((a, b) => {
        const fechaA = new Date(a.fechaEvento).getTime();
        const fechaB = new Date(b.fechaEvento).getTime();
        if (fechaA !== fechaB) return fechaA - fechaB;
        return parseInt(b.score) - parseInt(a.score);
      });
    }
    
    // Guardar en BD
    for (const apuesta of buenasApuestas) {
      await db.guardarPrediccion({
        deporte: apuesta.deporte,
        liga: apuesta.liga,
        evento: apuesta.evento,
        equipoJugador: apuesta.equipo,
        tipoApuesta: apuesta.tipo,
        odds: apuesta.odds,
        probabilidad: apuesta.probabilidad,
        ev: apuesta.ev,
        kelly: apuesta.kelly,
        score: apuesta.score,
        bookmaker: apuesta.mejorBookmaker,
        fechaEvento: apuesta.fechaEvento
      });
    }
    
    if (buenasApuestas.length > 0) {
      await enviarTelegram(buenasApuestas, bankroll, moneda);
    }
    
    // Retornar picks + odds raw (para CLV tracking en index.js)
    return { picks: buenasApuestas, oddsData: todosLosOdds };
    
  } catch (error) {
    console.error('❌ Error en bot:', error);
    await enviarTelegram([{ error: true, mensaje: `Error en bot: ${error.message}` }]);
  }
}

// ─────────────────────────────────────────────
// API CALLS
// ─────────────────────────────────────────────

/**
 * Obtiene deportes activos (GRATIS, 0 créditos)
 */
async function obtenerDeportesActivos() {
  try {
    const response = await axios.get('https://api.the-odds-api.com/v4/sports', {
      params: { apiKey: ODDS_API_KEY },
      timeout: 10000
    });

    const activos = response.data
      .filter(s => s.active && !s.has_outrights)
      .map(s => s.key);

    // Validar env override contra activos
    if (process.env.SPORTS) {
      const envSports = process.env.SPORTS.split(',').map(s => s.trim());
      const envActivos = envSports.filter(s => activos.includes(s));
      if (envActivos.length > 0) {
        console.log(`🌐 Deportes (env override): ${envActivos.join(', ')}`);
        return envActivos;
      }
    }

    const deportes = PREFERRED_SPORTS.filter(s => activos.includes(s));
    console.log(`🌐 Deportes activos: ${deportes.length}/${activos.length} total`);
    deportes.forEach(d => console.log(`   ✓ ${d}`));
    return deportes;

  } catch (error) {
    console.error('⚠️ Error obteniendo deportes activos:', error.message);
    return ['soccer_epl', 'soccer_spain_la_liga', 'basketball_nba'];
  }
}

/**
 * MEJORA #1: Obtiene odds con TODAS las regiones en UNA llamada
 * Antes: 1 call por deporte × región. Ahora: 1 call por deporte.
 */
async function obtenerOdds(sport) {
  try {
    const response = await axios.get(`https://api.the-odds-api.com/v4/sports/${sport}/odds`, {
      params: {
        apiKey: ODDS_API_KEY,
        regions: REGIONS_STRING,  // "eu,us" en una sola llamada
        markets: 'h2h',
        oddsFormat: 'decimal'
      },
      timeout: 10000
    });
    
    // Registrar créditos reales del header
    const creditosUsados = parseInt(response.headers['x-requests-used'] || 0);
    creditosRestantes = parseInt(response.headers['x-requests-remaining'] || 500);
    const costeLlamada = REGIONS_STRING.split(',').length; // 1 crédito por región
    creditosUsadosRun += costeLlamada;
    
    await db.registrarUsoCréditos(costeLlamada, 'odds', sport, REGIONS_STRING, true);
    
    // Filtrar próximos 3 días
    const limite = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const eventos = response.data.filter(e => new Date(e.commence_time) <= limite);
    
    console.log(`📊 ${sport}: ${eventos.length}/${response.data.length} eventos (3 días) | créditos: ${creditosUsadosRun}/${MAX_CREDITOS_RUN} run, ${creditosRestantes} restantes`);
    
    return eventos;
    
  } catch (error) {
    if (error.response?.status === 404) {
      console.log(`⚠️ ${sport}: no disponible (404)`);
    } else {
      console.error(`❌ Error odds ${sport}:`, error.message);
    }
    creditosUsadosRun += 1;
    await db.registrarUsoCréditos(1, 'odds', sport, REGIONS_STRING, false);
    return null;
  }
}

// ─────────────────────────────────────────────
// ANÁLISIS CON PINNACLE
// ─────────────────────────────────────────────

/**
 * MEJORA #2: Extrae odds de Pinnacle (o sharp fallback) para un outcome
 * Pinnacle es el bookmaker más sharp - sus odds reflejan la probabilidad "real"
 */
function extraerOddsSharp(eventBookmakers, outcomeName) {
  const sharpBooks = [SHARP_BOOKMAKER, ...SHARP_FALLBACKS];
  
  for (const sharpKey of sharpBooks) {
    const book = eventBookmakers.find(b => b.key.toLowerCase().includes(sharpKey));
    if (!book) continue;
    
    const h2h = book.markets?.find(m => m.key === 'h2h');
    if (!h2h || !h2h.outcomes) continue;
    
    const outcome = h2h.outcomes.find(o => o.name === outcomeName);
    if (outcome) {
      return { odds: outcome.price, bookmaker: book.key, source: 'sharp' };
    }
  }
  
  return null;
}

/**
 * Calcula probabilidad "real" desde Pinnacle odds (removiendo margen)
 * Pinnacle tiene ~2-3% de margen. Lo removemos para estimar la prob real.
 */
function calcularProbReal(eventBookmakers, outcomeName, allOutcomeNames) {
  const sharpData = extraerOddsSharp(eventBookmakers, outcomeName);
  
  if (sharpData) {
    // Obtener todos los outcomes de Pinnacle para calcular margen
    const sharpBooks = [SHARP_BOOKMAKER, ...SHARP_FALLBACKS];
    let pinnacleBook = null;
    
    for (const key of sharpBooks) {
      pinnacleBook = eventBookmakers.find(b => b.key.toLowerCase().includes(key));
      if (pinnacleBook) break;
    }
    
    if (pinnacleBook) {
      const h2h = pinnacleBook.markets?.find(m => m.key === 'h2h');
      if (h2h && h2h.outcomes) {
        // Suma de probabilidades implícitas = 1 + margen
        const sumaImplicita = h2h.outcomes.reduce((sum, o) => sum + (1 / o.price), 0);
        // Probabilidad real = implícita / suma (remueve margen)
        const probReal = (1 / sharpData.odds) / sumaImplicita;
        return { probabilidad: probReal, fuente: `sharp:${sharpData.bookmaker}`, margen: ((sumaImplicita - 1) * 100).toFixed(2) };
      }
    }
    
    // Si no podemos calcular margen, usar implícita directa
    return { probabilidad: 1 / sharpData.odds, fuente: `sharp:${sharpData.bookmaker}`, margen: 'N/A' };
  }
  
  // Fallback: mediana de todos los bookmakers (más robusto que promedio)
  return null;
}

/**
 * Analiza odds de un evento completo
 */
function analizarOdds(oddsData, sport, bankroll, moneda) {
  const recomendaciones = [];
  
  for (const evento of oddsData) {
    const { home_team, away_team, commence_time, bookmakers: eventBookmakers } = evento;
    if (!eventBookmakers || eventBookmakers.length < 2) continue;
    
    // Recolectar TODOS los odds por outcome, con info de bookmaker
    const oddsDetallados = { home: [], away: [], draw: [] };
    
    for (const book of eventBookmakers) {
      const h2h = book.markets?.find(m => m.key === 'h2h');
      if (!h2h || !h2h.outcomes) continue;
      
      h2h.outcomes.forEach(outcome => {
        const entry = { odds: outcome.price, bookmaker: book.key, title: book.title || book.key };
        if (outcome.name === home_team) oddsDetallados.home.push(entry);
        else if (outcome.name === away_team) oddsDetallados.away.push(entry);
        else if (outcome.name === 'Draw') oddsDetallados.draw.push(entry);
      });
    }
    
    const allOutcomes = [home_team, away_team];
    if (sport.includes('soccer')) allOutcomes.push('Draw');
    
    // Analizar cada outcome
    const outcomes = [
      { equipo: home_team, tipo: 'h2h_home', data: oddsDetallados.home },
      { equipo: away_team, tipo: 'h2h_away', data: oddsDetallados.away }
    ];
    
    if (sport.includes('soccer') && oddsDetallados.draw.length > 0) {
      outcomes.push({ equipo: 'Draw', tipo: 'h2h_draw', data: oddsDetallados.draw });
    }
    
    for (const { equipo, tipo, data } of outcomes) {
      if (data.length < 2) continue;
      
      const resultado = analizarOutcome({
        evento: `${home_team} vs ${away_team}`,
        equipo, tipo, deporte: sport,
        liga: obtenerLiga(sport),
        fechaEvento: commence_time,
        oddsDetallados: data,
        eventBookmakers,
        allOutcomeNames: allOutcomes
      }, bankroll, moneda);
      
      if (resultado) recomendaciones.push(resultado);
    }
  }
  
  return recomendaciones;
}

/**
 * Analiza un outcome: prob real de Pinnacle, EV contra MIS casas
 */
function analizarOutcome(data, bankroll, moneda) {
  const { evento, equipo, tipo, deporte, liga, fechaEvento, oddsDetallados, eventBookmakers, allOutcomeNames } = data;
  
  const oddsArray = oddsDetallados.map(d => d.odds);
  const oddPromedio = oddsArray.reduce((a, b) => a + b, 0) / oddsArray.length;
  
  // Mejor odds de MIS casas (donde puedo apostar)
  const miMejorOdd = bookmakers.mejorOddMisCasas(eventBookmakers, equipo);
  
  // Si ninguna de mis casas tiene este evento, skip
  if (!miMejorOdd) return null;
  
  // FILTROS DE CALIDAD
  if (miMejorOdd.odds < ODDS_MIN || miMejorOdd.odds > ODDS_MAX) return null;
  if (oddsArray.length < MIN_BOOKMAKERS) return null;
  
  // Mejor odds del mercado general (para referencia)
  const mejorOddMercado = Math.max(...oddsArray);
  
  // Probabilidad real desde Pinnacle (o mediana como fallback)
  const probData = calcularProbReal(eventBookmakers, equipo, allOutcomeNames);
  
  let probabilidad, fuenteProb;
  if (probData) {
    probabilidad = probData.probabilidad;
    fuenteProb = probData.fuente;
  } else {
    const sorted = [...oddsArray].sort((a, b) => a - b);
    const mediana = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];
    probabilidad = 1 / mediana;
    fuenteProb = 'mediana';
  }
  
  // EV calculado contra MIS odds (no las del mercado general)
  const ev = calc.calcularEV(probabilidad, miMejorOdd.odds);
  if (ev <= 0.02) return null;
  
  const kelly = calc.kellyPercentage(probabilidad, miMejorOdd.odds);
  const diferencialOdds = (miMejorOdd.odds - oddPromedio) / oddPromedio;
  
  // Apuesta calculada con MIS odds
  const monedaMinima = moneda === 'CRC' ? 100 : 1;
  const apuestaInfo = calc.calcularApuesta(bankroll, probabilidad, miMejorOdd.odds, monedaMinima, 0.05);
  
  // Disponibilidad en mis casas
  const disponibilidad = bookmakers.detectarDisponibilidad(eventBookmakers);
  
  // Scoring
  const tieneSharp = fuenteProb.startsWith('sharp');
  const spreadOdds = mejorOddMercado - Math.min(...oddsArray);
  
  let score = calcularScorePro({
    ev,
    diferencialOdds,
    consensoCasas: oddsArray.length,
    tieneSharp,
    casasConMejorOdd: disponibilidad.cantidad,
    spreadOdds,
    probabilidad
  });
  
  score += bookmakers.scoreDisponibilidadPrincipal(disponibilidad);
  
  return {
    evento, equipo, tipo, deporte, liga, fechaEvento,
    odds: miMejorOdd.odds,             // Odds de MI mejor casa
    oddPromedio,
    mejorOddMercado,                    // Para referencia
    mejorBookmaker: miMejorOdd.nombre,  // Dónde apostar
    probabilidad: (probabilidad * 100).toFixed(2),
    ev: (ev * 100).toFixed(2),
    kelly: (kelly * 100).toFixed(2),
    apuesta: apuestaInfo.cantidad,
    moneda,
    riesgoNivel: apuestaInfo.riesgo_nivel,
    gananciaSiGana: (apuestaInfo.cantidad * (miMejorOdd.odds - 1)).toFixed(2),
    pérdidaSiPierde: (-apuestaInfo.cantidad).toFixed(2),
    score: score.toFixed(0),
    diferencialOdds: (diferencialOdds * 100).toFixed(2),
    consensoCasas: oddsArray.length,
    fuenteProbabilidad: fuenteProb,
    disponibleEnPrincipales: disponibilidad.disponible,
    casasPrincipales: disponibilidad.casas,
    cantidadCasasPrincipales: disponibilidad.cantidad
  };
}

// ─────────────────────────────────────────────
// MEJORA #4: SCORING PRO
// ─────────────────────────────────────────────

/**
 * Scoring mejorado - usa solo datos reales, sin campos fantasma
 * 
 * EV (0-30):           Edge matemático
 * Sharp confirm (0-20): Pinnacle confirma la línea
 * Diferencial (0-15):   Odds mejores vs mercado
 * Consenso (0-15):      Cantidad de casas coinciden
 * Spread bajo (0-10):   Mercado no disperso = más confiable
 * Probabilidad (0-10):  Favoritos moderados > extremos
 */
function calcularScorePro(datos) {
  let score = 0;
  
  // EV (máx 30)
  if (datos.ev > 0.08) score += 30;
  else if (datos.ev > 0.05) score += 25;
  else if (datos.ev > 0.03) score += 20;
  else if (datos.ev > 0.02) score += 15;
  
  // Sharp confirmation (máx 20) - NUEVO
  if (datos.tieneSharp) {
    score += 20; // Pinnacle confirma = señal fuerte
  }
  
  // Diferencial de odds vs mercado (máx 15)
  if (datos.diferencialOdds > 0.10) score += 15;
  else if (datos.diferencialOdds > 0.05) score += 10;
  else if (datos.diferencialOdds > 0.02) score += 5;
  
  // Consenso - cantidad de casas (máx 15)
  if (datos.consensoCasas >= 8) score += 15;
  else if (datos.consensoCasas >= 5) score += 10;
  else if (datos.consensoCasas >= 3) score += 5;
  
  // Spread bajo = mercado estable (máx 10) - NUEVO
  if (datos.spreadOdds < 0.10) score += 10;
  else if (datos.spreadOdds < 0.20) score += 5;
  
  // Probabilidad en rango óptimo 40-70% (máx 10) - NUEVO
  if (datos.probabilidad >= 0.40 && datos.probabilidad <= 0.70) score += 10;
  else if (datos.probabilidad >= 0.30 && datos.probabilidad <= 0.80) score += 5;
  
  return Math.min(100, score);
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function obtenerLiga(sport) {
  const ligas = {
    'soccer_epl': 'Premier League', 'soccer_spain_la_liga': 'La Liga',
    'soccer_italy_serie_a': 'Serie A', 'soccer_germany_bundesliga': 'Bundesliga',
    'soccer_france_ligue_one': 'Ligue 1', 'soccer_uefa_champs_league': 'Champions League',
    'soccer_uefa_europa_league': 'Europa League', 'soccer_usa_mls': 'MLS',
    'soccer_mexico_ligamx': 'Liga MX', 'soccer_brazil_campeonato': 'Brasileirão',
    'soccer_efl_champ': 'EFL Championship', 'soccer_argentina_primera_division': 'Liga Argentina',
    'soccer_portugal_primeira_liga': 'Primeira Liga', 'soccer_netherlands_eredivisie': 'Eredivisie',
    'basketball_nba': 'NBA', 'basketball_euroleague': 'Euroleague', 'baseball_mlb': 'MLB'
  };
  if (sport.includes('tennis')) {
    return sport.replace('tennis_atp_', 'ATP ').replace('tennis_wta_', 'WTA ')
      .replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  return ligas[sport] || sport;
}

export default { ejecutarBot };
