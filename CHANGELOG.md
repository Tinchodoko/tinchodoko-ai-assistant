# Tinchodoko AI Assistant — Registro de cambios

Este registro documenta los cambios de implementación incorporados en las builds recientes. Las entradas de builds fallidas o intermedias describen trabajo de desarrollo y no implican que se haya publicado un APK instalable.

## Builds 30–51

### Build #51
- Restauración del servicio Exness sobre una base limpia y configuración del Gateway DNS de Key Management para descubrir el Access Point.
### Build #50
- Integración del Gateway configurable en el servicio Exness; ajuste consolidado estructuralmente en Build #51.
### Build #49
- Corrección del servicio Exness tras detectar un bloque duplicado durante el análisis estático; reparación definitiva consolidada en Build #51.
### Build #48
- Reconstrucción del servicio Exness para admitir el Gateway DNS configurable de Key Management.
### Build #47
- Nuevo campo Trader API Gateway URL en la pantalla de conexión para introducir el host DNS proporcionado por Exness.
### Build #46
- El descubrimiento del Access Point utiliza el Gateway DNS configurado en Key Management, en lugar de un host estático.
### Build #45
- Almacenamiento local seguro del Gateway DNS de Exness junto con las credenciales de conexión.
### Build #44
- Corrección del cliente HTTP DNS-over-HTTPS para resolver un error de análisis estático.
### Build #43
- Ampliación del tiempo de espera para completar la resolución DNS alternativa antes de solicitar conexión a Exness.
### Build #42
- Actualización a Flutter/Dart compatible con la conexión TLS segura del fallback DNS y análisis estático obligatorio.
### Build #41
- Corrección del handshake TLS en conexiones HTTPS mediante direcciones DNS alternativas, conservando la validación del certificado.
### Build #40
- Mensajes de diagnóstico más claros cuando falla la resolución DNS-over-HTTPS.
### Build #39
- Corrección del manejo de errores de sockets en el mecanismo alternativo de resolución DNS.
### Build #38
- Uso del mecanismo DNS-over-HTTPS también durante las solicitudes al Gateway de Exness.
### Build #37
- Incorporación de resolución DNS-over-HTTPS alternativa para conexiones con la API de Exness.
### Build #36
- Pruebas automatizadas del vector oficial de firma Ed25519 de Exness.
### Build #35
- Uso del endpoint de información de cuenta confirmado para consultas de solo lectura.
### Build #34
- Diagnóstico más preciso de errores DNS y de conexión Socket durante las solicitudes a Exness.
### Build #33
- Eliminación del host alternativo estático no compatible como fallback del Gateway Trader API.
### Build #32
- Correcciones en el descubrimiento del Gateway de Exness y mejora del diagnóstico DNS.
### Build #31
- Mejoras visuales de la pantalla Information y lectura de metadatos de versión/build desde la aplicación.
### Build #30
- Reparación del servicio Exness e incorporación de solicitudes firmadas para datos de mercado.

### Builds anteriores
- **V29:** Actualización inicial de las direcciones Gateway de Exness.
- **V28:** Implementación de Exness Trader API para conexión y consulta de cuenta en modo de solo lectura.