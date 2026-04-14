# 📱 GUÍA: Configurar Telegram Bot

## Paso 1: Crear Bot en Telegram

1. Abre Telegram
2. Busca: **@BotFather**
3. Dale click → Abre chat
4. Escribe: `/newbot`

**Responderá:**

```
¿Cómo quieres que se llame tu bot?
```

Escribe: `BettingBot` (o el nombre que prefieras)

```
¿Cuál va a ser el nombre de usuario del bot?
```

Escribe: `betting_ev_bot_tu_usuario` (debe ser único y terminar en `_bot`)

**Telegram responderá con:**

```
¡Perfecto! He creado tu bot.
Token: 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11

Usa este token para acceder a la API HTTP.
```

✅ **GUARDA ESTE TOKEN** - Lo necesitas en `.env` como `TELEGRAM_BOT_TOKEN`

---

## Paso 2: Obtener tu Chat ID

### Opción A: Rápido (Recomendado)

1. Escribe algo en el chat con tu bot
2. Ve a (reemplaza TOKEN): 
   ```
   https://api.telegram.org/bot123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11/getUpdates
   ```

3. Busca `"chat":{"id":-123456789}` (números negativos o positivos)
4. **ESE NÚMERO** es tu `TELEGRAM_CHAT_ID`

### Opción B: Buscador de Chat ID

1. Bot: **@userinfobot**
2. Dale click → `/start`
3. Te dirá tu Chat ID

---

## Paso 3: Actualizar .env

```env
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
TELEGRAM_CHAT_ID=-987654321
```

**Notas:**
- `TELEGRAM_BOT_TOKEN`: Token de BotFather (sin comillas)
- `TELEGRAM_CHAT_ID`: Tu ID personal (puede empezar con `-`)

---

## Paso 4: Probar

```bash
npm start
```

Si todo está bien, recibirás mensajes en Telegram automáticamente.

---

## ✅ Checklist

- [ ] Creé bot con @BotFather
- [ ] Copié TOKEN exacto
- [ ] Obtuve CHAT_ID
- [ ] Actualicé .env
- [ ] Probé `npm start`
- [ ] Recibí mensaje de prueba en Telegram

---

## 🔧 Troubleshooting

### "Invalid token"
- Copiar TOKEN exacto de BotFather
- Sin espacios ni caracteres extra
- El token incluye `:` en medio

### "Chat not found"
- CHAT_ID debe ser número
- Puede incluir `-` al inicio
- Habla primero con el bot antes de usar

### No recibo mensajes
- Verifica TELEGRAM_BOT_TOKEN
- Verifica TELEGRAM_CHAT_ID
- Revisa GitHub Actions logs

---

## 📲 Extra: Grupo en lugar de chat privado

Si quieres que el bot envíe a un grupo:

1. Crea grupo en Telegram
2. Agrega tu bot al grupo
3. Escribe algo en el grupo
4. Ve a: `https://api.telegram.org/botTOKEN/getUpdates`
5. Busca `"chat":{"id":-100...}` (números negativos, formato `-100XXXXXX`)
6. Usa ese ID en `.env`

---

**¡Listo!** Tu bot de Telegram está configurado 🚀
