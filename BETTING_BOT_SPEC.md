# Bot de Apuestas - Especificación Técnica

## 1. DEPORTES & SPORT KEYS

| Deporte | Sport Key | Mercados |
|---------|-----------|----------|
| Fútbol - EPL | soccer_epl | h2h, spreads |
| Fútbol - La Liga | soccer_la_liga | h2h, spreads |
| Fútbol - Serie A | soccer_serie_a | h2h, spreads |
| Basketball - NBA | basketball_nba | h2h, spreads |
| Basketball - Euroleague | basketball_euroleague | h2h, spreads |
| Tennis - ATP | tennis_atp | h2h |
| Tennis - WTA | tennis_wta | h2h |

## 2. REGIONES

| Región | Código | Tipo | Bookmakers Conocidos |
|--------|--------|------|----------------------|
| US | us | **Conocida** | DraftKings, FanDuel, Bet365 |
| UK | uk | **Conocida** | Sky Bet, Ladbrokes, William Hill |
| EUROPA | eu | Menos conocida | Betfair, Unibet, Bwin |
| AUSTRALIA | au | Menos conocida | Sportsbet, TAB, Neds |

**Estrategia**: Enfoque primario en EU/AU (menos conocidas) con comparativo ocasional en US/UK.

## 3. CÁLCULO DE PROBABILIDADES Y SELECCIÓN

### Fórmula: Probabilidad Implícita
```
Para odds decimales:
Probabilidad % = (1 / odds) × 100

Ejemplo:
- Odds 1.50 = 66.7% de ganar
- Odds 2.50 = 40% de ganar
- Odds 3.00 = 33.3% de ganar
```

### Criterios de Selección (Apuestas "Favoritas" = Mayor Probabilidad)

**Filtros automáticos:**
1. Odds entre 1.3 - 2.5 (Probabilidad 40-77%)
2. Diferencia de odds >10% entre bookmakers (variación útil)
3. Equipos/jugadores favoritos: odds decimales <2.0
4. Eliminará outliers (odds <1.10 o >5.0)

## 4. EXPLICACIÓN DE APUESTAS (Lógica)

Cada recomendación incluye:

```
📊 [Deporte] - [Liga]
🎯 Apuesta: [Equipo/Jugador]
💰 Odds: [Decimal] (Prob: X%)
📈 Razón:

- Favorito en mercado (odds: 1.XX)
- Diferencial de 15% respecto casas rivales
- Consenso: 3/5 bookmakers al mismo precio
- ROI esperado: +8% en promedio
```

## 5. ARQUITECTURA BOT

```
GitHub Actions (scheduled)
    ↓
Node.js Script
    ├─ Fetch API (The Odds API)
    ├─ Análisis & Filtros
    ├─ Base datos (SQL local)
    └─ Envío Telegram
    ↓
Telegram Bot (@TuBotNombre)
```

## 6. CRÉDITOS - OPTIMIZACIÓN

**Llamadas por ejecución (5 min):**
- 4 deportes × 2 regiones = 8 créditos
- **Frecuencia: cada 30 min = 16 créditos/hora**
- **Diario: 384 créditos (máximo recomendado)**

**Tu plan (500 créditos):**
- ✅ 1-2 ejecuciones/día = 16-32 créditos/día
- ✅ Dura 15-30 días en testing

**Plan recomendado tras testing:** Pro ($20-30/mes) = 10k créditos

## 7. VARIABLES DE ENTORNO

```
ODDS_API_KEY=tu_api_key
TELEGRAM_BOT_TOKEN=tu_bot_token
TELEGRAM_CHAT_ID=tu_chat_id
DB_PATH=./bets.db
REGIONS=eu,au,us
SPORTS=soccer_epl,soccer_la_liga,basketball_nba,tennis_atp
LOG_FILE=./bot.log
```

## 8. FLUJO DATOS

```
1. Consulta API → 4 deportes × 2 regiones
2. Extrae odds para h2h + spreads
3. Calcula probabilidades
4. Filtra favoritos (odds 1.3-2.5)
5. Busca variaciones entre bookmakers
6. Genera explicación automática
7. Registra en BD
8. Envía a Telegram con formato
9. Log de uso de créditos
```

## 9. MENSAJE TELEGRAM

```
⚽ RECOMENDACIONES - 14/04/2026 14:30

1️⃣ FÚTBOL (EPL) - Liverpool vs Brighton
   🎯 Liverpool Win
   💵 Odds: 1.65 | Prob: 60%
   ✅ Favorito: 1.65 vs 1.72 (promedio)
   📊 Diferencial: +4% vs competencia
   🔥 ROI esperado: +6%

2️⃣ BASKETBALL (NBA) - Lakers vs Celtics
   🎯 Lakers Spread (-5.5)
   💵 Odds: 1.90 | Prob: 53%
   ✅ Odds mejores en DK vs FD
   📊 Línea estable últimas 2h
   🔥 ROI esperado: +2%

[Uso API]: 16/500 créditos (96% disponible)
[Próxima scan]: 14:35 UTC
```

## 10. PRÓXIMOS PASOS

1. ✅ Crear archivo de configuración (.env)
2. ✅ Script Node.js con lógica principal
3. ✅ Integración Telegram
4. ✅ Base de datos SQLite
5. ✅ GitHub Actions workflow
6. ✅ Documentación de deployment

