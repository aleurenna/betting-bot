/**
 * Módulo de Telegram
 * Envía recomendaciones de apuestas
 */

import axios from 'axios';
import * as db from './database.js';
import dotenv from 'dotenv';

dotenv.config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

/**
 * Envía recomendaciones a Telegram
 */
export async function enviarTelegram(recomendaciones, bankroll = 20, moneda = 'USD') {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('⚠️ Telegram no configurado. Saltando envío...');
    return;
  }

  try {
    const mensaje = formatearMensaje(recomendaciones, bankroll, moneda);
    
    // Telegram límite: 4096 chars. Dividir si es necesario.
    const chunks = splitMensaje(mensaje, 4000);
    
    for (const chunk of chunks) {
      await axios.post(`${API_URL}/sendMessage`, {
        chat_id: TELEGRAM_CHAT_ID,
        text: chunk,
        parse_mode: 'HTML'
      });
      // Pequeña pausa entre mensajes para evitar rate limit
      if (chunks.length > 1) await new Promise(r => setTimeout(r, 500));
    }

    await db.registrarUsoCréditos(0, 'telegram', 'all', 'all', true);
    console.log(`✅ Mensaje enviado a Telegram (${chunks.length} parte${chunks.length > 1 ? 's' : ''})`);
    return true;

  } catch (error) {
    console.error('❌ Error enviando Telegram:', error.message);
    
    // Si falla HTML, intentar sin parse_mode
    try {
      const mensajePlano = formatearMensaje(recomendaciones, bankroll, moneda)
        .replace(/<[^>]*>/g, '');
      const chunks = splitMensaje(mensajePlano, 4000);
      for (const chunk of chunks) {
        await axios.post(`${API_URL}/sendMessage`, {
          chat_id: TELEGRAM_CHAT_ID,
          text: chunk
        });
      }
      console.log('✅ Mensaje enviado (texto plano fallback)');
    } catch (e2) {
      console.error('❌ Fallback también falló:', e2.message);
    }
    
    await db.registrarUsoCréditos(0, 'telegram', 'error', 'error', false);
  }
}

/**
 * Formatea las recomendaciones para Telegram
 */
