/**
 * Módulo de Estadísticas - API-Football
 * https://api-sports.io/documentation/football/v3
 * 
 * Plan gratis: 100 requests/día
 * Endpoints usados:
 *   /teams?search={name}      → buscar team ID
 *   /predictions?fixture={id} → forma, H2H, predicción (1 call)
 *   /fixtures?h2h={t1}-{t2}   → head to head directo
 *   /teams/statistics          → stats de temporada
 * 
 * Solo aplica a FÚTBOL. NBA/Tennis/MLB se saltan.
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// Sanitizar key — GitHub secrets puede agregar caracteres invisibles
const RAW_KEY = process.env.FOOTBALL_API_KEY || '';
const API_KEY = RAW_KEY.replace(/[^a-zA-Z0-9]/g, '') || null;
const BASE_URL = 'https://v3.football.api-sports.io';
const PAUSA_MS = 350;

if (API_KEY) {
  console.log(`📊 Football API: key loaded (${API_KEY.length} chars, raw was ${RAW_KEY.length})`);
} else {
  console.log('📊 Football API: no key configured');
}

// Cache de team IDs para no repetir búsquedas en la misma ejecución
const teamCache = new Map();
let requestsUsados = 0;
const MAX_REQUESTS = 25; // 25/run × 3 runs + tracking = ~90/100 diarios

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

async function apiCall(endpoint, params = {}) {
  if (!API_KEY) return null;
  if (requestsUsados >= MAX_REQUESTS) {
    console.log(`⚠️ Stats: límite de requests alcanzado (${requestsUsados}/${MAX_REQUESTS})`);
    return null;
  }

  try {
    const response = await axios.get(`${BASE_URL}/${endpoint}`, {
      headers: { 'x-apisports-key': API_KEY },
      params,
      timeout: 8000
    });

    requestsUsados++;
    await new Promise(r => setTimeout(r, PAUSA_MS));

    if (response.data?.errors && Object.keys(response.data.errors).length > 0) {
      console.error(`⚠️ Stats API error:`, response.data.errors);
      return null;
    }

    return response.data?.response || null;
  } catch (error) {
    console.error(`❌ Stats API error (${endpoint}):`, error.message);
    requestsUsados++;
    return null;
  }
}

function pausa() {
  return new Promise(r => setTimeout(r, PAUSA_MS));
}

// ─────────────────────────────────────────────
// BUSCAR TEAM ID
// ─────────────────────────────────────────────

async function buscarTeamId(teamName) {
  if (!API_KEY) return null;
  
  // Check cache
  if (teamCache.has(teamName)) return teamCache.get(teamName);

  // Normalizar nombre para búsqueda
  // The Odds API usa nombres cortos, API-Football usa nombres completos
  const aliases = {
    'man city': 'manchester city', 'man utd': 'manchester united',
    'man united': 'manchester united', 'spurs': 'tottenham',
    'wolves': 'wolverhampton', 'newcastle': 'newcastle united',
    'west ham': 'west ham united', 'nottm forest': 'nottingham forest',
    'nott\'m forest': 'nottingham forest', 'athletic bilbao': 'athletic club',
    'atletico madrid': 'atletico de madrid', 'inter': 'internazionale',
    'inter milan': 'internazionale', 'ac milan': 'milan',
    'bayern munich': 'bayern', 'psg': 'paris saint germain',
    'rb leipzig': 'rasen ballsport leipzig', 'la galaxy': 'los angeles galaxy',
    'ny red bulls': 'new york red bulls'
  };

  const lowerName = teamName.toLowerCase().trim();
  const searchName = aliases[lowerName] || teamName
    .replace(/\s+(FC|CF|SC|AC|AS|SS|US|CD|SL)$/i, '')
    .replace(/^(FC|CF|SC|AC|AS|SS|US|CD|SL)\s+/i, '')
    .trim();

  const data = await apiCall('teams', { search: searchName });
  
  if (data && data.length > 0) {
    // Match exacto primero, luego parcial
    const exacto = data.find(t => 
      t.team.name.toLowerCase() === teamName.toLowerCase() ||
      t.team.name.toLowerCase() === searchName.toLowerCase()
    );
    const team = exacto || data[0];
    
    const result = { id: team.team.id, name: team.team.name };
    teamCache.set(teamName, result);
    return result;
  }

  // Si no encontró, intentar con nombre más corto (primera palabra significativa)
  if (searchName.includes(' ')) {
    const palabras = searchName.split(' ').filter(p => p.length > 3);
    if (palabras.length > 0) {
      const data2 = await apiCall('teams', { search: palabras[0] });
      if (data2 && data2.length > 0) {
        const result = { id: data2[0].team.id, name: data2[0].team.name };
        teamCache.set(teamName, result);
        return result;
      }
    }
  }

  console.log(`   ⚠️ Equipo no encontrado: "${teamName}"`);
  teamCache.set(teamName, null);
  return null;
}

// ─────────────────────────────────────────────
// H2H - HEAD TO HEAD
// ─────────────────────────────────────────────

async function obtenerH2H(team1Id, team2Id) {
  // Free plan no soporta 'last', solo h2h + status
  const data = await apiCall('fixtures/headtohead', {
    h2h: `${team1Id}-${team2Id}`,
    status: 'FT-AET-PEN'
  });

  if (!data || data.length === 0) return null;

  // Tomar solo los últimos 10 partidos
  const ultimos = data.slice(-10);

  let wins1 = 0, wins2 = 0, draws = 0;

  ultimos.forEach(match => {
    const homeId = match.teams.home.id;
    const homeGoals = match.goals.home;
    const awayGoals = match.goals.away;

    if (homeGoals === awayGoals) {
      draws++;
    } else if (homeGoals > awayGoals) {
      if (homeId === team1Id) wins1++;
      else wins2++;
    } else {
      if (homeId === team1Id) wins2++;
      else wins1++;
    }
  });

  return {
    partidos: ultimos.length,
    wins1, wins2, draws,
    dominante: wins1 > wins2 ? 'team1' : wins2 > wins1 ? 'team2' : 'parejo'
  };
}

// ─────────────────────────────────────────────
// FORMA RECIENTE (últimos 5 partidos)
// ─────────────────────────────────────────────

async function obtenerForma(teamId) {
  // Free plan no soporta 'last'. Usar season + status
  const year = new Date().getFullYear();
  const season = new Date().getMonth() >= 6 ? year : year - 1; // Temporadas empiezan ~julio
  
  const data = await apiCall('fixtures', {
    team: teamId,
    season: season,
    status: 'FT-AET-PEN'
  });

  if (!data || data.length === 0) return null;

  // Tomar últimos 5 partidos
  const ultimos = data.slice(-5);

  let wins = 0, draws = 0, losses = 0;
  let golesAFavor = 0, golesEnContra = 0;
  const forma = [];

  ultimos.forEach(match => {
    const esHome = match.teams.home.id === teamId;
    const golesEquipo = esHome ? match.goals.home : match.goals.away;
    const golesRival = esHome ? match.goals.away : match.goals.home;

    golesAFavor += golesEquipo || 0;
    golesEnContra += golesRival || 0;

    if (golesEquipo > golesRival) { wins++; forma.push('W'); }
    else if (golesEquipo < golesRival) { losses++; forma.push('L'); }
    else { draws++; forma.push('D'); }
  });

  return {
    ultimos5: forma.join(''),
    wins, draws, losses,
    golesAFavor, golesEnContra,
    winRate: (wins / ultimos.length * 100).toFixed(0),
    promedioGoles: (golesAFavor / ultimos.length).toFixed(1)
  };
}

// ─────────────────────────────────────────────
// FUNCIÓN PRINCIPAL: obtener stats para una apuesta
// ─────────────────────────────────────────────

/**
 * Obtiene estadísticas para un evento de fútbol
 * @param {string} homeTeam - nombre equipo local
 * @param {string} awayTeam - nombre equipo visitante
 * @param {string} equipoApuesta - equipo al que se apuesta (o "Draw")
 * @returns {object|null} stats del evento
 */
