# 🤖 BETTING BOT - EV+ Strategy

Bot automático de análisis de apuestas deportivas basado en **Expected Value (EV) positivo** y **Kelly Criterion**.

---

## 📋 Características

✅ **Análisis EV+ automático** - Solo recomienda apuestas con valor matemático  
✅ **Kelly Criterion** - Gestión óptima de bankroll  
✅ **Detección de arbitraje** - Identifica oportunidades de apuestas sin riesgo  
✅ **Multi-deporte** - Fútbol, Basketball, Tennis  
✅ **Multi-región** - EU, AU, US, UK  
✅ **Telegram integrado** - Alertas en tiempo real  
✅ **Histórico BD** - Tracking de predicciones vs resultados  
✅ **GitHub Actions** - Ejecución automática cada 30 min  

---

## ⚡ Quick Start

### 1️⃣ Clonar repositorio

```bash
git clone https://github.com/tuusuario/betting-bot.git
cd betting-bot
```

### 2️⃣ Instalar dependencias

```bash
npm install
```

### 3️⃣ Configurar Telegram Bot

```bash
# En Telegram: habla con @BotFather
/newbot
# Nombre: "BettingBot"
# Username: "betting_ev_bot" (o lo que quieras)
# Recibirás: TOKEN

# Luego obtén tu CHAT_ID:
# 1. Habla con tu bot
# 2. Ve a: https://api.telegram.org/botTOKEN/getUpdates
# 3. Busca "chat":{"id":123456}  <- ese es tu CHAT_ID
```

### 4️⃣ Crear archivo .env

```bash
cp .env.example .env
```

Editar `.env`:

```env
ODDS_API_KEY=afe72865019dcd02ea1a5c7690439fee
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
TELEGRAM_CHAT_ID=987654321
NODE_ENV=development
```

### 5️⃣ Ejecutar bot

**Local (testing):**
```bash
npm run dev
```

**Producción:**
```bash
npm start
```

---

## 🚀 Deploy en GitHub

### 1. Crear repositorio GitHub

```bash
git init
git add .
git commit -m "Initial commit - Betting Bot"
git branch -M main
git remote add origin https://github.com/tuusuario/betting-bot.git
git push -u origin main
```

### 2. Agregar Secrets

En GitHub → Settings → Secrets and variables → Actions

Agregar:
- `ODDS_API_KEY` = tu API key
- `TELEGRAM_BOT_TOKEN` = tu bot token
- `TELEGRAM_CHAT_ID` = tu chat ID

### 3. Verificar Workflow

GitHub → Actions → verás "Betting Bot - EV+ Analysis"

El bot se ejecutará automáticamente:
- Cada 30 min (Lun-Vie, 8am-11pm)
- Cada 30 min (Sáb-Dom, 10am-10pm)
- Manual cuando quieras

---

## 📊 Explicación de Métricas

### EV (Expected Value)
```
EV = (Probabilidad × Odds) - 1

Ejemplo:
- Odds: 2.0, Probabilidad real: 55%
- EV = (0.55 × 2.0) - 1 = 0.10 = +10% EV ✅
```

**Regla:** Solo apuestas con EV > 2%

### Kelly Criterion
```
f* = (bp - q) / b

Porcentaje óptimo de bankroll a apostar sin riesgo de ruina
Ejemplo: Si Kelly = 5%, apuestas 5 unidades de 100
```

**Regla:** Usar 25% de Kelly (Fractional Kelly) = más conservador

### Score (Confianza)
```
Combina:
- EV (máx 30 pts)
- Line Movement (máx 20 pts)
- Diferencial Odds (máx 20 pts)
- Forma reciente (máx 20 pts)
- Consenso casas (máx 10 pts)

Total: 0-100 (mayor = mejor oportunidad)
```

---

## 💾 Base de Datos

SQLite local (`bets.db`) almacena:

### Tabla: `predicciones`
- Cada apuesta recomendada
- Odds, EV, Kelly, Score
- Resultado final (ganada/perdida)
- ROI esperado vs actual

### Tabla: `uso_creditos`
- Registro de cada llamada API
- Créditos consumidos
- Éxito/error

### Tabla: `estadisticas_diarias`
- Win rate por día
- ROI diario
- EV promedio
- Total de créditos

---

## 📱 Ejemplo Mensaje Telegram

```
📊 RECOMENDACIONES DE APUESTAS
⏰ 14/04/2026 14:35:22

1. ⚽ EPL
🎯 Liverpool
🏟️ Liverpool vs Brighton
💰 Odds: 1.65 | Prob: 60%
📊 EV: +4% | Kelly: 1.2%
🎲 Consenso: 8 casas | Diferencial: +2.5%
💪 Confianza: 🔥 ALTA (Score: 78)

✅ Por qué apostar:
• EV Muy Bueno: +4% indica valor real
• Ligero Favorito: Probabilidad 60% es sólida
• Gran Consenso: 8 casas coinciden en línea
• Buenas Odds: Consigues 2.5% mejor que promedio
• Buena Oportunidad: Múltiples confirmaciones positivas
```

---

## 🎯 Estrategia Recomendada

### Fase 1: Testing (Semana 1-2)
- Ejecutar bot en `--dev` mode
- No apostar dinero real
- Registrar qué habría ganado/perdido
- Validar precisión de cálculos

### Fase 2: Small Stakes (Semana 3-4)
- Apostar 1-2% de bankroll por evento
- Kelly Criterion: 25% fractional
- Mínimo EV: 2%
- Mínimo Score: 50

### Fase 3: Scaling (Mes 2+)
- Si Win Rate > 55% en 50+ eventos
- Aumentar a 2-5% por evento
- Ajustar Kelly fraction según resultados
- Diversificar regiones/deportes

---

## ⚠️ Riesgos & Disclaimers

- **Varianza:** Edge del 2-5% toma 100+ eventos para estabilizarse
- **No garantía:** Incluso con EV+, perderás apuestas
- **Línea viva:** Odds cambian constantemente
- **Cierre de cuentas:** Casas pueden limitar/cerrar ganadores consistentes

---

## 🔧 Troubleshooting

### Error: "API key inválida"
```bash
# Verificar en: https://the-odds-api.com/accounts/login
# Copiar API key exacto y pegar en .env
```

### Error: "Telegram no envía"
```bash
# Verificar TOKEN y CHAT_ID
# Hablar con el bot primero
# Test: https://api.telegram.org/botTOKEN/sendMessage?chat_id=CHAT_ID&text=test
```

### BD corrupta
```bash
# Eliminar y recrear
rm bets.db
npm start
```

---

## 📈 Monitoreo

### Local
```bash
# Ver último análisis
cat bets.db | sqlite3 "SELECT * FROM predicciones LIMIT 5"

# Estadísticas hoy
sqlite3 bets.db ".mode column" "SELECT * FROM estadisticas_diarias WHERE fecha = date('now')"
```

### GitHub Actions
- Logs en: Actions → Betting Bot - EV+ Analysis → Latest run
- Artifacts (bets.db) disponible para download

---

## 📚 Recursos

- [The Odds API Docs](https://the-odds-api.com/liveapi/guides/v4/)
- [Kelly Criterion Calculator](https://www.omnicalculator.com/finance/kelly-criterion)
- [Expected Value en Apuestas](https://en.wikipedia.org/wiki/Expected_value)

---

## 📝 Licencia

MIT - Usa a tu propio riesgo. Apuestas responsables.

---

**Creado:** 2026  
**Actualizado:** Abril 2026  
**Status:** En desarrollo activo
