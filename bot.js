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

// Deportes disponibles según The Odds API - EXPANDIDOS
const SPORTS = [
  // FÚTBOL - Ligas Principales
  'soccer_epl',        // Premier League (Inglaterra)
  'soccer_la_liga',    // La Liga (España)
  'soccer_serie_a',    // Serie A (Italia)
  'soccer_bundesliga', // Bundesliga (Alemania)
  'soccer_ligue_1',    // Ligue 1 (Francia)
  
  // BASKETBALL
  'basketball_nba',       // NBA (USA)
  'basketball_euroleague', // Euroleague (Europa)
  
  // TENNIS
  'tennis_atp',        // ATP (Hombres)
  'tennis_wta'         // WTA (Mujeres)
];

// Regiones disponibles según The Odds API - TODAS LAS OPCIONES
const REGIONS = [
  'us',  // United States (DraftKings, FanDuel, Bet365, BetMGM)
  'uk',  // United Kingdom (Sky Bet, Ladbrokes, William Hill, Betfred)
  'eu',  // Europa (Betfair, Unibet, Bwin, 888sport, Pinnacle)
  'au'   // Australia (Sportsbet, TAB, Neds, Ladbrokes)
];

const MARKETS = ['h2h'];

let creditosRestantes = 500; // Simulado - obtener del header real

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
    
    let recomendaciones = [];
    
    // Por cada deporte
    for (const sport of SPORTS) {
      for (const region of REGIONS) {
        try {
          const odds = await obtenerOdds(sport, region);
          
          if (odds && odds.length > 0) {
            const analisis = await analizarOdds(odds, sport, region, bankroll, moneda);
            recomendaciones = [...recomendaciones, ...analisis];
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
    
    console.log(`\n✅ Encontradas ${buenasApuestas.length} apuestas con EV+`);
    
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
    
    console.log(`📊 ${sport} (${region}): ${creditosRestantes} créditos restantes`);
    
    return response.data;
    
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
    // Fútbol
    'soccer_epl': 'Premier League',
    'soccer_la_liga': 'La Liga',
    'soccer_serie_a': 'Serie A',
    'soccer_bundesliga': 'Bundesliga',
    'soccer_ligue_1': 'Ligue 1',
    
    // Basketball
    'basketball_nba': 'NBA',
    'basketball_euroleague': 'Euroleague',
    
    // Tennis
    'tennis_atp': 'ATP',
    'tennis_wta': 'WTA'
  };
  return ligas[sport] || sport;
}

export default {
  ejecutarBot,
  obtenerOdds,
  analizarOdds
};
