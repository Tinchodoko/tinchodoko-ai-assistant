import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../theme/app_theme.dart';

class InformationTab extends StatelessWidget {
  const InformationTab({super.key});

  static final Uri _releasesUri = Uri.parse('https://github.com/Tinchodoko/tinchodoko-ai-assistant/releases');
  static final Future<PackageInfo> _packageInfo = PackageInfo.fromPlatform();

  static const List<String> _features = [
    'Integración directa con Exness Trader API para consultar datos de cuenta.',
    'Balance, equity, margen utilizado y posiciones abiertas.',
    'Historial de velas OHLCV obtenido desde Exness.',
    'Indicadores técnicos calculados localmente: RSI, ATR, EMA, MACD, Bollinger, Stochastic, ADX, CCI y Z-Score.',
    'Panel Multi-IA para comparar análisis y construir un consenso.',
    'Asistente de IA con contexto de mercado e instrucciones personalizadas.',
    'Compatibilidad con Groq, Gemini, Claude, OpenAI, OpenRouter y Mistral.',
    'Almacenamiento seguro de credenciales y API keys en Android.',
    'Registro de señales y decisiones durante la sesión.',
    'Modo oscuro y navegación Material 3.',
  ];

  static const List<Map<String, String>> _changes = [
    {'version': 'Build #60', 'description': 'Ajuste del generador de notas de publicación para producir un archivo RELEASE_NOTES.md con historial, instalación y datos de build mediante comandos shell compatibles.'},
    {'version': 'Build #59', 'description': 'Documentación de las actualizaciones realizadas en la propia pestaña Information y en el registro central de cambios (builds 56 y 57).'},
    {'version': 'Build #57', 'description': 'Sincronización del registro central CHANGELOG.md con las novedades y correcciones documentadas para las builds 52 a 55.'},
    {'version': 'Build #56', 'description': 'Ampliación del historial de cambios dentro de Information para incluir las builds 52 a 55.'},
    {'version': 'Build #58', 'description': 'Preparación de notas de publicación combinando el historial de cambios con las instrucciones de instalación y el identificador de build.'},
    {'version': 'Build #55', 'description': 'Corrección de compatibilidad Android: Kotlin Gradle Plugin 1.9.24 para compilar dependencias que utilizan metadatos Kotlin 1.9.'},
    {'version': 'Build #54', 'description': 'Las publicaciones APK de GitHub incluyen automáticamente el registro detallado de cambios y las instrucciones de instalación.'},
    {'version': 'Build #53', 'description': 'Creación del registro central CHANGELOG.md con el historial de cambios de las builds recientes.'},
    {'version': 'Build #52', 'description': 'Ampliación de List of Changes en Information para documentar las correcciones y funciones de las builds 30 a 51.'},
    {'version': 'Build #51', 'description': 'Restauración del servicio Exness sobre una base limpia; Gateway DNS configurable de Key Management para el descubrimiento del Access Point.'},
    {'version': 'Build #50', 'description': 'Integración del Gateway configurable en el servicio Exness; ajuste consolidado y validado estructuralmente en Build #51.'},
    {'version': 'Build #49', 'description': 'Corrección del servicio Exness tras detectar un bloque duplicado durante el análisis estático; la reparación definitiva se consolidó en Build #51.'},
    {'version': 'Build #48', 'description': 'Reconstrucción del servicio Exness para admitir el Gateway DNS configurable de Key Management.'},
    {'version': 'Build #47', 'description': 'Nuevo campo Trader API Gateway URL en la pantalla de conexión para introducir el host DNS proporcionado por Exness.'},
    {'version': 'Build #46', 'description': 'El descubrimiento del Access Point utiliza el Gateway DNS configurado en Key Management, en lugar de un host estático.'},
    {'version': 'Build #45', 'description': 'Almacenamiento local seguro del Gateway DNS de Exness junto con las credenciales de conexión.'},
    {'version': 'Build #44', 'description': 'Corrección del cliente HTTP DNS-over-HTTPS para resolver correctamente el error de análisis estático.'},
    {'version': 'Build #43', 'description': 'Ampliación del tiempo de espera para completar la resolución DNS alternativa antes de solicitar conexión a Exness.'},
    {'version': 'Build #42', 'description': 'Actualización a Flutter/Dart compatible con la conexión TLS segura del fallback DNS y análisis estático obligatorio.'},
    {'version': 'Build #41', 'description': 'Corrección del handshake TLS en las conexiones HTTPS mediante direcciones DNS alternativas, conservando la validación del certificado.'},
    {'version': 'Build #40', 'description': 'Mensajes de diagnóstico más claros cuando falla la resolución DNS-over-HTTPS.'},
    {'version': 'Build #39', 'description': 'Corrección del manejo de errores de sockets en el mecanismo alternativo de resolución DNS.'},
    {'version': 'Build #38', 'description': 'Uso del mecanismo DNS-over-HTTPS también durante las solicitudes al Gateway de Exness.'},
    {'version': 'Build #37', 'description': 'Incorporación de resolución DNS-over-HTTPS alternativa para conexiones con la API de Exness.'},
    {'version': 'Build #36', 'description': 'Pruebas automatizadas del vector oficial de firma Ed25519 de Exness.'},
    {'version': 'Build #35', 'description': 'Uso del endpoint de información de cuenta confirmado para consultas de solo lectura.'},
    {'version': 'Build #34', 'description': 'Diagnóstico más preciso de errores DNS y de conexión Socket durante las solicitudes a Exness.'},
    {'version': 'Build #33', 'description': 'Eliminación del host alternativo estático no compatible como fallback del Gateway Trader API.'},
    {'version': 'Build #32', 'description': 'Correcciones en el descubrimiento del Gateway de Exness y mejora del diagnóstico DNS.'},
    {'version': 'Build #31', 'description': 'Mejoras visuales de la pantalla Information y lectura de metadatos de versión/build desde la aplicación.'},
    {'version': 'Build #30', 'description': 'Reparación del servicio Exness e incorporación de solicitudes firmadas para datos de mercado.'},
    {'version': 'V29', 'description': 'Actualización inicial de las direcciones Gateway de Exness.'},
    {'version': 'V28', 'description': 'Implementación de Exness Trader API para conexión y consulta de cuenta en modo de solo lectura.'},
  ];

