/**
 * Módulo de Telegram v2
 * Cada apuesta = 1 mensaje individual
 */

import axios from 'axios';
import * as db from './database.js';
import dotenv from 'dotenv';

dotenv.config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

const PAUSA_MS = 300; // pausa entre mensajes (anti rate-limit)

// ─────────────────────────────────────────────
// ENVIAR A TELEGRAM
// ─────────────────────────────────────────────

async function enviarMensaje(texto, html = true) {
  const payload = { chat_id: TELEGRAM_CHAT_ID, text: texto };
  if (html) payload.parse_mode = 'HTML';
  
  try {
    await axios.post(`${API_URL}/sendMessage`, payload);
    return true;
  } catch (error) {
    // Si falla HTML, reintentar sin formato
    if (html) {
      try {
        await axios.post(`${API_URL}/sendMessage`, {
          chat_id: TELEGRAM_CHAT_ID,
          text: texto.replace(/<[^>]*>/g, '')
        });
        return true;
      } catch (e2) { /* silenciar */ }
    }
    console.error('❌ Error enviando mensaje:', error.message);
    return false;
  }
}

async function pausa() {
  return new Promise(r => setTimeout(r, PAUSA_MS));
}

/**
 * Envía recomendaciones: 1 header + 1 msg por apuesta + 1 resumen
 */
export async function enviarTelegram(recomendaciones, bankroll = 20, moneda = 'USD') {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('⚠️ Telegram no configurado');
    return;
  }

  // Caso error
  if (recomendaciones[0]?.error) {
    await enviarMensaje(`🚨 ${recomendaciones[0].mensaje}`);
    return;
  }

  if (!Array.isArray(recomendaciones) || recomendaciones.length === 0) {
    await enviarMensaje('⚠️ Sin apuestas EV+ disponibles');
    return;
  }

  const simbolo = moneda === 'CRC' ? '₡' : '$';
  const fecha = new Date().toLocaleString('es-CR');
  let enviados = 0;
  let totalApostar = 0;

  try {
    // ── HEADER ──
    let header = `<b>📊 APUESTAS EV+ — ${fecha}</b>\n`;
    header += `💰 Bankroll: ${simbolo}${bankroll.toFixed(2)} ${moneda}\n`;
    header += `🎯 ${recomendaciones.length} oportunidades encontradas`;
    
    await enviarMensaje(header);
    await pausa();

    // ── CADA APUESTA = 1 MENSAJE, agrupadas por fecha ──
    let fechaAnterior = '';
    
    for (let i = 0; i < recomendaciones.length; i++) {
      const ap = recomendaciones[i];
      totalApostar += parseFloat(ap.apuesta || 0);
      
      // Separador de fecha si cambia el día
      const fechaEvento = ap.fechaEvento ? new Date(ap.fechaEvento) : null;
      const diaEvento = fechaEvento 
        ? fechaEvento.toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' })
        : '';
      
      if (diaEvento && diaEvento !== fechaAnterior) {
        fechaAnterior = diaEvento;
        await enviarMensaje(`📅 <b>${diaEvento.toUpperCase()}</b>`);
        await pausa();
      }
      
      const msg = formatearApuestaIndividual(ap, i + 1, simbolo, moneda);
      const ok = await enviarMensaje(msg);
      if (ok) enviados++;
      await pausa();
    }

    // ── RESUMEN FINAL ──
    let resumen = `<b>📋 RESUMEN</b>\n`;
    resumen += `💳 Total a apostar: ${simbolo}${totalApostar.toFixed(2)}\n`;
    resumen += `📊 % bankroll: ${((totalApostar / bankroll) * 100).toFixed(1)}%\n`;
    resumen += `📈 Apuestas: ${recomendaciones.length} | Kelly 25%\n`;
    resumen += `\n⚠️ Apuesta responsablemente`;

    await enviarMensaje(resumen);

    await db.registrarUsoCréditos(0, 'telegram', 'all', 'all', true);
    console.log(`✅ Telegram: ${enviados}/${recomendaciones.length} apuestas enviadas`);

  } catch (error) {
    console.error('❌ Error en envío Telegram:', error.message);
    await db.registrarUsoCréditos(0, 'telegram', 'error', 'error', false);
  }
}

// ─────────────────────────────────────────────
// FORMATO INDIVIDUAL POR APUESTA
// ─────────────────────────────────────────────

