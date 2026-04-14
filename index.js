#!/usr/bin/env node

/**
 * BETTING BOT - Main Entry Point
 * Modo --once para GitHub Actions, modo daemon para local
 */

import * as botMain from './bot.js';
import * as telegramModule from './telegram.js';
import * as dbModule from './database.js';
import cron from 'node-cron';
import dotenv from 'dotenv';

dotenv.config();

const NODE_ENV = process.env.NODE_ENV || 'development';
const EXEC_INTERVAL = parseInt(process.env.EXEC_INTERVAL || '30');
const IS_ONCE = process.argv.includes('--once');

/**
 * Ejecución única de análisis
 */
async function executeAnalysis() {
  try {
    console.log('\n' + '='.repeat(60));
    console.log('🤖 BETTING BOT - ANÁLISIS');
    console.log(`⏰ ${new Date().toISOString()}`);
    console.log(`📍 Modo: ${IS_ONCE ? 'ONCE (GitHub Actions)' : 'DAEMON (local)'}`);
    console.log('='.repeat(60) + '\n');

    const recomendaciones = await botMain.ejecutarBot();

    if (recomendaciones && recomendaciones.length > 0) {
      console.log(`\n✅ ${recomendaciones.length} oportunidades encontradas`);
      if (NODE_ENV === 'development') {
        console.log(JSON.stringify(recomendaciones, null, 2));
      }
    } else {
      console.log('\n⚠️  Sin oportunidades EV+ en este momento');
      
      // Notificar que se ejecutó pero no encontró nada
      if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
        try {
          const axios = (await import('axios')).default;
          const API_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
          await axios.post(`${API_URL}/sendMessage`, {
            chat_id: process.env.TELEGRAM_CHAT_ID,
            text: `⚠️ <b>Bot ejecutado</b> - ${new Date().toLocaleString('es-CR')}\nSin apuestas EV+ disponibles en este ciclo.`,
            parse_mode: 'HTML'
          });
          console.log('📱 Notificación enviada a Telegram');
        } catch (e) {
          console.error('❌ Error notificando a Telegram:', e.message);
        }
      }
    }

    const creditosUsados = await dbModule.obtenerTotalCréditos(1);
    console.log(`\n💳 Créditos usados hoy: ~${creditosUsados}`);

  } catch (error) {
    console.error('\n❌ ERROR EN ANÁLISIS:', error);
    
    try {
      await telegramModule.enviarTelegram([{
        error: true,
        mensaje: `🚨 Error en bot: ${error.message}`
      }]);
    } catch (telegramError) {
      console.error('❌ No se pudo notificar error:', telegramError.message);
    }
  }
}

/**
 * Main
 */
async function main() {
  console.log(`
╔═══════════════════════════════════════════════╗
║    🤖 BETTING BOT - EV+ STRATEGY v1.1        ║
╚═══════════════════════════════════════════════╝
  `);

  // Verificar variables requeridas
  const required = ['ODDS_API_KEY', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'];
  const missing = required.filter(v => !process.env[v]);

  if (missing.length > 0) {
    console.error(`❌ VARIABLES FALTANTES: ${missing.join(', ')}`);
    process.exit(1);
  }

  console.log('✅ Configuración validada');
  console.log(`💰 Bankroll: ${process.env.MONEDA === 'CRC' ? '₡' : '$'}${process.env.BANKROLL_INICIAL || '20'} ${process.env.MONEDA || 'USD'}`);

  // Modo --once: ejecutar una vez y salir (para GitHub Actions)
  if (IS_ONCE) {
    console.log('🔄 Modo: ejecución única\n');
    await executeAnalysis();
    console.log('\n✅ Ejecución completada');
    process.exit(0);
  }

  // Modo daemon: cron local
  console.log(`🔄 Modo: daemon (cada ${EXEC_INTERVAL} min)\n`);

  // Ejecutar inmediatamente
  await executeAnalysis();

  // Programar ejecuciones
  const schedule = `*/${EXEC_INTERVAL} * * * *`;
  cron.schedule(schedule, async () => {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();

    const esEntreSemana = day >= 1 && day <= 5;
    const esFinSemana = day === 0 || day === 6;
    const horaValida = (esEntreSemana && hour >= 8 && hour < 23) ||
                       (esFinSemana && hour >= 10 && hour < 22);

    if (horaValida) {
      await executeAnalysis();
    } else {
      console.log(`⏸️ Fuera de horario (${hour}:00)`);
    }
  });

  // Reporte semanal (Lunes 9am)
  cron.schedule('0 9 * * 1', async () => {
    await telegramModule.enviarReporteDiario();
  });

  console.log('🚀 Bot activo - Ctrl+C para detener');

  process.on('SIGINT', () => {
    console.log('\n🛑 Deteniendo...');
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    console.log('\n🛑 SIGTERM');
    process.exit(0);
  });
}

main().catch(error => {
  console.error('❌ Error fatal:', error);
  process.exit(1);
});

export { executeAnalysis };
