/**
 * Módulo de Tracking - CLV, Resultados, Métricas
 * 
 * Flujo por ejecución:
 * 1. Actualizar closing odds de picks pendientes (0 créditos extra)
 * 2. Verificar resultados de partidos terminados (API-Football)
 * 3. Calcular métricas (SQL)
 */

import axios from 'axios';
import * as db from './database.js';
import dotenv from 'dotenv';

dotenv.config();

const FOOTBALL_API_KEY = (process.env.FOOTBALL_API_KEY || '').replace(/[^a-zA-Z0-9]/g, '') || null;
const FOOTBALL_URL = 'https://v3.football.api-sports.io';

// ─────────────────────────────────────────────
// 1. CLV - CLOSING LINE VALUE
// ─────────────────────────────────────────────

/**
 * Actualiza closing odds de picks pendientes usando datos del fetch actual
 * Se llama DESPUÉS del fetch normal de odds → 0 créditos extra
 * 
 * @param {Array} oddsData - datos raw de la API (eventos con bookmakers)
 */
export async function actualizarClosingOdds(oddsData) {
  if (!oddsData || oddsData.length === 0) return 0;

  try {
    // Obtener picks pendientes que aún no tienen closing odds
    const picksPendientes = await db.obtenerPicksSinClosing();
    if (picksPendientes.length === 0) return 0;

    let actualizados = 0;

    for (const pick of picksPendientes) {
      // Buscar el evento en los datos actuales
      const eventoMatch = oddsData.find(e => {
        const nombre = `${e.home_team} vs ${e.away_team}`;
        return nombre === pick.evento;
      });

      if (!eventoMatch || !eventoMatch.bookmakers) continue;

      // Verificar si el partido está próximo a comenzar (< 2 horas)
      const ahora = new Date();
      const inicio = new Date(eventoMatch.commence_time);
      const horasParaInicio = (inicio - ahora) / (1000 * 60 * 60);

      // Solo actualizar closing odds si el partido comienza pronto
      // o ya comenzó (en ese caso estas son las últimas odds disponibles)
      if (horasParaInicio > 2) continue;

      // Extraer odds actuales para el equipo apostado
      let closingOdds = null;
      for (const book of eventoMatch.bookmakers) {
        const h2h = book.markets?.find(m => m.key === 'h2h');
        if (!h2h || !h2h.outcomes) continue;

        const outcome = h2h.outcomes.find(o => o.name === pick.equipo_jugador);
        if (outcome) {
          // Usar promedio de mercado como closing odds de referencia
          if (!closingOdds) closingOdds = [];
          closingOdds.push(outcome.price);
        }
      }

      if (closingOdds && closingOdds.length > 0) {
        // Mediana como closing odds (más robusto)
        closingOdds.sort((a, b) => a - b);
        const mediana = closingOdds.length % 2 === 0
          ? (closingOdds[closingOdds.length / 2 - 1] + closingOdds[closingOdds.length / 2]) / 2
          : closingOdds[Math.floor(closingOdds.length / 2)];

        const clv = (pick.odds / mediana) - 1;

        await db.actualizarClosingOdds(pick.id, mediana, clv);
        actualizados++;

        console.log(`   📉 CLV ${pick.evento} → ${pick.equipo_jugador}: opening=${pick.odds.toFixed(2)} closing=${mediana.toFixed(2)} CLV=${(clv * 100).toFixed(2)}%`);
      }
    }

    if (actualizados > 0) {
      console.log(`📉 CLV actualizado: ${actualizados} picks`);
    }
    return actualizados;

  } catch (error) {
    console.error('❌ Error actualizando CLV:', error.message);
    return 0;
  }
}

// ─────────────────────────────────────────────
// 2. RESULTADOS
// ─────────────────────────────────────────────

/**
 * Verifica resultados de partidos completados
 * Usa API-Football (gratis)
 */
