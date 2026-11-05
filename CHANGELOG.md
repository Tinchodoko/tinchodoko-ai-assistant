## Exness credentials UI (2026-11-04)
- API Key y Private Secret ahora tienen controles independientes para mostrar u ocultar su contenido.
- Se agrega guardado manual de Gateway, API Key, Secret, Account ID y Gateway IP opcional mediante Android secure storage.
- Se agrega importación desde JSON y exportación JSON en texto plano con confirmación y advertencia de seguridad.
- El formato de exportación incluye Gateway, API, Secret y Account; los archivos exportados no se agregan al repositorio ni se registran en logs.

## Python backend — etapa 1 (2026-11-04)
- Se incorpora un servicio FastAPI independiente para la integración Exness de solo lectura.
- Python implementa la firma Ed25519, valida la clave de 128 caracteres hexadecimales y comprueba que la mitad pública corresponda a la semilla.
- Se implementa descubrimiento firmado del Access Point mediante el Gateway DNS configurado en Key Management y consulta firmada de detalles de cuenta.
- Se agregan autenticación del cliente del backend, validación HTTPS, timeout de 15 segundos y respuestas de error sin incluir credenciales ni cabeceras firmadas.
- Se agregan pruebas unitarias basadas en el vector sintético oficial de Exness y validaciones de URL/Account ID.
- El backend no persiste credenciales y no incorpora endpoints de trading. La app Flutter todavía no está migrada a este backend en esta etapa.

# Tinchodoko AI Assistant — Registro de cambios

## Correcciones de integración Exness (posteriores a Build #64)
- Cliente DNS: IP override dinámico limitado exclusivamente al hostname Gateway configurado; nunca reutiliza la IP del Gateway para el Access Point.
- DNS-over-HTTPS: límites de espera acotados para evitar que los resolvers consuman el timeout total de la petición; mensajes de error sin afirmar bloqueos del ISP sin evidencia.
- Peticiones REST: timeout total de 15 segundos alineado con el ejemplo oficial de Exness y diagnóstico diferenciado para descubrimiento del Access Point, lectura de cuenta y consultas de mercado.
- Validación: Account ID limitado al rango uint64 admitido por el ejemplo oficial.
- Interfaz: eliminadas las instrucciones que sugerían resolver api.exness.com como si fuera necesariamente el Gateway asignado.
- Seguridad: se conserva HTTPS con validación TLS/SNI del hostname original, sin desactivar la validación de certificados ni registrar credenciales o cabeceras firmadas.

Este registro documenta los cambios de implementación incorporados en las builds recientes. Las entradas de builds fallidas o intermedias describen trabajo de desarrollo y no implican que se haya publicado un APK instalable.

## Builds 56–57
- **Build #57:** Sincronización del registro central CHANGELOG.md con las novedades y correcciones documentadas para las builds 52 a 55.
- **Build #56:** Ampliación del historial de cambios dentro de Information para incluir las builds 52 a 55.

## Builds 59–60
- **Build #60:** Ajuste del generador de notas de publicación para producir RELEASE_NOTES.md con historial, instrucciones y datos de build.
- **Build #59:** Documentación de las actualizaciones realizadas en Information y en el registro central de cambios.

## Build 58
- Preparación de notas de publicación con historial completo, instrucciones de instalación y número de build.

## Builds 52–55

### Build #55
- Corrección de compatibilidad Android: Kotlin Gradle Plugin 1.9.24 para compilar dependencias que utilizan metadatos Kotlin 1.9.
### Build #54
- Las publicaciones APK de GitHub incluyen automáticamente el registro detallado de cambios y las instrucciones de instalación.
### Build #53
- Creación del registro central CHANGELOG.md con el historial de cambios de las builds recientes.
### Build #52
- Ampliación de List of Changes en Information para documentar las correcciones y funciones de las builds 30 a 51.

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