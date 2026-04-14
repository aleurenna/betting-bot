#!/usr/bin/env node

/**
 * BETTING BOT v3.0 - Main Entry Point
 * 
 * Flujo por ejecución:
 * 1. Inicializar BD (persistente via cache)
 * 2. Verificar resultados de picks anteriores
 * 3. Ejecutar análisis de odds (nuevos picks)
 * 4. Actualizar CLV con datos frescos
 * 5. Calcular y mostrar métricas
 */

import * as botMain from './bot.js';
import * as tracking from './tracking.js';
import * as telegramModule from './telegram.js';
import * as dbModule from './database.js';
import cron from 'node-cron';
import dotenv from 'dotenv';

dotenv.config();

const NODE_ENV = process.env.NODE_ENV || 'development';
const EXEC_INTERVAL = parseInt(process.env.EXEC_INTERVAL || '30');
const IS_ONCE = process.argv.includes('--once');

/**
 * Ejecución completa de análisis + tracking
 */
async function executeAnalysis() {
  try {
    console.log('\n' + '='.repeat(60));
    console.log('🤖 BETTING BOT v3.0 - ANÁLISIS + TRACKING');
    console.log(`⏰ ${new Date().toISOString()}`);
    console.log('='.repeat(60) + '\n');

    // Inicializar BD
    await dbModule.inicializarDB();

    // ── PASO 1: Verificar resultados de picks anteriores ──
    console.log('📋 Paso 1: Verificando resultados anteriores...');
    const resueltos = await tracking.verificarResultados();
    
    // ── PASO 2: Ejecutar análisis de odds ──
    console.log('\n📋 Paso 2: Buscando nuevas oportunidades...');
    const resultado = await botMain.ejecutarBot();
    
    const picks = resultado?.picks || [];
    const oddsData = resultado?.oddsData || [];

    // ── PASO 3: Actualizar CLV con datos frescos ──
    if (oddsData.length > 0) {
      console.log('\n📋 Paso 3: Actualizando CLV...');
      await tracking.actualizarClosingOdds(oddsData);
    }

    // ── PASO 4: Métricas ──
    console.log('\n📋 Paso 4: Calculando métricas...');
    const metricas = await tracking.calcularMetricas();
    
    if (metricas && metricas.totalPicks > 0) {
      console.log(`\n📊 MÉTRICAS ACTUALES:`);
      console.log(`   Picks totales: ${metricas.totalPicks}`);
      console.log(`   Resueltos: ${metricas.resueltos} (${metricas.ganados}W-${metricas.perdidos}L)`);
      console.log(`   Win Rate: ${metricas.winRate.toFixed(1)}%`);
      console.log(`   ROI: ${metricas.roi >= 0 ? '+' : ''}${metricas.roi.toFixed(2)}`);
      console.log(`   CLV promedio: ${metricas.avgCLV >= 0 ? '+' : ''}${metricas.avgCLV.toFixed(2)}%`);
      console.log(`   EV promedio: +${metricas.avgEV.toFixed(2)}%`);
      console.log(`   Pendientes: ${metricas.pendientes}`);
    }

    // Resultado del análisis
    if (picks.length > 0) {
      console.log(`\n✅ ${picks.length} nuevas oportunidades encontradas`);
    } else {
      console.log('\n⚠️ Sin oportunidades EV+ en este momento');
      
      // Notificar (incluir métricas si hay)
      if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
        try {
          const axios = (await import('axios')).default;
          const API_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
          let texto = `⚠️ <b>Bot ejecutado</b> - ${new Date().toLocaleString('es-CR')}\nSin apuestas EV+ disponibles.`;
          
          if (metricas && metricas.totalPicks > 0) {
            texto += tracking.formatearMetricasTelegram(metricas);
          }
          if (resueltos > 0) {
            texto += `\n✅ ${resueltos} resultados actualizados`;
          }
          
          await axios.post(`${API_URL}/sendMessage`, {
            chat_id: process.env.TELEGRAM_CHAT_ID,
            text: texto,
            parse_mode: 'HTML'
          });
        } catch (e) {
          console.error('❌ Error notificando:', e.message);
        }
      }
    }

    const creditosUsados = await dbModule.obtenerTotalCréditos(1);
    console.log(`\n💳 Créditos usados hoy: ~${creditosUsados}`);

  } catch (error) {
    console.error('\n❌ ERROR:', error);
    try {
      await telegramModule.enviarTelegram([{
        error: true,
        mensaje: `🚨 Error en bot: ${error.message}`
      }]);
    } catch (e) {}
  }
}

/**
 * Main
 */
async function main() {
  console.log(`
╔═══════════════════════════════════════════════╗
║    🤖 BETTING BOT - EV+ STRATEGY v3.0        ║
║    CLV Tracking + Results + Metrics           ║
╚═══════════════════════════════════════════════╝
  `);

  const required = ['ODDS_API_KEY', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'];
  const missing = required.filter(v => !process.env[v]);
  if (missing.length > 0) {
    console.error(`❌ VARIABLES FALTANTES: ${missing.join(', ')}`);
    process.exit(1);
  }

  const extras = [];
  if (process.env.FOOTBALL_API_KEY) extras.push('API-Football ✅');
  else extras.push('API-Football ❌ (sin stats)');

  console.log(`✅ Config OK | ${extras.join(' | ')}`);
  console.log(`💰 Bankroll: ${process.env.MONEDA === 'CRC' ? '₡' : '$'}${process.env.BANKROLL_INICIAL || '20'} ${process.env.MONEDA || 'USD'}`);

  if (IS_ONCE) {
    console.log('🔄 Modo: ejecución única\n');
    await executeAnalysis();
    console.log('\n✅ Ejecución completada');
    process.exit(0);
  }

  console.log(`🔄 Modo: daemon (cada ${EXEC_INTERVAL} min)\n`);
  await executeAnalysis();

  cron.schedule(`*/${EXEC_INTERVAL} * * * *`, async () => {
    const h = new Date().getHours();
    const d = new Date().getDay();
    const ok = (d >= 1 && d <= 5 && h >= 8 && h < 23) || ((d === 0 || d === 6) && h >= 10 && h < 22);
    if (ok) await executeAnalysis();
  });

  cron.schedule('0 9 * * 1', () => telegramModule.enviarReporteDiario());

  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
}

main().catch(e => { console.error('❌ Fatal:', e); process.exit(1); });

export { executeAnalysis };