export async function obtenerEstadisticas(homeTeam, awayTeam, equipoApuesta) {
  if (!API_KEY) {
    return null; // Sin API key, skip silenciosamente
  }

  try {
    // 1. Buscar IDs de ambos equipos (2 calls, cacheadas)
    const home = await buscarTeamId(homeTeam);
    const away = await buscarTeamId(awayTeam);

    if (!home || !away) {
      console.log(`   ⚠️ Stats: no encontré IDs para ${homeTeam} o ${awayTeam}`);
      return null;
    }

    // 2. Forma reciente del equipo apostado (1 call)
    let formaEquipo = null;
    if (equipoApuesta !== 'Draw') {
      const teamId = equipoApuesta === homeTeam ? home.id : away.id;
      formaEquipo = await obtenerForma(teamId);
    }

    // 3. H2H entre ambos equipos (1 call)
    const h2h = await obtenerH2H(home.id, away.id);

    // Total: ~4 calls por evento

    // Construir resumen
    const stats = {
      disponible: true,
      forma: formaEquipo,
      h2h,
      resumen: construirResumen(formaEquipo, h2h, equipoApuesta, homeTeam)
    };

    return stats;

  } catch (error) {
    console.error(`❌ Error obteniendo stats:`, error.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// SCORING: bonus por estadísticas
// ─────────────────────────────────────────────

/**
 * Calcula bonus de score basado en estadísticas
 * Retorna -10 a +20 puntos
 */
export function calcularBonusStats(stats) {
  if (!stats || !stats.disponible) return 0;

  let bonus = 0;

  // Forma reciente (máx +10)
  if (stats.forma) {
    const wr = parseInt(stats.forma.winRate);
    if (wr >= 80) bonus += 10;       // 4-5 wins de 5
    else if (wr >= 60) bonus += 5;   // 3 wins de 5
    else if (wr <= 20) bonus -= 5;   // Mala forma = penaliza
  }

  // H2H (máx +10)
  if (stats.h2h) {
    if (stats.h2h.dominante === 'team1') {
      // El equipo apostado domina el H2H
      const ratio = stats.h2h.wins1 / stats.h2h.partidos;
      if (ratio >= 0.6) bonus += 10;
      else if (ratio >= 0.4) bonus += 5;
    } else if (stats.h2h.dominante === 'team2') {
      // El rival domina
      const ratio = stats.h2h.wins2 / stats.h2h.partidos;
      if (ratio >= 0.6) bonus -= 10;  // Penalizar fuerte
      else if (ratio >= 0.4) bonus -= 5;
    }
  }

  return Math.max(-10, Math.min(20, bonus));
}

// ─────────────────────────────────────────────
// FORMATO PARA TELEGRAM
// ─────────────────────────────────────────────

function construirResumen(forma, h2h, equipoApuesta, homeTeam) {
  const lineas = [];

  if (forma) {
    const emoji = parseInt(forma.winRate) >= 60 ? '🟢' : parseInt(forma.winRate) >= 40 ? '🟡' : '🔴';
    lineas.push(`${emoji} Forma: ${forma.ultimos5} (${forma.winRate}% wins)`);
    lineas.push(`⚽ Goles: ${forma.golesAFavor} a favor, ${forma.golesEnContra} en contra`);
  }

  if (h2h && h2h.partidos > 0) {
    const esHome = equipoApuesta === homeTeam;
    const winsEquipo = esHome ? h2h.wins1 : h2h.wins2;
    const winsRival = esHome ? h2h.wins2 : h2h.wins1;
    lineas.push(`⚔️ H2H: ${winsEquipo}W-${h2h.draws}D-${winsRival}L (últimos ${h2h.partidos})`);
  }

  return lineas;
}

/**
 * Formatea stats para mensaje de Telegram
 */
export function formatearStatsTelegram(stats) {
  if (!stats || !stats.disponible || !stats.resumen || stats.resumen.length === 0) {
    return '';
  }
  return stats.resumen.map(l => `  ${l}`).join('\n') + '\n';
}

// ─────────────────────────────────────────────
// HELPERS PÚBLICOS
// ─────────────────────────────────────────────

/**
 * Verifica si el deporte soporta estadísticas
 */
export function deporteSoportado(deporte) {
  return deporte && deporte.includes('soccer');
}

export function getRequestsUsados() {
  return requestsUsados;
}

export default {
  obtenerEstadisticas,
  calcularBonusStats,
  formatearStatsTelegram,
  deporteSoportado,
  getRequestsUsados
};