export async function verificarResultados() {
  if (!FOOTBALL_API_KEY) {
    return 0;
  }

  try {
    const picksPendientes = await db.obtenerPicksPendientesResultado();
    if (picksPendientes.length === 0) return 0;

    console.log(`🔍 Verificando resultados de ${picksPendientes.length} picks...`);
    let resueltos = 0;
    let apiCalls = 0;
    const MAX_RESULT_CALLS = 5; // máximo 5 calls para resultados por ejecución

    // Agrupar por fecha para hacer menos API calls
    const fechas = [...new Set(picksPendientes.map(p => {
      const d = new Date(p.fecha_evento);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }))];

    for (const fecha of fechas) {
      if (apiCalls >= MAX_RESULT_CALLS) break;
      
      try {
        apiCalls++;
        const response = await axios.get(`${FOOTBALL_URL}/fixtures`, {
          headers: { 'x-apisports-key': FOOTBALL_API_KEY },
          params: { date: fecha, status: 'FT-AET-PEN' },
          timeout: 8000
        });

        const partidos = response.data?.response || [];

        for (const pick of picksPendientes) {
          // Buscar el partido en los resultados
          const match = partidos.find(m => {
            const home = m.teams.home.name;
            const away = m.teams.away.name;
            const evento = pick.evento;
            // Match flexible por nombre
            return evento.includes(home) || evento.includes(away) ||
                   (home.includes(pick.equipo_jugador) || away.includes(pick.equipo_jugador));
          });

          if (!match) continue;

          const homeGoals = match.goals.home;
          const awayGoals = match.goals.away;
          const homeTeam = match.teams.home.name;

          // Determinar resultado
          let resultado;
          const apuesta = pick.equipo_jugador;
          const esHome = pick.evento.startsWith(apuesta) || homeTeam.includes(apuesta);

          if (apuesta === 'Draw') {
            resultado = homeGoals === awayGoals ? 'W' : 'L';
          } else if (esHome) {
            resultado = homeGoals > awayGoals ? 'W' : 'L';
          } else {
            resultado = awayGoals > homeGoals ? 'W' : 'L';
          }

          // Calcular ganancia/pérdida
          const stake = pick.odds; // odds guardadas = opening odds
          const ganancia = resultado === 'W'
            ? pick.kelly_percentage * (pick.odds - 1) // Ganancia estimada
            : -pick.kelly_percentage;

          await db.actualizarResultado(pick.id, resultado, ganancia);
          resueltos++;

          const emoji = resultado === 'W' ? '✅' : '❌';
          console.log(`   ${emoji} ${pick.evento}: ${apuesta} → ${resultado} (${homeGoals}-${awayGoals})`);
        }

        await new Promise(r => setTimeout(r, 300));
      } catch (error) {
        console.error(`   ❌ Error verificando fecha ${fecha}:`, error.message);
      }
    }

    if (resueltos > 0) {
      console.log(`📊 Resultados actualizados: ${resueltos} picks`);
    }
    return resueltos;

  } catch (error) {
    console.error('❌ Error verificando resultados:', error.message);
    return 0;
  }
}

// ─────────────────────────────────────────────
// 3. MÉTRICAS
// ─────────────────────────────────────────────

/**
 * Calcula métricas de rendimiento
 */
export async function calcularMetricas() {
  try {
    const metricas = await db.obtenerMetricas();
    return metricas;
  } catch (error) {
    console.error('❌ Error calculando métricas:', error.message);
    return null;
  }
}

/**
 * Formatea métricas para Telegram
 */
export function formatearMetricasTelegram(m) {
  if (!m || m.totalPicks === 0) return '';

  let msg = `\n<b>📊 MÉTRICAS (${m.totalPicks} picks)</b>\n`;
  
  const roiEmoji = m.roi >= 0 ? '🟢' : '🔴';
  const clvEmoji = m.avgCLV >= 0 ? '🟢' : '🔴';
  
  msg += `${roiEmoji} ROI: ${m.roi > 0 ? '+' : ''}${m.roi.toFixed(2)}%\n`;
  msg += `${clvEmoji} CLV promedio: ${m.avgCLV > 0 ? '+' : ''}${m.avgCLV.toFixed(2)}%\n`;
  msg += `🏆 Win Rate: ${m.winRate.toFixed(1)}%\n`;
  msg += `📈 EV promedio: +${m.avgEV.toFixed(2)}%\n`;
  
  if (m.resueltos > 0) {
    msg += `✅ ${m.ganados}W - ${m.perdidos}L (${m.resueltos} resueltos)\n`;
  }
  if (m.pendientes > 0) {
    msg += `⏳ ${m.pendientes} pendientes\n`;
  }

  return msg;
}

export default {
  actualizarClosingOdds,
  verificarResultados,
  calcularMetricas,
  formatearMetricasTelegram
};
