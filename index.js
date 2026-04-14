#!/usr/bin/env node

/**
 * BETTING BOT - Main Entry Point
 * Orquesta todas las funciones del bot
 */

import * as botMain from './bot.js';
import * as telegramModule from './telegram.js';
import * as dbModule from './database.js';
import cron from 'node-cron';
import dotenv from 'dotenv';

dotenv.config();

const NODE_ENV = process.env.NODE_ENV || 'development';
const EXEC_INTERVAL = parseInt(process.env.EXEC_INTERVAL || '30'); // minutos

let isRunning = false;

/**
 * Ejecución única de análisis
 */
async function executeAnalysis() {
  if (isRunning) {
    console.log('⏳ Análisis anterior aún en progreso, saltando...');
    return;
  }

  isRunning = true;

  try {
    console.log('\n' + '='.repeat(70));
    console.log('🤖 BETTING BOT INICIANDO ANÁLISIS');
    console.log('='.repeat(70));
    console.log(`📍 Entorno: ${NODE_ENV.toUpperCase()}`);
    console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
    console.log('='.repeat(70) + '\n');

    // Ejecutar análisis principal
    const recomendaciones = await botMain.ejecutarBot();

    if (recomendaciones && recomendaciones.length > 0) {
      console.log(`\n✅ Análisis completado: ${recomendaciones.length} oportunidades encontradas`);

      // En modo development, mostrar detalles
      if (NODE_ENV === 'development') {
        console.log('\n📋 RECOMENDACIONES DETALLADAS:');
        console.log(JSON.stringify(recomendaciones, null, 2));
      }
    } else {
      console.log('\n⚠️  Sin oportunidades con EV+ en este momento');
    }

    // Mostrar créditos restantes
    const creditosUsados = await dbModule.obtenerTotalCréditos(1);
    console.log(`\n💳 Créditos usados hoy: ${creditosUsados}/500`);

  } catch (error) {
    console.error('\n❌ ERROR EN ANÁLISIS:', error);

    // Notificar error a Telegram
    try {
      await telegramModule.enviarTelegram([{
        error: true,
        mensaje: `🚨 Error en bot: ${error.message}`
      }]);
    } catch (telegramError) {
      console.error('❌ No se pudo enviar error a Telegram:', telegramError.message);
    }

  } finally {
    isRunning = false;
    console.log('\n✅ Análisis finalizado\n');
  }
}

/**
 * Genera reporte semanal
 */
async function executeWeeklyReport() {
  console.log('\n📊 Generando reporte semanal...');

  try {
    await telegramModule.enviarReporteDiario();
    console.log('✅ Reporte semanal enviado');
  } catch (error) {
    console.error('❌ Error generando reporte:', error);
  }
}

/**
 * Setup de scheduling
 */
function setupSchedules() {
  console.log('\n⏰ Configurando schedules...\n');

  // Ejecución cada X minutos
  const schedule = `*/${EXEC_INTERVAL} * * * *`;
  console.log(`📅 Análisis: cada ${EXEC_INTERVAL} minutos`);
  console.log(`   Horario: 8am-11pm Lun-Vie | 10am-10pm Sáb-Dom`);

  const job = cron.schedule(schedule, async () => {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay(); // 0=Domingo, 1=Lunes, ... 6=Sábado

    // Restricción de horario
    const esEntreSemana = day >= 1 && day <= 5; // Lun-Vie
    const esFinSemana = day === 0 || day === 6; // Sáb-Dom
    const horaValida = (esEntreSemana && hour >= 8 && hour < 23) ||
                       (esFinSemana && hour >= 10 && hour < 22);

    if (horaValida) {
      await executeAnalysis();
    } else {
      console.log(`⏸️  Fuera de horario de operación (${hour}:00 ${day})`);
    }
  }, {
    runOnInit: true // Ejecutar inmediatamente al iniciar
  });

  // Reporte semanal (Lunes 9am)
  const weeklyJob = cron.schedule('0 9 * * 1', async () => {
    await executeWeeklyReport();
  });

  console.log('✅ Schedules configurados\n');

  return { job, weeklyJob };
}

/**
 * Setup de señales de cierre limpio
 */
function setupSignalHandlers() {
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Señal SIGINT recibida - Cerrando gracefully...');
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n\n🛑 Señal SIGTERM recibida - Cerrando gracefully...');
    process.exit(0);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection:', promise, 'Reason:', reason);
    process.exit(1);
  });
}

/**
 * Main
 */
async function main() {
  console.clear();

  console.log(`
╔════════════════════════════════════════════════════════════════════╗
║                  🤖 BETTING BOT - EV+ STRATEGY 🤖                 ║
║                                                                    ║
║         Expected Value Based Automated Betting Analysis           ║
║                                                                    ║
╚════════════════════════════════════════════════════════════════════╝
  `);

  console.log(`
📊 CONFIGURACIÓN:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  • Entorno: ${NODE_ENV.toUpperCase()}
  • Deportes: Fútbol (EPL, La Liga) | Basketball (NBA) | Tennis (ATP)
  • Regiones: Europa, Australia (+ ocasional US, UK)
  • Estrategia: EV+ (Expected Value positivo)
  • Kelly Criterion: 25% Fractional (conservador)
  • Mínimo EV: 2%
  • Mínimo Score: 50/100
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);

  // Verificar configuración
  const requiredEnvVars = [
    'ODDS_API_KEY',
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_CHAT_ID'
  ];

  const missing = requiredEnvVars.filter(v => !process.env[v]);

  if (missing.length > 0) {
    console.error(`\n❌ VARIABLES DE ENTORNO FALTANTES:\n  ${missing.join('\n  ')}`);
    console.error('\n📝 Crear archivo .env con estas variables\n');
    process.exit(1);
  }

  console.log('✅ Configuración validada\n');

  // Setup
  setupSignalHandlers();
  const { job, weeklyJob } = setupSchedules();

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 BOT EN EJECUCIÓN - Presiona Ctrl+C para detener
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);

  // Mantener proceso activo
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Deteniendo bot...');
    job.stop();
    weeklyJob.stop();
    process.exit(0);
  });

  // En caso de modo de prueba / desarrollo
  if (process.argv.includes('--once')) {
    console.log('🧪 Modo prueba: una sola ejecución\n');
    await executeAnalysis();
    process.exit(0);
  }

  // Mantener el proceso en ejecución
  await new Promise(resolve => {
    // El proceso continúa indefinidamente
  });
}

// Ejecutar
main().catch(error => {
  console.error('❌ Error fatal:', error);
  process.exit(1);
});

export { executeAnalysis, executeWeeklyReport };