function formatearMensaje(recomendaciones, bankroll = 20, moneda = 'USD') {
  if (!Array.isArray(recomendaciones) || recomendaciones.length === 0) {
    return '⚠️ Sin apuestas con EV+ en este momento';
  }

  if (recomendaciones[0]?.error) {
    return `🚨 Error: ${recomendaciones[0].mensaje}`;
  }

  const simbolo = moneda === 'CRC' ? '₡' : '$';
  const fecha = new Date().toLocaleString('es-ES');
  let mensaje = `<b>📊 RECOMENDACIONES DE APUESTAS</b>\n`;
  mensaje += `⏰ ${fecha}\n`;
  mensaje += `💰 Bankroll: ${simbolo}${bankroll.toFixed(2)} ${moneda}\n`;
  mensaje += `📈 Plan: EV+ Strategy con Kelly Criterion\n`;
  mensaje += `\n${'='.repeat(50)}\n\n`;

  let totalApostar = 0;

  recomendaciones.forEach((apuesta, index) => {
    const emoji = obtenerEmoji(apuesta.deporte);
    const reasonScore = parseInt(apuesta.score);
    const confidencia = reasonScore > 75 ? '🔥 ALTA' : reasonScore > 60 ? '⚡ MEDIA' : '⚠️ BAJA';
    
    // Colores de riesgo
    let nivelRiesgo = '🟢 Bajo';
    if (apuesta.riesgoNivel === 'medio') nivelRiesgo = '🟡 Medio';
    if (apuesta.riesgoNivel === 'alto') nivelRiesgo = '🟠 Alto';
    if (apuesta.riesgoNivel === 'muy_alto') nivelRiesgo = '🔴 Muy Alto';

    totalApostar += parseFloat(apuesta.apuesta || 0);

    mensaje += `<b>${index + 1}. ${emoji} ${apuesta.liga}</b>\n`;
    mensaje += `🎯 <b>${apuesta.equipo}</b>\n`;
    mensaje += `🏟️ ${apuesta.evento}\n`;
    mensaje += `💰 Odds: <code>${parseFloat(apuesta.odds).toFixed(2)}</code> (${apuesta.mejorBookmaker || 'mejor disponible'})\n`;
    mensaje += `📊 Prob: <code>${apuesta.probabilidad}%</code> | EV: <code>+${apuesta.ev}%</code> | Kelly: <code>${apuesta.kelly}%</code>\n`;
    
    // Fuente de probabilidad (Pinnacle vs mediana)
    const fuente = apuesta.fuenteProbabilidad || 'promedio';
    if (fuente.startsWith('sharp')) {
      mensaje += `🎯 <b>Ref: Pinnacle</b> (prob. real ajustada)\n`;
    }
    
    // DISPONIBILIDAD EN CASAS PRINCIPALES
    if (apuesta.disponibleEnPrincipales) {
      const casasNombres = apuesta.casasPrincipales.map(c => c.nombre).join(' + ');
      mensaje += `✅ Disponible en: ${casasNombres}\n`;
    } else {
      mensaje += `⚠️ No en Doradobet/Bet365 (${apuesta.consensoCasas} alternativas)\n`;
    }
    
    // APUESTA RECOMENDADA
    mensaje += `\n💵 <b>APUESTA RECOMENDADA:</b>\n`;
    mensaje += `   → ${simbolo}<code>${apuesta.apuesta.toFixed(2)}</code> ${moneda} ${nivelRiesgo}\n`;
    mensaje += `   → Si ganas: ${simbolo}${parseFloat(apuesta.gananciaSiGana).toFixed(2)}\n`;
    mensaje += `   → Si pierdes: -${simbolo}${Math.abs(parseFloat(apuesta.pérdidaSiPierde)).toFixed(2)}\n`;
    
    mensaje += `\n🎲 Consenso: ${apuesta.consensoCasas} casas | Diferencial: <code>+${apuesta.diferencialOdds}%</code>\n`;
    mensaje += `💪 Confianza: ${confidencia} (Score: ${apuesta.score})\n`;
    
    // Explicación
    mensaje += `\n✅ <b>Por qué apostar:</b>\n`;
    mensaje += generarExplicacion(apuesta);
    
    mensaje += `\n${'─'.repeat(50)}\n\n`;
  });

  mensaje += `\n<b>📋 RESUMEN:</b>\n`;
  mensaje += `💳 Total a apostar: ${simbolo}${totalApostar.toFixed(2)} ${moneda}\n`;
  mensaje += `📊 Bankroll disponible: ${simbolo}${bankroll.toFixed(2)} ${moneda}\n`;
  mensaje += `📈 % de bankroll: ${((totalApostar / bankroll) * 100).toFixed(1)}%\n`;

  mensaje += `\n<b>💡 TIPS IMPORTANTES:</b>\n`;
  mensaje += `• Las cantidades respetan Kelly Criterion 25% (conservador)\n`;
  mensaje += `• Solo apostar el dinero que puedas perder\n`;
  mensaje += `• Diversificar entre múltiples eventos reduce riesgo\n`;
  mensaje += `• Registrar TODOS los resultados para análisis\n`;
  mensaje += `\n<b>📉 Recuerda:</b> Las apuestas conllevan riesgo. Apuesta responsablemente.`;

  return mensaje;
}

/**
 * Genera explicación de por qué apostar
 */
function generarExplicacion(apuesta) {
  let explicacion = '';
  
  // Fuente de probabilidad
  const fuente = apuesta.fuenteProbabilidad || 'promedio';
  if (fuente.startsWith('sharp')) {
    explicacion += `• <b>Pinnacle confirma:</b> Línea sharp respalda esta apuesta\n`;
  }
  
  // EV
  const ev = parseFloat(apuesta.ev);
  if (ev > 5) explicacion += `• <b>EV Excelente:</b> +${ev}% edge muy fuerte\n`;
  else if (ev > 3) explicacion += `• <b>EV Muy Bueno:</b> +${ev}% valor real\n`;
  else explicacion += `• <b>EV Positivo:</b> +${ev}% a favor\n`;
  
  // Probabilidad
  const prob = parseFloat(apuesta.probabilidad);
  if (prob > 65) explicacion += `• <b>Favorito Claro:</b> ${prob}% probabilidad\n`;
  else if (prob > 55) explicacion += `• <b>Ligero Favorito:</b> ${prob}% sólido\n`;
  
  // Consenso
  if (parseInt(apuesta.consensoCasas) >= 6) {
    explicacion += `• <b>Gran Consenso:</b> ${apuesta.consensoCasas} casas con línea similar\n`;
  }
  
  // Diferencial
  if (parseFloat(apuesta.diferencialOdds) > 5) {
    explicacion += `• <b>Odds Premium:</b> +${apuesta.diferencialOdds}% mejor que mercado\n`;
  }
  
  // Mejor bookmaker
  if (apuesta.mejorBookmaker) {
    explicacion += `• <b>Apostar en:</b> ${apuesta.mejorBookmaker}\n`;
  }

  return explicacion;
}

