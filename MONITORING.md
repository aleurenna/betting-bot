# 📊 GUÍA: Monitoreo & Análisis de Datos

Base de datos SQLite (`bets.db`) para tracking de apuestas y resultados.

---

## 🔍 Consultas Útiles

### 1. Últimas 10 predicciones

```sql
SELECT 
  fecha_creacion,
  deporte,
  evento,
  equipo_jugador,
  odds,
  ROUND(ev, 2) as ev_pct,
  ROUND(kelly_percentage, 2) as kelly_pct,
  score,
  estado
FROM predicciones
ORDER BY fecha_creacion DESC
LIMIT 10;
```

### 2. Win Rate (últimos 7 días)

```sql
SELECT 
  COUNT(*) as total_predicciones,
  SUM(CASE WHEN resultado = 'ganada' THEN 1 ELSE 0 END) as ganadas,
  SUM(CASE WHEN resultado = 'perdida' THEN 1 ELSE 0 END) as perdidas,
  ROUND(100.0 * SUM(CASE WHEN resultado = 'ganada' THEN 1 ELSE 0 END) / COUNT(*), 2) as win_rate_pct
FROM predicciones
WHERE estado = 'finalizado'
AND fecha_creacion >= datetime('now', '-7 days');
```

### 3. ROI por deporte

```sql
SELECT 
  deporte,
  COUNT(*) as predicciones,
  SUM(CASE WHEN resultado = 'ganada' THEN 1 ELSE 0 END) as ganadas,
  ROUND(SUM(ganancia_perdida), 2) as ganancia_total,
  ROUND(AVG(ev), 2) as ev_promedio,
  ROUND(STDEV(ganancia_perdida), 2) as desviacion_estandar
FROM predicciones
WHERE estado = 'finalizado'
GROUP BY deporte
ORDER BY ganancia_total DESC;
```

### 4. EV Esperado vs Resultados Reales

```sql
SELECT 
  ROUND(ev, 1) as ev_rango,
  COUNT(*) as predicciones,
  SUM(CASE WHEN resultado = 'ganada' THEN 1 ELSE 0 END) as ganadas,
  ROUND(100.0 * SUM(CASE WHEN resultado = 'ganada' THEN 1 ELSE 0 END) / COUNT(*), 2) as win_rate_real,
  ROUND(AVG(ganancia_perdida), 2) as roi_promedio
FROM predicciones
WHERE estado = 'finalizado'
GROUP BY ROUND(ev, 1)
ORDER BY ev DESC;
```

### 5. Apuestas de mayor score (mejor confianza)

```sql
SELECT 
  fecha_creacion,
  evento,
  equipo_jugador,
  odds,
  ROUND(score, 0) as confianza,
  resultado,
  ROUND(ganancia_perdida, 2) as resultado_financiero
FROM predicciones
ORDER BY score DESC
LIMIT 20;
```

### 6. Uso de créditos por día

```sql
SELECT 
  DATE(fecha) as fecha,
  COUNT(*) as llamadas_api,
  SUM(creditos_usados) as creditos_diarios,
  SUM(CASE WHEN respuesta_exitosa = 1 THEN 1 ELSE 0 END) as exitosas,
  SUM(CASE WHEN respuesta_exitosa = 0 THEN 1 ELSE 0 END) as fallidas
FROM uso_creditos
WHERE fecha >= datetime('now', '-30 days')
GROUP BY DATE(fecha)
ORDER BY fecha DESC;
```

### 7. Predicciones pendientes (no resueltas)

```sql
SELECT 
  fecha_creacion,
  deporte,
  evento,
  equipo_jugador,
  odds,
  ROUND(ev, 2) as ev_pct,
  ROUND(kelly_percentage, 2) as kelly_pct,
  ROUND(score, 0) as confianza
FROM predicciones
WHERE estado = 'pendiente'
ORDER BY fecha_evento ASC;
```

### 8. Análisis de Kelly Criterion

```sql
SELECT 
  ROUND(kelly_percentage, 2) as kelly_pct,
  COUNT(*) as predicciones,
  SUM(CASE WHEN resultado = 'ganada' THEN 1 ELSE 0 END) as ganadas,
  ROUND(AVG(ganancia_perdida), 2) as roi_promedio
FROM predicciones
WHERE estado = 'finalizado'
GROUP BY ROUND(kelly_percentage, 2)
ORDER BY kelly_pct DESC;
```

### 9. Comparar odds reales vs predichas

```sql
SELECT 
  evento,
  equipo_jugador,
  odds as odds_mejor_disponible,
  probabilidad_estimada,
  ROUND(ev, 2) as ev,
  resultado,
  ganancia_perdida
FROM predicciones
WHERE estado = 'finalizado'
ORDER BY fecha_creacion DESC
LIMIT 20;
```

### 10. Performance mensual

```sql
SELECT 
  strftime('%Y-%m', fecha_creacion) as mes,
  COUNT(*) as predicciones,
  SUM(CASE WHEN resultado = 'ganada' THEN 1 ELSE 0 END) as ganadas,
  ROUND(100.0 * SUM(CASE WHEN resultado = 'ganada' THEN 1 ELSE 0 END) / COUNT(*), 2) as win_rate,
  ROUND(SUM(ganancia_perdida), 2) as ganancia_neta,
  SUM(creditos_usados) as creditos_usados
FROM predicciones
LEFT JOIN uso_creditos ON DATE(predicciones.fecha_creacion) = DATE(uso_creditos.fecha)
WHERE estado = 'finalizado'
GROUP BY strftime('%Y-%m', fecha_creacion)
ORDER BY mes DESC;
```

---

## 🚀 Ejecutar Consultas

### Desde terminal:

```bash
# Instalar sqlite3 si no lo tienes
# macOS: brew install sqlite3
# Ubuntu: sudo apt-get install sqlite3

# Abrir BD
sqlite3 bets.db

# Adentro, ejecutar:
.mode column
.headers on
SELECT * FROM predicciones LIMIT 5;
```

### Desde Node.js:

```javascript
import * as db from './database.js';

// Obtener predicciones filtradas
const predictions = await db.obtenerPredicciones({ dias: 7, estado: 'finalizado' });
console.log(predictions);

// Obtener créditos usados
const creditos = await db.obtenerTotalCréditos(30);
console.log(`Créditos últimos 30 días: ${creditos}`);

// Estadísticas semanales
const stats = await db.obtenerEstadísticasSemanales();
console.log(stats);
```

---

## 📈 KPIs Clave

**Seguir estas métricas:**

| Métrica | Objetivo | Frecuencia |
|---------|----------|-----------|
| Win Rate | > 52% | Semanal |
| EV Promedio | > 2.5% | Diario |
| Kelly % | 0.5% - 3% | Por apuesta |
| ROI Mensual | > 5% | Mensual |
| Score Promedio | > 60 | Diario |
| Créditos/Día | < 100 | Diario |

---

## ⚠️ Red Flags

Si observas:
- ❌ Win Rate < 48% en 50+ eventos
- ❌ ROI negativo 2 semanas seguidas
- ❌ EV promedio < 1%
- ❌ Score promedio bajando

**Acción:** Pausa bot, revisa cálculos, recalibra.

---

## 💾 Backup

```bash
# Crear backup mensual
cp bets.db bets_backup_$(date +%Y%m%d).db

# Exportar a CSV
sqlite3 -header -csv bets.db "SELECT * FROM predicciones;" > predicciones.csv
```

---

**Recuerda:** Los datos son tu mejor herramienta para mejorar 📊
