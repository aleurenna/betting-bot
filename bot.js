/**
 * BOT DE APUESTAS CON EV+ STRATEGY
 * Integra The Odds API + datos estadísticos gratuitos
 */

import axios from 'axios';
import * as calc from './calculos.js';
import * as db from './database.js';
import * as bookmakers from './bookmakers.js';
import { enviarTelegram } from './telegram.js';
import dotenv from 'dotenv';

dotenv.config();

const ODDS_API_KEY = process.env.ODDS_API_KEY;

// Deportes preferidos (se filtran contra los activos en la API)
const PREFERRED_SPORTS = [
  // Fútbol
  'soccer_epl', 'soccer_spain_la_liga', 'soccer_italy_serie_a',
  'soccer_germany_bundesliga', 'soccer_france_ligue_one',
  'soccer_uefa_champs_league', 'soccer_uefa_europa_league',
  'soccer_usa_mls', 'soccer_mexico_ligamx', 'soccer_brazil_campeonato',
  // Basketball
  'basketball_nba', 'basketball_euroleague',
  // Tennis (torneos específicos - se detectan automáticamente)
  'tennis_atp_aus_open_singles', 'tennis_atp_french_open',
  'tennis_atp_wimbledon', 'tennis_atp_us_open',
  'tennis_atp_indian_wells', 'tennis_atp_miami_open',
  'tennis_atp_monte_carlo_masters', 'tennis_atp_madrid_open',
  'tennis_atp_italian_open', 'tennis_atp_cincinnati_open',
  'tennis_atp_shanghai_masters', 'tennis_atp_canadian_open',
  'tennis_wta_french_open', 'tennis_wta_wimbledon', 'tennis_wta_us_open',
  'tennis_wta_madrid_open', 'tennis_wta_italian_open',
  // MLB (en temporada)
  'baseball_mlb'
];

// Regiones
const DEFAULT_REGIONS = 'eu,us';
const REGIONS = (process.env.REGIONS || DEFAULT_REGIONS).split(',').map(s => s.trim()).filter(Boolean);

const MARKETS = ['h2h'];
let creditosRestantes = 500;

/**
 * Obtiene deportes activos desde la API (GRATIS, no consume créditos)
 */
async function obtenerDeportesActivos() {
  try {
    const url = 'https://api.the-odds-api.com/v4/sports';
    const response = await axios.get(url, {
      params: { apiKey: ODDS_API_KEY },
      timeout: 10000
    });

    const activos = response.data
      .filter(s => s.active && !s.has_outrights)
      .map(s => s.key);

    // Filtrar solo los preferidos que están activos
    const deportesAUsar = PREFERRED_SPORTS.filter(s => activos.includes(s));

    // Si hay env override, usarlo pero validar contra activos
    if (process.env.SPORTS) {
      const envSports = process.env.SPORTS.split(',').map(s => s.trim());
      const envActivos = envSports.filter(s => activos.includes(s));
      if (envActivos.length > 0) return envActivos;
    }

    console.log(`🌐 Deportes activos encontrados: ${deportesAUsar.length}/${activos.length} total`);
    console.log(`   → ${deportesAUsar.join(', ')}`);
    return deportesAUsar;

  } catch (error) {
    console.error('⚠️ Error obteniendo deportes activos:', error.message);
    // Fallback a deportes seguros
    return ['soccer_epl', 'soccer_spain_la_liga', 'basketball_nba'];
  }
}

/**
 * Función principal - Ejecuta análisis de apuestas
 */