function formatearApuestaIndividual(ap, numero, simbolo, moneda) {
  const emoji = obtenerEmoji(ap.deporte);
  const score = parseInt(ap.score);
  const confianza = score > 75 ? '🔥 ALTA' : score > 60 ? '⚡ MEDIA' : '⚠️ BAJA';
  
  let riesgo = '🟢 Bajo';
  if (ap.riesgoNivel === 'medio') riesgo = '🟡 Medio';
  if (ap.riesgoNivel === 'alto') riesgo = '🟠 Alto';
  if (ap.riesgoNivel === 'muy_alto') riesgo = '🔴 Muy Alto';

  const fechaEvento = ap.fechaEvento 
    ? new Date(ap.fechaEvento).toLocaleString('es-CR', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

  let msg = '';

  // Encabezado
  msg += `<b>${numero}. ${emoji} ${ap.liga}</b>\n`;
  msg += `🎯 <b>${ap.equipo}</b>\n`;
  msg += `🏟️ ${ap.evento}\n`;
  if (fechaEvento) msg += `🕐 ${fechaEvento}\n`;
  msg += `\n`;

  // Odds y análisis
  msg += `💰 Odds: <code>${parseFloat(ap.odds).toFixed(2)}</code>\n`;
  msg += `🏦 <b>Apostar en → ${ap.mejorBookmaker || 'mejor disponible'}</b>\n`;
  
  msg += `📊 Prob: <code>${ap.probabilidad}%</code> | EV: <code>+${ap.ev}%</code>\n`;
  
  // Pinnacle
  const fuente = ap.fuenteProbabilidad || '';
  if (fuente.startsWith('sharp')) {
    msg += `🎯 Ref: Pinnacle (prob. ajustada)\n`;
  }

  // Casas disponibles
  if (ap.disponibleEnPrincipales && ap.casasPrincipales?.length > 1) {
    const otras = ap.casasPrincipales
      .filter(c => c.nombre !== ap.mejorBookmaker)
      .map(c => c.nombre).join(', ');
    if (otras) msg += `📋 También en: ${otras}\n`;
  }
  
  msg += `\n`;

  // Apuesta recomendada (la parte más importante)
  msg += `💵 <b>Apostar: ${simbolo}${ap.apuesta.toFixed(2)} ${moneda}</b> ${riesgo}\n`;
  msg += `   ✅ Ganas: +${simbolo}${parseFloat(ap.gananciaSiGana).toFixed(2)}\n`;
  msg += `   ❌ Pierdes: -${simbolo}${Math.abs(parseFloat(ap.pérdidaSiPierde)).toFixed(2)}\n`;
  msg += `\n`;

  // Confianza y razones
  msg += `💪 ${confianza} (Score: ${ap.score}/100)\n`;
  msg += generarExplicacion(ap);

  return msg;
}

// ─────────────────────────────────────────────
// EXPLICACIÓN
// ─────────────────────────────────────────────

function generarExplicacion(ap) {
  const razones = [];
  
  const fuente = ap.fuenteProbabilidad || '';
  if (fuente.startsWith('sharp')) razones.push('Pinnacle confirma línea');
  
  const ev = parseFloat(ap.ev);
  if (ev > 5) razones.push(`EV excelente +${ev}%`);
  else if (ev > 3) razones.push(`EV muy bueno +${ev}%`);
  
  if (parseInt(ap.consensoCasas) >= 6) razones.push(`${ap.consensoCasas} casas coinciden`);
  if (parseFloat(ap.diferencialOdds) > 5) razones.push(`+${ap.diferencialOdds}% mejor que mercado`);
  
  if (razones.length === 0) return '';
  return razones.map(r => `  • ${r}`).join('\n') + '\n';
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function obtenerEmoji(deporte) {
  if (!deporte) return '🎯';
  if (deporte.includes('soccer')) return '⚽';
  if (deporte.includes('basketball')) return '🏀';
  if (deporte.includes('tennis')) return '🎾';
  if (deporte.includes('baseball')) return '⚾';
  return '🎯';
}

// ─────────────────────────────────────────────
// REPORTE SEMANAL
// ─────────────────────────────────────────────

export async function enviarReporteDiario() {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

  try {
    const stats = await db.obtenerEstadísticasSemanales();
    if (stats.length === 0) return;
    
    let msg = `<b>📈 REPORTE SEMANAL</b>\n\n`;
    
    let totalGanancia = 0, totalPred = 0, totalGanadas = 0;
    
    stats.forEach(day => {
      const wr = ((day.predicciones_ganadas / day.total_predicciones) * 100).toFixed(1);
      msg += `<b>${day.fecha}</b> — ${day.total_predicciones} pred (${wr}% win)\n`;
      totalGanancia += day.ganancia_neta || 0;
      totalPred += day.total_predicciones;
      totalGanadas += day.predicciones_ganadas;
    });
    
    const wrTotal = totalPred > 0 ? ((totalGanadas / totalPred) * 100).toFixed(1) : '0.0';
    msg += `\n🏆 Win Rate: ${wrTotal}%`;
    msg += `\n💰 Ganancia: ${totalGanancia > 0 ? '+' : ''}${totalGanancia.toFixed(2)}`;
    
    await enviarMensaje(msg);
    console.log('✅ Reporte semanal enviado');
    
  } catch (error) {
    console.error('❌ Error reporte:', error.message);
  }
}

export default { enviarTelegram, enviarReporteDiario };
