/**
 * Módulo de Base de Datos SQLite v2
 * Con soporte para CLV, resultados, y métricas
 */

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

let db = null;

export async function inicializarDB() {
  try {
    db = await open({
      filename: './bets.db',
      driver: sqlite3.Database
    });

    // Tabla principal de predicciones (con CLV)
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
        odds_close REAL,
        clv REAL,
        probabilidad_estimada REAL,
        ev REAL,
        kelly_percentage REAL,
        score NUMERIC,
        bookmaker TEXT,
        estado TEXT DEFAULT 'pendiente',
        resultado TEXT,
        ganancia_perdida REAL,
        fecha_evento DATETIME,
        data_json TEXT
      )
    `);

    // Migrar tablas existentes (agregar columnas si no existen)
    await migrarColumnas();

    // Tabla de créditos
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
        clv_promedio REAL,
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

/**
 * Migra columnas nuevas a tablas existentes (backward compatible)
 */
async function migrarColumnas() {
  const nuevasColumnas = [
    { tabla: 'predicciones', columna: 'odds_close', tipo: 'REAL' },
    { tabla: 'predicciones', columna: 'clv', tipo: 'REAL' },
    { tabla: 'predicciones', columna: 'bookmaker', tipo: 'TEXT' }
  ];

  for (const { tabla, columna, tipo } of nuevasColumnas) {
    try {
      await db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${tipo}`);
    } catch (e) {
      // Columna ya existe — ignorar
    }
  }
}

// ─────────────────────────────────────────────
// GUARDAR / ACTUALIZAR
// ─────────────────────────────────────────────

