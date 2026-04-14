/**
 * Módulo de Base de Datos SQLite
 * Almacena predicciones, resultados e historial
 */

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

let db = null;

export async function inicializarDB() {
  try {
    db = await open({
      filename: './bets.db',
      driver: sqlite3.Database
    });

    // Tabla de predicciones
    await db.exec(`
      CREATE TABLE IF NOT EXISTS predicciones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
        deporte TEXT,
        liga TEXT,
        evento TEXT,
        equipo_jugador TEXT,
        tipo_apuesta TEXT,
        odds REAL,
        probabilidad_estimada REAL,
        ev REAL,
        kelly_percentage REAL,
        score NUMERIC,
        estado TEXT DEFAULT 'pendiente',
        resultado TEXT,
        ganancia_perdida REAL,
        fecha_evento DATETIME,
        data_json TEXT
      )
    `);

    // Tabla de seguimiento de créditos
    await db.exec(`
      CREATE TABLE IF NOT EXISTS uso_creditos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
        endpoint TEXT,
        creditos_usados INTEGER,
        deporte TEXT,
        region TEXT,
        respuesta_exitosa BOOLEAN
      )
    `);

    // Tabla de mensajes enviados a Telegram
    await db.exec(`
      CREATE TABLE IF NOT EXISTS telegram_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
        mensaje TEXT,
        chat_id TEXT,
        exitoso BOOLEAN,
        error_mensaje TEXT
      )
    `);

    // Tabla de estadísticas diarias
    await db.exec(`
      CREATE TABLE IF NOT EXISTS estadisticas_diarias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha DATE UNIQUE,
        total_predicciones INTEGER DEFAULT 0,
        predicciones_ganadas INTEGER DEFAULT 0,
        predicciones_perdidas INTEGER DEFAULT 0,
        ganancia_neta REAL DEFAULT 0,
        roi_diario REAL,
        ev_promedio REAL,
        creditos_usados INTEGER DEFAULT 0
      )
    `);

    console.log('✅ Base de datos inicializada');
    return db;
  } catch (error) {
    console.error('❌ Error inicializando BD:', error);
    throw error;
  }
}

export async function guardarPrediccion(prediccion) {
  try {
    const result = await db.run(
      `INSERT INTO predicciones (
        deporte, liga, evento, equipo_jugador, tipo_apuesta, 
        odds, probabilidad_estimada, ev, kelly_percentage, score,
        fecha_evento, data_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        prediccion.deporte,
        prediccion.liga,
        prediccion.evento,
        prediccion.equipoJugador,
        prediccion.tipoApuesta,
        prediccion.odds,
        prediccion.probabilidad,
        prediccion.ev,
        prediccion.kelly,
        prediccion.score,
        prediccion.fechaEvento,
        JSON.stringify(prediccion)
      ]
    );
    return result.lastID;
  } catch (error) {
    console.error('❌ Error guardando predicción:', error);
  }
}

export async function actualizarResultado(prediccionId, resultado, ganancia) {
  try {
    await db.run(
      `UPDATE predicciones 
       SET estado = 'finalizado', resultado = ?, ganancia_perdida = ?
       WHERE id = ?`,
      [resultado, ganancia, prediccionId]
    );
  } catch (error) {
    console.error('❌ Error actualizando resultado:', error);
  }
}

export async function registrarUsoCréditos(creditos, endpoint, deporte, region, exitoso) {
  try {
    await db.run(
      `INSERT INTO uso_creditos (endpoint, creditos_usados, deporte, region, respuesta_exitosa)
       VALUES (?, ?, ?, ?, ?)`,
      [endpoint, creditos, deporte, region, exitoso]
    );
  } catch (error) {
    console.error('❌ Error registrando créditos:', error);
  }
}

export async function obtenerTotalCréditos(últimosDías = 30) {
  try {
    const result = await db.get(
      `SELECT SUM(creditos_usados) as total FROM uso_creditos 
       WHERE fecha >= datetime('now', '-${últimosDías} days')`
    );
    return result.total || 0;
  } catch (error) {
    console.error('❌ Error obteniendo créditos:', error);
    return 0;
  }
}

export async function obtenerPredicciones(filtro = {}) {
  try {
    let query = 'SELECT * FROM predicciones WHERE 1=1';
    const params = [];

    if (filtro.estado) {
      query += ' AND estado = ?';
      params.push(filtro.estado);
    }

    if (filtro.deporte) {
      query += ' AND deporte = ?';
      params.push(filtro.deporte);
    }

    if (filtro.dias) {
      query += ` AND fecha_creacion >= datetime('now', '-${filtro.dias} days')`;
    }

    query += ' ORDER BY fecha_creacion DESC LIMIT 100';
    return await db.all(query, params);
  } catch (error) {
    console.error('❌ Error obteniendo predicciones:', error);
    return [];
  }
}

export async function calcularEstadísticas(fecha) {
  try {
    const predicciones = await db.all(
      `SELECT * FROM predicciones 
       WHERE DATE(fecha_creacion) = ? AND estado = 'finalizado'`,
      [fecha]
    );

    const ganadas = predicciones.filter(p => p.resultado === 'ganada').length;
    const perdidas = predicciones.filter(p => p.resultado === 'perdida').length;
    const gananciaNeta = predicciones.reduce((sum, p) => sum + (p.ganancia_perdida || 0), 0);
    const evPromedio = predicciones.reduce((sum, p) => sum + (p.ev || 0), 0) / predicciones.length;

    const stats = {
      total_predicciones: predicciones.length,
      predicciones_ganadas: ganadas,
      predicciones_perdidas: perdidas,
      ganancia_neta: gananciaNeta,
      roi_diario: gananciaNeta,
      ev_promedio: evPromedio
    };

    return stats;
  } catch (error) {
    console.error('❌ Error calculando estadísticas:', error);
    return null;
  }
}

export async function obtenerEstadísticasSemanales() {
  try {
    const result = await db.all(
      `SELECT 
        fecha,
        total_predicciones,
        predicciones_ganadas,
        (predicciones_ganadas * 100.0 / total_predicciones) as win_rate,
        ganancia_neta,
        roi_diario,
        ev_promedio
       FROM estadisticas_diarias
       WHERE fecha >= date('now', '-7 days')
       ORDER BY fecha DESC`
    );
    return result;
  } catch (error) {
    console.error('❌ Error obteniendo estadísticas semanales:', error);
    return [];
  }
}

export async function obtenerEventosRecientes(dias = 3) {
  try {
    const fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() - dias);
    
    const result = await db.all(
      `SELECT 
        evento,
        equipo_jugador,
        fecha_evento,
        odds
       FROM predicciones
       WHERE fecha_creacion >= ?
       AND estado != 'cancelado'
       ORDER BY fecha_creacion DESC`,
      [fechaLimite.toISOString()]
    );
    
    return result || [];
  } catch (error) {
    console.error('❌ Error obteniendo eventos recientes:', error);
    return [];
  }
}

export async function getDB() {
  if (!db) {
    await inicializarDB();
  }
  return db;
}

export default {
  inicializarDB,
  guardarPrediccion,
  actualizarResultado,
  registrarUsoCréditos,
  obtenerTotalCréditos,
  obtenerPredicciones,
  calcularEstadísticas,
  obtenerEstadísticasSemanales,
  obtenerEventosRecientes,
  getDB
};