export async function ejecutarBot() {
  console.log('🤖 Iniciando análisis de apuestas...');
  console.log(`⏰ ${new Date().toISOString()}`);
  
  try {
    await db.inicializarDB();
    
    // Obtener configuración
    const bankroll = parseFloat(process.env.BANKROLL_INICIAL || '20');
    const moneda = process.env.MONEDA || 'USD';
    const simboloMoneda = moneda === 'CRC' ? '₡' : '$';
    
    console.log(`💰 Bankroll: ${simboloMoneda}${bankroll.toFixed(2)} ${moneda}`);
    
    // Obtener deportes activos (GRATIS)
    const SPORTS = await obtenerDeportesActivos();
    
    if (SPORTS.length === 0) {
      console.log('⚠️ No hay deportes activos en este momento');
      return [];
    }
    
    const creditosEstimados = SPORTS.length * REGIONS.length;
    console.log(`📋 Config: ${SPORTS.length} deportes × ${REGIONS.length} regiones = ~${creditosEstimados} créditos`);
    
    // Obtener eventos ya recomendados para evitar duplicados
    const eventosRecientes = await db.obtenerEventosRecientes(3);
    console.log(`📋 Eventos recientes para evitar duplicados: ${eventosRecientes.length}`);
    
    let recomendaciones = [];
    
    // Por cada deporte
    for (const sport of SPORTS) {
      for (const region of REGIONS) {
        try {
          const odds = await obtenerOdds(sport, region);
          
          if (odds && odds.length > 0) {
            // Filtrar eventos que ya fueron recomendados
            const oddsNoRepetidos = odds.filter(evento => {
              return !eventosRecientes.some(prev => 
                prev.evento === `${evento.home_team} vs ${evento.away_team}` &&
                new Date(prev.fecha_evento).getDate() === new Date(evento.commence_time).getDate()
              );
            });
            
            if (oddsNoRepetidos.length > 0) {
              const analisis = await analizarOdds(oddsNoRepetidos, sport, region, bankroll, moneda);
              recomendaciones = [...recomendaciones, ...analisis];
            }
          }
        } catch (error) {
          console.error(`❌ Error en ${sport} - ${region}:`, error.message);
        }
      }
    }
    
    // Filtrar por EV positivo y score alto
    const buenasApuestas = recomendaciones
      .filter(r => r.ev > 0.02 && r.score > 50)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10); // Top 10
    
    console.log(`✅ Nuevas apuestas encontradas (sin repetidos): ${buenasApuestas.length}`);
    
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
        fechaEvento: apuesta.fechaEvento
      });
    }
    
    // Enviar a Telegram
    if (buenasApuestas.length > 0) {
      await enviarTelegram(buenasApuestas, bankroll, moneda);
    }
    
    return buenasApuestas;
    
  } catch (error) {
    console.error('❌ Error en bot:', error);
    await enviarTelegram([{ 
      error: true, 
      mensaje: `Error en bot: ${error.message}` 
    }]);
  }
}

/**
 * Obtiene odds de The Odds API
 * Nota: API retorna eventos live + próximos (sin filtro específico de días)
 * Filtramos en la BD para evitar eventos muy lejanos
 */
