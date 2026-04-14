# 💰 GESTIÓN DE BANKROLL & KELLY CRITERION

## Tu Setup: ₡10,000 (~$20 USD)

```
Bankroll Inicial: ₡10,000 CRC
Objetivo: +5-10% mensual
Estrategia: Kelly Criterion 25% (muy conservador)
```

---

## Ejemplo Práctico

### Apuesta 1: Liverpool (Odds 1.65)

```
Bankroll actual: ₡10,000
Probabilidad estimada: 60%
Odds mejores: 1.65

✅ EV: +4% (bueno)
✅ Score: 75/100 (alta confianza)

Kelly Criterion cálculo:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
f* = (bp - q) / b

b = 1.65 - 1 = 0.65
p = 0.60
q = 0.40

f = (0.65 × 0.60 - 0.40) / 0.65
f = 0.19 / 0.65 = 0.29 = 29%

Kelly 25% fraccionado:
0.29 × 0.25 = 0.0725 = 7.25%

APUESTA RECOMENDADA:
₡10,000 × 7.25% = ₡725
```

### Resultados Posibles

**Si GANAS:**
```
Ganancia: ₡725 × (1.65 - 1) = ₡472.50
Nuevo bankroll: ₡10,472.50
ROI: +4.7%
```

**Si PIERDES:**
```
Pérdida: -₡725
Nuevo bankroll: ₡9,275
ROI: -7.25%
```

---

## Por Qué Kelly Criterion

### Sin Kelly (apostar todo):
```
Ganas 1, pierdes 1 → Bankroll: $0 (RUINA)
```

### Con Kelly 100%:
```
Ganas 1: +29% = ₡12,900
Pierdes 1: -29% = ₡9,100
Ganas 2: +37% = ₡17,652
Pierdes 2: -37% = ₡5,712
```

### Con Kelly 25% (nuestro caso):
```
Ganas 5: ₡10,000 → ₡10,376 → ₡10,760 → ₡11,151 → ₡11,550 → ₡11,957
Pierdes 2: -₡363 = ₡11,594
Muy estable, sin riesgo de ruina
```

---

## Tabla de Apuestas por Confianza

**Basado en: Bankroll ₡10,000**

| Score | Prob | Odds | EV | Kelly % | Apuesta | Si Ganas | Si Pierdes |
|-------|------|------|----|---------|---------|-----------|----|
| 80 | 65% | 1.80 | +8% | 12.75% | ₡1,275 | +₡1,148 | -₡1,275 |
| 75 | 60% | 1.65 | +4% | 7.25% | ₡725 | +₡472 | -₡725 |
| 70 | 55% | 1.55 | +2.5% | 3.25% | ₡325 | +₡178 | -₡325 |
| 60 | 52% | 1.45 | +1.6% | 1.2% | ₡120 | +₡54 | -₡120 |

---

## Reglas de Oro

### ✅ HACER

1. **Apostar máximo 5% por evento**
   ```
   ₡10,000 × 5% = ₡500 máximo
   ```

2. **Respetar Kelly Criterion**
   ```
   Si Kelly dice 12%, apostar 12%
   No apostar menos (desperdicias edge)
   ```

3. **Registrar TODO**
   ```
   - Apuesta
   - Odds
   - Resultado
   - Ganancia/Pérdida
   ```

4. **Diversificar**
   ```
   En lugar de 1 apuesta de ₡500
   Mejor 5 apuestas de ₡100
   Reduce varianza
   ```

### ❌ NO HACER

1. **Ignorar Kelly Criterion**
   - Llevas a ruina rápidamente

2. **Perseguir pérdidas**
   - Es cómo pierden los principiantes

3. **Aumentar apuestas después de ganar**
   - Kelly ya lo hace automáticamente

4. **Cambiar de estrategia constantemente**
   - Necesitas 50+ eventos para validar

---

## Proyecciones (Realistas)

### Mes 1: Testing

```
50 apuestas × 52% win rate = 26 ganancias, 24 pérdidas
EV promedio: +3%
ROI esperado: +5%

₡10,000 → ₡10,500
```

### Mes 2: Si Win Rate > 52%

```
Mantener estrategia
Seguir apostando 5% máximo por evento
₡10,500 → ₡11,025
```

### Mes 3+: Escalado Gradual

```
Si Win Rate mantiene > 53%
Puedes aumentar a 10% por evento
Pero SOLO si tienes 100+ eventos validados
```

---

## Monedas Soportadas

### En tu .env:

```env
# USD (dólares)
BANKROLL_INICIAL=20
MONEDA=USD

# CRC (colones costarricenses)
BANKROLL_INICIAL=10000
MONEDA=CRC

# EUR (euros)
BANKROLL_INICIAL=18.50
MONEDA=EUR
```

El bot automáticamente:
- Usa símbolo correcto ($ ₡ €)
- Ajusta apuestas mínimas (USD: $1, CRC: ₡100)
- Muestra en Telegram con formato correcto

---

## Cálculo Automático

El bot hace TODO esto por ti:

1. ✅ Obtiene odds de múltiples casas
2. ✅ Calcula probabilidad implícita
3. ✅ Verifica EV > 2%
4. ✅ Aplica Kelly 25%
5. ✅ Respeta máximo 5% por evento
6. ✅ Redondea a unidad mínima
7. ✅ Muestra en Telegram:
   - Cuánto apostar
   - Si ganas, qué ganas
   - Si pierdes, qué pierdes
   - Nivel de riesgo

---

## Ejemplo Telegram

```
💵 APUESTA RECOMENDADA:
   → ₡725 CRC 🟢 Bajo
   → Si ganas: ₡1,197.50
   → Si pierdes: -₡725

📋 RESUMEN:
💳 Total a apostar: ₡3,450
📊 Bankroll disponible: ₡10,000
📈 % de bankroll: 34.5%
```

---

## FAQ

**P: ¿Debo apostar siempre el máximo calculado?**
A: No. Puedes apostar menos para ser más conservador. Nunca más.

**P: ¿Qué pasa si pierdo muchas seguidas?**
A: Kelly automáticamente reduce apuestas cuando pierdes, protegiéndote de ruina.

**P: ¿Puedo apostar en múltiples eventos?**
A: Sí, el bot te muestra top 10. Diversificar es mejor que apostar todo en 1.

**P: ¿Cuándo cambio de moneda/bankroll?**
A: En .env. Reinicia el bot y automáticamente usa los nuevos valores.

---

**Recuerda:** Con Kelly Criterion 25% + Win Rate > 52% + EV positivo = Ganador a largo plazo 📈

