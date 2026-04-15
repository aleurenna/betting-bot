/**
 * Módulo Google Sheets — Registro automático de picks
 * 
 * Setup:
 * 1. Crear proyecto en Google Cloud Console
 * 2. Habilitar Google Sheets API
 * 3. Crear Service Account → descargar JSON
 * 4. Compartir spreadsheet con el email del service account
 * 5. Guardar credenciales como secret en GitHub
 * 
 * Env vars:
 *   GOOGLE_SHEETS_ID        → ID del spreadsheet
 *   GOOGLE_SERVICE_ACCOUNT  → JSON del service account (como string)
 */

import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID;
const HOJA_PICKS = 'PICKS';
const HOJA_METRICAS = 'METRICAS';

let sheetsClient = null;

// ─────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────

async function getClient() {
  if (sheetsClient) return sheetsClient;
  
  if (!SPREADSHEET_ID || !process.env.GOOGLE_SERVICE_ACCOUNT) {
    return null;
  }

  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    sheetsClient = google.sheets({ version: 'v4', auth });
    return sheetsClient;
  } catch (error) {
    console.error('❌ Sheets auth error:', error.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// INICIALIZAR HOJA (crear headers si no existen)
// ─────────────────────────────────────────────

async function inicializarHoja() {
  const sheets = await getClient();
  if (!sheets) return false;

  try {
    // Verificar si hoja PICKS existe
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID
    });

    const hojas = spreadsheet.data.sheets.map(s => s.properties.title);

    // Crear hoja PICKS si no existe
    if (!hojas.includes(HOJA_PICKS)) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [{ addSheet: { properties: { title: HOJA_PICKS } } }]
        }
      });

      // Headers
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${HOJA_PICKS}!A1:R1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[
            'Fecha', 'Fecha Evento', 'Liga', 'Deporte',
            'Evento', 'Pick', 'Tipo', 'Odds Open',
            'Odds Close', 'EV %', 'Prob %', 'Kelly %',
            'Score', 'Casa', 'Stake', 'Resultado',
            'Ganancia', 'CLV %'
          ]]
        }
      });

      // Fórmulas ARRAYFORMULA para Ganancia y CLV (se auto-extienden)
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${HOJA_PICKS}!Q2:R2`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[
            '=ARRAYFORMULA(IF(P2:P="ganada",O2:O*(H2:H-1),IF(P2:P="perdida",-O2:O,"")))',
            '=ARRAYFORMULA(IF(I2:I="","",(H2:H/I2:I)-1))'
          ]]
        }
      });

      console.log('✅ Sheets: hoja PICKS creada con fórmulas');
    }

    // Crear hoja METRICAS si no existe
    if (!hojas.includes(HOJA_METRICAS)) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [{ addSheet: { properties: { title: HOJA_METRICAS } } }]
        }
      });

      // Fórmulas auto-calculadas (usa "ganada"/"perdida" que es lo que escribe el bot)
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${HOJA_METRICAS}!A1:B12`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [
            ['Métrica', 'Valor'],
            ['Total Picks', '=COUNTA(PICKS!A2:A)'],
            ['Resueltos', '=COUNTIF(PICKS!P2:P,"<>")'],
            ['Ganados', '=COUNTIF(PICKS!P2:P,"ganada")'],
            ['Perdidos', '=COUNTIF(PICKS!P2:P,"perdida")'],
            ['Pendientes', '=COUNTIFS(PICKS!A2:A,"<>",PICKS!P2:P,"")'],
            ['Win Rate %', '=IFERROR(COUNTIF(PICKS!P2:P,"ganada")/COUNTIF(PICKS!P2:P,"<>"),0)'],
            ['EV Promedio %', '=IFERROR(AVERAGE(PICKS!J2:J),0)'],
            ['CLV Promedio %', '=IFERROR(AVERAGE(PICKS!R2:R),0)'],
            ['ROI', '=IFERROR(SUM(PICKS!Q2:Q)/SUM(PICKS!O2:O),0)'],
            ['Ganancia Total', '=SUM(PICKS!Q2:Q)'],
            ['Última actualización', '=NOW()']
          ]
        }
      });

      console.log('✅ Sheets: hoja METRICAS creada con fórmulas');
    }

    return true;
  } catch (error) {
    console.error('❌ Sheets init error:', error.message);
    return false;
  }
}

// ─────────────────────────────────────────────
// GUARDAR PICK
// ─────────────────────────────────────────────

/**
 * Guarda un pick en Google Sheets
 * No duplica (verifica match_id + equipo)
 */