/**
 * Obtiene emoji por deporte
 */
function obtenerEmoji(deporte) {
  if (!deporte) return '🎯';
  if (deporte.includes('soccer')) return '⚽';
  if (deporte.includes('basketball')) return '🏀';
  if (deporte.includes('tennis')) return '🎾';
  return '🎯';
}

/**
 * Envía reporte diario
 */
export async function enviarReporteDiario() {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('⚠️ Telegram no configurado para reporte');
    return;
  }

  try {
    const stats = await db.obtenerEstadísticasSemanales();
    
    if (stats.length === 0) {
      console.log('Sin estadísticas para reporte');
      return;
    }
    
    let mensaje = `<b>📈 REPORTE SEMANAL DE APUESTAS</b>\n\n`;
    
    let totalGanancia = 0;
    let totalPredicciones = 0;
    let totalGanadas = 0;
    
    stats.forEach(day => {
      const winRate = ((day.predicciones_ganadas / day.total_predicciones) * 100).toFixed(1);
      mensaje += `<b>${day.fecha}</b>\n`;
      mensaje += `├ Predicciones: ${day.total_predicciones} (${winRate}% ganadas)\n`;
      mensaje += `├ ROI: ${day.roi_diario > 0 ? '+' : ''}${day.roi_diario.toFixed(2)}%\n`;
      mensaje += `├ EV Promedio: ${day.ev_promedio.toFixed(2)}%\n`;
      mensaje += `└ Créditos: ${day.creditos_usados}\n\n`;
      
      totalGanancia += day.ganancia_neta || 0;
      totalPredicciones += day.total_predicciones;
      totalGanadas += day.predicciones_ganadas;
    });
    
    const winRateSemanal = totalPredicciones > 0 
      ? ((totalGanadas / totalPredicciones) * 100).toFixed(1) 
      : '0.0';
    mensaje += `\n<b>TOTALES SEMANA:</b>\n`;
    mensaje += `🏆 Win Rate: ${winRateSemanal}%\n`;
    mensaje += `💰 Ganancia Neta: ${totalGanancia > 0 ? '+' : ''}${totalGanancia.toFixed(2)}\n`;
    mensaje += `\n✅ Recuerda: Consistencia > Ganancias rápidas`;
    
    // Enviar directamente sin pasar por formatearMensaje
    await axios.post(`${API_URL}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: mensaje,
      parse_mode: 'HTML'
    });
    
    console.log('✅ Reporte semanal enviado a Telegram');
    
  } catch (error) {
    console.error('❌ Error enviando reporte:', error.message);
  }
}

/**
 * Divide mensaje largo en chunks respetando separadores
 */
function splitMensaje(texto, maxLen = 4000) {
  if (texto.length <= maxLen) return [texto];
  
  const chunks = [];
  const separador = '─'.repeat(50);
  const partes = texto.split(separador);
  
  let chunk = '';
  for (const parte of partes) {
    if ((chunk + separador + parte).length > maxLen && chunk.length > 0) {
      chunks.push(chunk.trim());
      chunk = parte;
    } else {
      chunk += (chunk ? separador : '') + parte;
    }
  }
  if (chunk.trim()) chunks.push(chunk.trim());
  
  // Si algún chunk sigue siendo muy largo, cortar por líneas
  const resultado = [];
  for (const c of chunks) {
    if (c.length <= maxLen) {
      resultado.push(c);
    } else {
      let sub = '';
      for (const linea of c.split('\n')) {
        if ((sub + '\n' + linea).length > maxLen) {
          resultado.push(sub.trim());
          sub = linea;
        } else {
          sub += (sub ? '\n' : '') + linea;
        }
      }
      if (sub.trim()) resultado.push(sub.trim());
    }
  }
  
  return resultado;
}

export default {
  enviarTelegram,
  enviarReporteDiario,
  formatearMensaje
};