async function obtenerOdds(sport, region) {
  try {
    const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds`;
    
    const response = await axios.get(url, {
      params: {
        apiKey: ODDS_API_KEY,
        regions: region,
        markets: MARKETS.join(','),
        oddsFormat: 'decimal'
      },
      timeout: 10000
    });
    
    // Registrar uso de créditos
    const creditosUsados = parseInt(response.headers['x-requests-last'] || 1);
    creditosRestantes = parseInt(response.headers['x-requests-remaining'] || 500);
    
    await db.registrarUsoCréditos(creditosUsados, 'odds', sport, region, true);
    
    // Filtrar eventos a próximos 3 días
    const ahora = new Date();
    const hace3Dias = new Date(ahora.getTime() + 3 * 24 * 60 * 60 * 1000);
    
    const eventosFiltrados = response.data.filter(evento => {
      const fechaEvento = new Date(evento.commence_time);
      return fechaEvento <= hace3Dias;
    });
    
    console.log(`📊 ${sport} (${region}): ${eventosFiltrados.length}/${response.data.length} eventos en próximos 3 días | ${creditosRestantes} créditos`);
    
    return eventosFiltrados;
    
  } catch (error) {
    console.error(`❌ Error obteniendo odds para ${sport}:`, error.message);
    await db.registrarUsoCréditos(1, 'odds', sport, region, false);
    return null;
  }
}

/**
 * Analiza odds y genera recomendaciones
 */
async function analizarOdds(oddsData, sport, region, bankroll, moneda) {
  const recomendaciones = [];
  
  for (const evento of oddsData) {
    const { home_team, away_team, commence_time, bookmakers: eventBookmakers } = evento;
    
    if (!eventBookmakers || eventBookmakers.length === 0) continue;
    
    // Extraer odds h2h
    const h2hOdds = new Map();
    const todosOdds = { home: [], away: [], draw: [] };
    
    for (const book of eventBookmakers) {
      const h2h = book.markets?.find(m => m.key === 'h2h');
      if (h2h && h2h.outcomes) {
        h2hOdds.set(book.key, h2h.outcomes);
        
        h2h.outcomes.forEach(outcome => {
          if (outcome.name === home_team) todosOdds.home.push(outcome.price);
          else if (outcome.name === away_team) todosOdds.away.push(outcome.price);
          else if (outcome.name === 'Draw') todosOdds.draw.push(outcome.price);
        });
      }
    }
    
    // Analizar Home, Away y Draw
    analizarOutcome(
      {
        evento: `${home_team} vs ${away_team}`,
        equipo: home_team,
        tipo: 'h2h_home',
        deporte: sport,
        liga: obtenerLiga(sport),
        fechaEvento: commence_time,
        oddsArray: todosOdds.home,
        bookmarkersData: eventBookmakers
      },
      recomendaciones,
      bankroll,
      moneda
    );
    
    analizarOutcome(
      {
        evento: `${home_team} vs ${away_team}`,
        equipo: away_team,
        tipo: 'h2h_away',
        deporte: sport,
        liga: obtenerLiga(sport),
        fechaEvento: commence_time,
        oddsArray: todosOdds.away,
        bookmarkersData: eventBookmakers
      },
      recomendaciones,
      bankroll,
      moneda
    );
    
    if (sport.includes('soccer') && todosOdds.draw.length > 0) {
      analizarOutcome(
        {
          evento: `${home_team} vs ${away_team}`,
          equipo: 'Draw',
          tipo: 'h2h_draw',
          deporte: sport,
          liga: obtenerLiga(sport),
          fechaEvento: commence_time,
          oddsArray: todosOdds.draw,
          bookmarkersData: eventBookmakers
        },
        recomendaciones,
        bankroll,
        moneda
      );
    }
  }
  
  return recomendaciones;
}

/**
 * Analiza un outcome específico
 */
function analizarOutcome(data, recomendaciones, bankroll, moneda) {
  const { evento, equipo, tipo, deporte, liga, fechaEvento, oddsArray, bookmarkersData } = data;
  
  if (!oddsArray || oddsArray.length === 0) return;
  
  const mejorOdd = Math.max(...oddsArray);
  const oddPromedio = oddsArray.reduce((a, b) => a + b, 0) / oddsArray.length;
  const probabilidad = calc.probImplicita(oddPromedio);
  
  // Calcular EV usando probabilidad estimada (por ahora = implícita)
  const ev = calc.calcularEV(probabilidad, mejorOdd);
  
  // Solo considerar si EV > 2%
  if (ev <= 0.02) return;
  
  const kelly = calc.kellyPercentage(probabilidad, mejorOdd);
  const diferencialOdds = (mejorOdd - oddPromedio) / oddPromedio;
  
  // Calcular cantidad a apostar
  const monedaMinima = moneda === 'CRC' ? 100 : 1;
  const apuestaInfo = calc.calcularApuesta(bankroll, probabilidad, mejorOdd, monedaMinima, 0.05);
  
  // Detectar disponibilidad en Doradobet + Bet365
  const disponibilidad = bookmakers.detectarDisponibilidad(bookmarkersData);
  
  let score = calc.scoreApuesta({
    ev,
    diferencialOdds,
    consensoCasas: oddsArray.length
  });
  
  // Bonus si está en ambas casas principales
  score += bookmakers.scoreDisponibilidadPrincipal(disponibilidad);
  
  recomendaciones.push({
    evento,
    equipo,
    tipo,
    deporte,
    liga,
    fechaEvento,
    odds: mejorOdd,
    oddPromedio,
    probabilidad: (probabilidad * 100).toFixed(2),
    ev: (ev * 100).toFixed(2),
    kelly: (kelly * 100).toFixed(2),
    apuesta: apuestaInfo.cantidad,
    moneda: moneda,
    riesgoNivel: apuestaInfo.riesgo_nivel,
    gananciaSiGana: (apuestaInfo.cantidad * (mejorOdd - 1)).toFixed(2),
    pérdidaSiPierde: (-apuestaInfo.cantidad).toFixed(2),
    score: score.toFixed(0),
    diferencialOdds: (diferencialOdds * 100).toFixed(2),
    consensoCasas: oddsArray.length,
    // Nuevos campos
    disponibleEnPrincipales: disponibilidad.disponible,
    casasPrincipales: disponibilidad.casas,
    cantidadCasasPrincipales: disponibilidad.cantidad
  });
}

/**
 * Helper - obtener nombre de liga
 */
function obtenerLiga(sport) {
  const ligas = {
    'soccer_epl': 'Premier League',
    'soccer_spain_la_liga': 'La Liga',
    'soccer_italy_serie_a': 'Serie A',
    'soccer_germany_bundesliga': 'Bundesliga',
    'soccer_france_ligue_one': 'Ligue 1',
    'soccer_uefa_champs_league': 'Champions League',
    'soccer_uefa_europa_league': 'Europa League',
    'soccer_usa_mls': 'MLS',
    'soccer_mexico_ligamx': 'Liga MX',
    'soccer_brazil_campeonato': 'Brasileirão',
    'soccer_efl_champ': 'EFL Championship',
    'soccer_argentina_primera_division': 'Liga Argentina',
    'soccer_portugal_primeira_liga': 'Primeira Liga',
    'soccer_netherlands_eredivisie': 'Eredivisie',
    'basketball_nba': 'NBA',
    'basketball_euroleague': 'Euroleague',
    'baseball_mlb': 'MLB'
  };
  // Para tennis, extraer nombre del torneo
  if (sport.includes('tennis')) {
    return sport.replace('tennis_atp_', 'ATP ').replace('tennis_wta_', 'WTA ')
      .replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  return ligas[sport] || sport;
}

export default {
  ejecutarBot,
  obtenerOdds,
  analizarOdds
};
