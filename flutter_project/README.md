# 🚀 Tinchodoko AI Assistant — Android (Flutter)

Aplicación móvil profesional desarrollada en **Flutter** para Android con **Material Design 3**, tema oscuro nativo (verde neon y negro), y arquitectura limpia.

## 📱 Características y Pestañas (4 Tabs)

1. **Tab 1 — APIs**:
   - Soporte para 6 proveedores líderes de IA: **Groq**, **Gemini**, **Claude**, **OpenAI**, **OpenRouter**, **Mistral**.
   - Indicador visual verde (configurada) / rojo (no configurada) en tiempo real.
   - Botón global **“Guardar”** con persistencia segura mediante `flutter_secure_storage` con cifrado por hardware en Android (`encryptedSharedPreferences`).

2. **Tab 2 — Assistant**:
   - Dropdown de selección de API activa.
   - Dropdown de selección de modelo correspondiente dinámico (se actualiza automáticamente al cambiar de API).
   - Área de texto para instrucciones avanzadas de trading institucional y análisis cuantitativo.
   - Botón **“Analizar”** con llamada directa o simulación estructurada.
   - Cuadro de respuesta scrolleable con tesis técnica, precio de entrada, SL y TP.
   - Botones condicionales **“✅ Confirmar”** y **“❌ Rechazar”** (aparecen solo al existir una respuesta).

3. **Tab 3 — cTrader**:
   - Campo para ingresar el Token MCP de cTrader Remote.
   - Botón conectar/desconectar con handshake en tiempo real.
   - Indicador dinámico de estado de red (conectado / desconectado).
   - Métricas en vivo: **Balance**, **Equity**, **Margen Libre** y visualización de **Posiciones Abiertas** con PnL dinámico y botón de cierre.

4. **Tab 4 — Historial**:
   - Registro cronológico de todas las operaciones con: Fecha/hora, Par (ej. EURUSD, XAUUSD), Dirección (BUY / SELL), Resultado financiero, y estado de decisión del usuario (✅ Confirmada / ❌ Rechazada).
   - Filtros rápidos por estado y limpieza de historial.

## 🛠️ Requisitos de Compilación en Android
```bash
cd flutter_project
flutter pub get
flutter run
```

## 📦 Dependencias Principales
- `flutter_secure_storage`: Almacenamiento cifrado en Android Keystore
- `google_fonts`: Tipografía moderna
- `http`: Conexión REST a APIs de IA y servidores MCP
- `provider`: Manejo de estado reactivo
- `intl`: Formato de divisas y fechas
