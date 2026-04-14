# 🎯 DORADOBET + BET365 - PRIORIZACIÓN

Bot ahora prioriza estas casas y te avisa si están disponibles.

---

## Por Qué Estas Casas

| Casa | Ventajas | Desventajas |
|------|----------|-------------|
| **Doradobet** | ✅ Enfocada en Latinoamérica (CRC) | ⚠️ Odds a veces menores |
| **Bet365** | ✅ Mejor línea del mercado, confiable | ✅ Disponible casi siempre |

**Estrategia:** Usar estas cuando estén disponibles, comparar con otras si no.

---

## Cómo Funciona

### 1. Bot Analiza Todas las Casas
```
The Odds API devuelve 40+ bookmakers por evento
```

### 2. Detecta Doradobet + Bet365
```
✅ Si está disponible en AMBAS
   → +15 puntos al score (bonus por seguridad)
   
⚠️ Si está en UNA de las dos
   → +10 puntos al score
   
❌ Si NO está en ninguna
   → Sin bonus, pero sigue siendo válida
```

### 3. Muestra en Telegram

**Mejor caso (en ambas):**
```
✅ Disponible en: Bet365 + Doradobet
💵 Apuesta: ₡725
```

**Caso alternativo:**
```
⚠️ No disponible en Doradobet/Bet365 
(5 casas alternativas disponibles)
💵 Apuesta: ₡580
```

---

## Ejemplo Práctico

### Evento: Liverpool vs Brighton

```
Odds mercado promedio: 1.65
Odds Bet365: 1.68
Odds Doradobet: 1.67
Odds casas menores: 1.62

EV = +4%
Score base = 75
Score con bonus (ambas casas) = 90 ⭐

Resultado:
✅ Disponible en: Bet365 + Doradobet
💵 Apuesta: ₡725 CRC
```

---

## Configuración

En `.env`:
```env
# El bot automáticamente busca estas casas
# No necesitas configurar nada
# Siempre prioriza Doradobet y Bet365
```

En código (si necesitas cambiar):
```javascript
// En bookmakers.js
const TARGET_BOOKMAKERS = ['bet365', 'doradobet'];
// Puedes agregar más casas aquí
```

---

## Ventajas

✅ **Seguridad:** Casas confiables y reguladas  
✅ **Línea mejor:** Doradobet enfocada en Latinoamérica  
✅ **Tracking fácil:** Menos casas diferentes para seguir  
✅ **Bonus de score:** Apuestas en estas casas tienen + confianza  

---

## Flujo de Decisión

```
┌─────────────────────────────────────┐
│ Bot analiza evento                  │
└────────────┬────────────────────────┘
             │
      ┌──────▼──────┐
      │ ¿Está en    │
      │ Doradobet?  │
      └──┬───────┬──┘
         │       │
        Sí      No
         │       │
    ┌────▼──┐ ┌─▼────────────┐
    │+10pts │ │¿Está en      │
    │score  │ │Bet365?       │
    └───────┘ └─┬────────┬───┘
                │        │
               Sí       No
                │        │
           ┌────▼──┐ ┌───▼──────────┐
           │+15pts │ │Otras casas   │
           │score  │ │Sin bonus     │
           │(🔥)   │ │(⚠️)          │
           └───────┘ └──────────────┘
                │
           ┌────▼──────────────────┐
           │ Mostrar en Telegram   │
           │ con disponibilidad    │
           └───────────────────────┘
```

---

## Casos Especiales

### Caso 1: Solo Bet365
```
EV: +3%
Disponible: Bet365
Acción: ✅ Apostar (+10 bonus)
```

### Caso 2: Solo Doradobet
```
EV: +3%
Disponible: Doradobet
Acción: ✅ Apostar (+10 bonus)
```

### Caso 3: Ambas
```
EV: +3%
Disponible: Bet365 + Doradobet
Acción: ✅✅ EXCELENTE (+15 bonus)
```

### Caso 4: Ni una ni otra
```
EV: +5%
Disponible: 6 casas alternativas
Acción: ⚠️ Considerar (sin bonus)
Recomendación: Ir a casa alternativa si EV es muy alto
```

---

## Monitoreo

### En Telegram, verás:

```
APUESTA 1: ⚽ EPL
Liverpool vs Brighton

✅ Disponible en: Bet365 + Doradobet
💵 Apuesta: ₡725 CRC 🟢 Bajo
💪 Confianza: 🔥 ALTA (Score: 90)

APUESTA 2: 🏀 NBA
Lakers vs Celtics

⚠️ No disponible en Doradobet/Bet365
   (4 casas alternativas)
💵 Apuesta: ₡450 CRC 🟡 Medio
💪 Confianza: ⚡ MEDIA (Score: 65)
```

---

## FAQ

**P: ¿Qué pasa si Bet365 tiene odds muy bajos?**
A: Bot prioriza, pero si hay mejor valor en otra casa, la usa igualmente.

**P: ¿Puedo cambiar las casas prioritarias?**
A: Sí, en `bookmakers.js` línea de TARGET_BOOKMAKERS.

**P: ¿Qué si Doradobet no está disponible para un evento?**
A: El bot automáticamente usa Bet365 u otras casas, sin problema.

**P: ¿El bonus de score afecta cuánto apostar?**
A: No, solo afecta el ranking (qué apuestas recomienda primero).

---

**Resumen:** Bot ahora te muestra cuáles apuestas están en Doradobet/Bet365 ✅