  Future<void> _openReleases(BuildContext context) async {
    final opened = await launchUrl(_releasesUri, mode: LaunchMode.externalApplication);
    if (!opened && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('No se pudo abrir GitHub Releases.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SafeArea(
        child: FutureBuilder<PackageInfo>(
          future: _packageInfo,
          builder: (context, snapshot) {
            final info = snapshot.data;
            final version = info?.version ?? '1.0.0';
            final buildNumber = info?.buildNumber ?? '—';
            return Column(children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.all(20),
                  children: [
                    const SizedBox(height: 12),
                    const Icon(Icons.bolt, color: AppTheme.primaryGreen, size: 44),
                    const SizedBox(height: 12),
                    const Text('Tinchodoko AI Assistant', textAlign: TextAlign.center, style: TextStyle(color: AppTheme.textPrimary, fontSize: 22, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 6),
                    const Text('creado por Tinchodoko', textAlign: TextAlign.center, style: TextStyle(color: AppTheme.textSecondary, fontSize: 13)),
                    const SizedBox(height: 24),
                    _sectionTitle('Features'),
                    ..._features.map((feature) => Padding(
                      padding: const EdgeInsets.symmetric(vertical: 5),
                      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        const Icon(Icons.check_circle, color: AppTheme.primaryGreen, size: 17),
                        const SizedBox(width: 9),
                        Expanded(child: Text(feature, style: const TextStyle(color: AppTheme.textPrimary, height: 1.35, fontSize: 13))),
                      ]),
                    )),
                    const SizedBox(height: 22),
                    _sectionTitle('Releases'),
                    Container(
                      decoration: BoxDecoration(color: AppTheme.surfaceCard, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppTheme.surfaceBorder)),
                      child: ListTile(
                        leading: const Icon(Icons.open_in_new, color: AppTheme.primaryGreen),
                        title: const Text('GitHub', style: TextStyle(color: AppTheme.textPrimary, fontWeight: FontWeight.bold)),
                        subtitle: const Text('Ver versiones y descargar APKs', style: TextStyle(color: AppTheme.textSecondary, fontSize: 12)),
                        trailing: const Icon(Icons.chevron_right, color: AppTheme.textSecondary),
                        onTap: () => _openReleases(context),
                      ),
                    ),
                    const SizedBox(height: 22),
                    _sectionTitle('Version'),
                    _infoRow('Version', version),
                    _infoRow('Build', info == null ? 'Cargando...' : '#$buildNumber'),
                    const SizedBox(height: 22),
                    _sectionTitle('List of Changes'),
                    ..._changes.map((change) => Container(
                      margin: const EdgeInsets.only(bottom: 9),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(color: AppTheme.surfaceCard, borderRadius: BorderRadius.circular(10), border: Border.all(color: AppTheme.surfaceBorder)),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(change['version']!, style: const TextStyle(color: AppTheme.primaryGreen, fontWeight: FontWeight.bold, fontSize: 13)),
                        const SizedBox(height: 4),
                        Text(change['description']!, style: const TextStyle(color: AppTheme.textPrimary, fontSize: 12, height: 1.4)),
                      ]),
                    )),
                    const SizedBox(height: 12),
                  ],
                ),
              ),
              const Divider(color: AppTheme.surfaceBorder, height: 1),
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 12, 18, 10),
                child: Row(children: [
                  Text('#$buildNumber', style: const TextStyle(color: AppTheme.textSecondary, fontFamily: 'monospace', fontSize: 12)),
                  const Spacer(),
                  const Text('Made By Tinchodoko', style: TextStyle(color: AppTheme.textSecondary, fontSize: 12, fontWeight: FontWeight.w600)),
                  const SizedBox(width: 7),
                  SvgPicture.string(
                    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#F0F6FC" d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2.02c-3.22.7-3.9-1.36-3.9-1.36-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.57-.29-5.28-1.29-5.28-5.73 0-1.27.45-2.3 1.2-3.11-.12-.3-.52-1.48.11-3.08 0 0 .98-.31 3.16 1.19a10.9 10.9 0 0 1 5.76 0c2.18-1.5 3.16-1.19 3.16-1.19.63 1.6.23 2.78.11 3.08.75.81 1.2 1.84 1.2 3.11 0 4.45-2.72 5.44-5.3 5.72.42.36.78 1.07.78 2.16v3.2c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z"/></svg>',
                    width: 18,
                    height: 18,
                  ),
                ]),
              ),
            ]);
          },
        ),
      ),
    );
  }

  Widget _sectionTitle(String title) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: Text(title, style: const TextStyle(color: AppTheme.primaryGreen, fontSize: 15, fontWeight: FontWeight.bold)),
  );

  Widget _infoRow(String label, String value) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 5),
    child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
      Text(label, style: const TextStyle(color: AppTheme.textSecondary, fontSize: 13)),
      Text(value, style: const TextStyle(color: AppTheme.textPrimary, fontFamily: 'monospace', fontSize: 13)),
    ]),
  );
}