export async function guardarPickEnSheets(pick) {
  const sheets = await getClient();
  if (!sheets) return false;

  try {
    // Verificar duplicados
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${HOJA_PICKS}!E:F`  // Evento + Pick
    });

    const filas = existing.data.values || [];
    const yaExiste = filas.some(fila => 
      fila[0] === pick.evento && fila[1] === pick.equipo
    );

    if (yaExiste) {
      return false; // No duplicar
    }

    const ahora = new Date().toLocaleString('es-CR');
    const fechaEvento = pick.fechaEvento
      ? new Date(pick.fechaEvento).toLocaleString('es-CR')
      : '';

    // Solo columnas A-P. Q (Ganancia) y R (CLV) los maneja ARRAYFORMULA
    const fila = [
      ahora,                                          // A: Fecha registro
      fechaEvento,                                     // B: Fecha evento
      pick.liga || '',                                 // C: Liga
      pick.deporte || '',                              // D: Deporte
      pick.evento || '',                               // E: Evento
      pick.equipo || '',                               // F: Pick
      pick.tipo || '',                                 // G: Tipo
      parseFloat(pick.odds) || 0,                      // H: Odds Open
      '',                                              // I: Odds Close (se llena después)
      parseFloat(pick.ev) || 0,                        // J: EV %
      parseFloat(pick.probabilidad) || 0,              // K: Prob %
      parseFloat(pick.kelly) || 0,                     // L: Kelly %
      parseInt(pick.score) || 0,                       // M: Score
      pick.mejorBookmaker || pick.bookmaker || '',      // N: Casa
      parseFloat(pick.apuesta) || 0,                   // O: Stake
      ''                                               // P: Resultado (manual)
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${HOJA_PICKS}!A:P`,  // Solo hasta P, no tocar Q ni R
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [fila] }
    });

    return true;
  } catch (error) {
    console.error('❌ Sheets guardar error:', error.message);
    return false;
  }
}

// ─────────────────────────────────────────────
// ACTUALIZAR RESULTADO + CLOSING ODDS
// ─────────────────────────────────────────────

/**
 * Actualiza closing odds y resultado en Sheets
 */
export async function actualizarPickEnSheets(evento, equipo, updates) {
  const sheets = await getClient();
  if (!sheets) return false;

  try {
    const data = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${HOJA_PICKS}!A:R`
    });

    const filas = data.data.values || [];
    let filaIndex = -1;

    for (let i = 1; i < filas.length; i++) {
      if (filas[i][4] === evento && filas[i][5] === equipo) {
        filaIndex = i + 1; // +1 porque Sheets es 1-indexed
        break;
      }
    }

    if (filaIndex === -1) return false;

    // Actualizar closing odds (columna I)
    if (updates.oddsClose !== undefined) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${HOJA_PICKS}!I${filaIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[updates.oddsClose]] }
      });
    }

    // Actualizar resultado (columna P)
    if (updates.resultado !== undefined) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${HOJA_PICKS}!P${filaIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[updates.resultado]] }
      });
    }

    return true;
  } catch (error) {
    console.error('❌ Sheets actualizar error:', error.message);
    return false;
  }
}

// ─────────────────────────────────────────────
// MÉTRICAS EN SHEETS
// ─────────────────────────────────────────────

export async function actualizarMetricasEnSheets(metricas) {
  const sheets = await getClient();
  if (!sheets || !metricas) return;

  try {
    // Solo asegurar que la hoja existe con fórmulas
    // Las fórmulas se auto-calculan, no sobrescribir
    await inicializarHoja();
    console.log('📊 Sheets: métricas auto-calculadas por fórmulas');
  } catch (error) {
    console.error('❌ Sheets métricas error:', error.message);
  }
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

async function contarFilas() {
  const sheets = await getClient();
  if (!sheets) return 0;

  try {
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${HOJA_PICKS}!A:A`
    });
    return (result.data.values || []).length;
  } catch (error) {
    return 0;
  }
}

/**
 * Guarda múltiples picks de una vez
 */
export async function guardarPicksEnSheets(picks) {
  if (!SPREADSHEET_ID || !process.env.GOOGLE_SERVICE_ACCOUNT) return;

  const ok = await inicializarHoja();
  if (!ok) return;

  let guardados = 0;
  for (const pick of picks) {
    const resultado = await guardarPickEnSheets(pick);
    if (resultado) guardados++;
  }

  if (guardados > 0) {
    console.log(`📊 Sheets: ${guardados} picks guardados`);
  }
}

export default {
  inicializarHoja,
  guardarPickEnSheets,
  guardarPicksEnSheets,
  actualizarPickEnSheets,
  actualizarMetricasEnSheets
};