export async function guardarPrediccion(prediccion) {
  try {
    const result = await db.run(
      `INSERT INTO predicciones (
        deporte, liga, evento, equipo_jugador, tipo_apuesta,
        odds, probabilidad_estimada, ev, kelly_percentage, score,
        bookmaker, fecha_evento, data_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        prediccion.bookmaker || null,
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

export async function actualizarClosingOdds(prediccionId, oddsClose, clv) {
  try {
    await db.run(
      `UPDATE predicciones SET odds_close = ?, clv = ? WHERE id = ?`,
      [oddsClose, clv, prediccionId]
    );
  } catch (error) {
    console.error('❌ Error actualizando CLV:', error);
  }
}

// ─────────────────────────────────────────────
// QUERIES PARA TRACKING
// ─────────────────────────────────────────────

/**
 * Picks pendientes SIN closing odds (para CLV tracking)
 */
export async function obtenerPicksSinClosing() {
  try {
    return await db.all(
      `SELECT id, evento, equipo_jugador, odds, fecha_evento
       FROM predicciones
       WHERE odds_close IS NULL
       AND estado = 'pendiente'
       AND fecha_evento >= datetime('now', '-3 days')
       ORDER BY fecha_evento ASC`
    );
  } catch (error) {
    console.error('❌ Error obteniendo picks sin closing:', error);
    return [];
  }
}

/**
 * Picks pendientes de resultado (partido ya debió terminar)
 */
export async function obtenerPicksPendientesResultado() {
  try {
    return await db.all(
      `SELECT id, evento, equipo_jugador, deporte, odds, kelly_percentage, fecha_evento
       FROM predicciones
       WHERE estado = 'pendiente'
       AND fecha_evento <= datetime('now', '-2 hours')
       AND fecha_evento >= datetime('now', '-7 days')
       AND deporte LIKE 'soccer%'
       ORDER BY fecha_evento ASC`
    );
  } catch (error) {
    console.error('❌ Error obteniendo picks pendientes resultado:', error);
    return [];
  }
}

// ─────────────────────────────────────────────
// MÉTRICAS
// ─────────────────────────────────────────────

export async function obtenerMetricas() {
  try {
    const totalPicks = await db.get(`SELECT COUNT(*) as n FROM predicciones`);
    const resueltos = await db.get(
      `SELECT COUNT(*) as n FROM predicciones WHERE estado = 'finalizado'`
    );
    const ganados = await db.get(
      `SELECT COUNT(*) as n FROM predicciones WHERE resultado = 'W'`
    );
    const perdidos = await db.get(
      `SELECT COUNT(*) as n FROM predicciones WHERE resultado = 'L'`
    );
    const pendientes = await db.get(
      `SELECT COUNT(*) as n FROM predicciones WHERE estado = 'pendiente'`
    );
    const avgEV = await db.get(
      `SELECT AVG(ev) as avg FROM predicciones WHERE ev IS NOT NULL`
    );
    const avgCLV = await db.get(
      `SELECT AVG(clv) as avg FROM predicciones WHERE clv IS NOT NULL`
    );
    const gananciaTotal = await db.get(
      `SELECT SUM(ganancia_perdida) as total FROM predicciones WHERE estado = 'finalizado'`
    );

    const r = resueltos?.n || 0;
    const g = ganados?.n || 0;
    const p = perdidos?.n || 0;

    return {
      totalPicks: totalPicks?.n || 0,
      resueltos: r,
      ganados: g,
      perdidos: p,
      pendientes: pendientes?.n || 0,
      winRate: r > 0 ? (g / r) * 100 : 0,
      avgEV: avgEV?.avg || 0,        // ya está en % en la BD
      avgCLV: (avgCLV?.avg || 0) * 100, // CLV está en decimal (0.03 = 3%)
      roi: gananciaTotal?.total || 0,
      gananciaTotal: gananciaTotal?.total || 0
    };
  } catch (error) {
    console.error('❌ Error obteniendo métricas:', error);
    return { totalPicks: 0, resueltos: 0, ganados: 0, perdidos: 0, pendientes: 0, winRate: 0, avgEV: 0, avgCLV: 0, roi: 0 };
  }
}

/**
 * Métricas por liga (para bloqueo futuro)
 */
export async function obtenerMetricasPorLiga() {
  try {
    return await db.all(
      `SELECT 
        liga,
        COUNT(*) as picks,
        AVG(clv) as avg_clv,
        SUM(CASE WHEN resultado = 'W' THEN 1 ELSE 0 END) as ganadas,
        SUM(ganancia_perdida) as ganancia
       FROM predicciones
       WHERE estado = 'finalizado'
       GROUP BY liga
       HAVING picks >= 5
       ORDER BY avg_clv DESC`
    );
  } catch (error) {
    console.error('❌ Error métricas por liga:', error);
    return [];
  }
}

// ─────────────────────────────────────────────
// QUERIES EXISTENTES
// ─────────────────────────────────────────────

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

export async function obtenerTotalCréditos(días = 30) {
  try {
    const result = await db.get(
      `SELECT SUM(creditos_usados) as total FROM uso_creditos 
       WHERE fecha >= datetime('now', '-${días} days')`
    );
    return result?.total || 0;
  } catch (error) {
    return 0;
  }
}

export async function obtenerEventosRecientes(dias = 3) {
  try {
    const fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() - dias);
    
    return await db.all(
      `SELECT evento, equipo_jugador, fecha_evento, odds
       FROM predicciones
       WHERE fecha_creacion >= ?
       AND estado != 'cancelado'
       ORDER BY fecha_creacion DESC`,
      [fechaLimite.toISOString()]
    ) || [];
  } catch (error) {
    return [];
  }
}

export async function obtenerPredicciones(filtro = {}) {
  try {
    let query = 'SELECT * FROM predicciones WHERE 1=1';
    const params = [];

    if (filtro.estado) { query += ' AND estado = ?'; params.push(filtro.estado); }
    if (filtro.deporte) { query += ' AND deporte = ?'; params.push(filtro.deporte); }
    if (filtro.dias) { query += ` AND fecha_creacion >= datetime('now', '-${filtro.dias} days')`; }

    query += ' ORDER BY fecha_creacion DESC LIMIT 100';
    return await db.all(query, params);
  } catch (error) {
    return [];
  }
}

export async function obtenerEstadísticasSemanales() {
  try {
    return await db.all(
      `SELECT * FROM estadisticas_diarias
       WHERE fecha >= date('now', '-7 days')
       ORDER BY fecha DESC`
    ) || [];
  } catch (error) {
    return [];
  }
}

export async function getDB() {
  if (!db) await inicializarDB();
  return db;
}

export default {
  inicializarDB, guardarPrediccion, actualizarResultado, actualizarClosingOdds,
  obtenerPicksSinClosing, obtenerPicksPendientesResultado,
  obtenerMetricas, obtenerMetricasPorLiga,
  registrarUsoCréditos, obtenerTotalCréditos, obtenerEventosRecientes,
  obtenerPredicciones, obtenerEstadísticasSemanales, getDB
};
