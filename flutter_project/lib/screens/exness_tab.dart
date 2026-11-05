import 'dart:convert';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import '../services/exness_service.dart';
import '../services/secure_storage_service.dart';
import '../theme/app_theme.dart';

class ExnessTab extends StatefulWidget {
  const ExnessTab({super.key, required this.exnessService});

  final ExnessService exnessService;

  @override
  State<ExnessTab> createState() => _ExnessTabState();
}

class _ExnessTabState extends State<ExnessTab> {
  final _apiKeyController = TextEditingController();
  final _privateKeyController = TextEditingController();
  final _accountIdController =
      TextEditingController(text: '15000251367');
  final _gatewayUrlController = TextEditingController(text: 'https://api.exness.com');
  final _gatewayIpController = TextEditingController();
  bool _obscureApiKey = true;
  bool _obscurePrivateKey = true;
  bool _credentialsBusy = false;
  String _selectedBroker = 'Exness';

  @override
  void initState() {
    super.initState();
    _loadSavedCredentials();
  }

  Future<void> _loadSavedCredentials() async {
    final values = await SecureStorageService.getExnessCredentials();
    if (!mounted) return;
    setState(() {
      _apiKeyController.text = values['apiKey'] ?? '';
      _privateKeyController.text = values['privateKey'] ?? '';
      _accountIdController.text =
          values['accountId'] ?? _accountIdController.text;
      _gatewayUrlController.text = values['gatewayUrl'] ?? 'https://api.exness.com';
      _gatewayIpController.text = values['gatewayIp'] ?? '';
    });
  }

  @override
  void dispose() {
    _apiKeyController.dispose();
    _privateKeyController.dispose();
    _accountIdController.dispose();
    _gatewayUrlController.dispose();
    _gatewayIpController.dispose();
    super.dispose();
  }

  Future<void> _saveCredentials() async {
    if (_credentialsBusy) return;
    if (_apiKeyController.text.trim().isEmpty ||
        _privateKeyController.text.trim().isEmpty ||
        _accountIdController.text.trim().isEmpty ||
        _gatewayUrlController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Complete Gateway, API Key, Secret and Account ID before saving.')),
      );
      return;
    }
    setState(() => _credentialsBusy = true);
    try {
      await SecureStorageService.saveExnessCredentials(
        apiKey: _apiKeyController.text,
        privateKey: _privateKeyController.text,
        accountId: _accountIdController.text,
        gatewayUrl: _gatewayUrlController.text,
        gatewayIp: _gatewayIpController.text,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Exness credentials saved securely on this device.')),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not save Exness credentials securely.')),
      );
    } finally {
      if (mounted) setState(() => _credentialsBusy = false);
    }
  }

  Future<void> _exportCredentials() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Export credentials without encryption?'),
        content: const Text(
          'The JSON file contains Gateway, API Key, private Secret and Account ID in plain text. Anyone who obtains it may access your Exness API within the key permissions. Keep it private and delete exported copies when finished.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('CANCEL'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('EXPORT JSON'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    final payload = <String, String>{
      'gateway': _gatewayUrlController.text.trim(),
      'api': _apiKeyController.text.trim(),
      'secret': _privateKeyController.text.trim(),
      'account': _accountIdController.text.trim(),
      'gatewayIp': _gatewayIpController.text.trim(),
      'format': 'tinchodoko-exness-credentials',
      'version': '1',
    };
    final bytes = Uint8List.fromList(
      utf8.encode(const JsonEncoder.withIndent('  ').convert(payload)),
    );
    try {
      await Share.shareXFiles(
        [XFile.fromData(bytes, mimeType: 'application/json', name: 'exness_credentials_export.json')],
        text: 'Exness backup — contains unencrypted credentials.',
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not open the system share sheet for the JSON export.')),
      );
    }
  }

  Future<void> _importCredentials() async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['json'],
        withData: true,
      );
      if (result == null || result.files.isEmpty) return;
      final bytes = result.files.single.bytes;
      if (bytes == null) {
        throw const FormatException('The selected JSON file could not be read.');
      }
      final decoded = jsonDecode(utf8.decode(bytes));
      if (decoded is! Map<String, dynamic>) {
        throw const FormatException('The JSON root must be an object.');
      }
      final gateway = decoded['gateway'] ?? decoded['gatewayUrl'];
      final api = decoded['api'] ?? decoded['apiKey'];
      final privateSecret = decoded['secret'] ?? decoded['privateKey'];
      final account = decoded['account'] ?? decoded['accountId'];
      if ([gateway, api, privateSecret, account].any((value) => value is! String)) {
        throw const FormatException('JSON must contain gateway, api, secret and account as strings.');
      }
      if ([gateway, api, privateSecret, account].any((value) => (value as String).trim().isEmpty)) {
        throw const FormatException('Required credential fields cannot be empty.');
      }
      if (!mounted) return;
      setState(() {
        _gatewayUrlController.text = gateway as String;
        _apiKeyController.text = api as String;
        _privateKeyController.text = privateSecret as String;
        _accountIdController.text = account as String;
        _gatewayIpController.text = decoded['gatewayIp'] is String ? decoded['gatewayIp'] as String : '';
      });
      await _saveCredentials();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('JSON imported. Review the values before connecting.')),
      );
    } on FormatException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Invalid credentials JSON: ${error.message}')),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not import the selected JSON file.')),
      );
    }
  }

  Future<void> _connect() async {
    final success = await widget.exnessService.connect(
      apiKey: _apiKeyController.text,
      privateKey: _privateKeyController.text,
      accountId: _accountIdController.text,
      gatewayUrl: _gatewayUrlController.text,
      gatewayIp: _gatewayIpController.text.trim(),
    );
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          success
              ? 'Exness account connected successfully.'
              : widget.exnessService.lastError,
        ),
        backgroundColor: success
            ? AppTheme.surfaceHighlight
            : AppTheme.errorRed.withOpacity(0.95),
      ),
    );
  }

  Widget _metric(String label, String value, IconData icon) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppTheme.surfaceHighlight,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppTheme.surfaceBorder),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: AppTheme.primaryGreen, size: 18),
            const SizedBox(height: 8),
            Text(label,
                style: const TextStyle(
                    fontSize: 11, color: AppTheme.textSecondary)),
            const SizedBox(height: 4),
            Text(
              value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.bold,
                color: AppTheme.textPrimary,
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.exnessService,
      builder: (context, _) {
        final service = widget.exnessService;
        final connected = service.isConnected;
        final loading = service.isLoading;
        final currency = service.currency.isEmpty ? '' : ' ${service.currency}';

        return Scaffold(
          body: SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.all(9),
                                decoration: BoxDecoration(
                                  color: (connected
                                          ? AppTheme.primaryGreen
                                          : AppTheme.errorRed)
                                      .withOpacity(0.12),
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: Icon(
                                  connected
                                      ? Icons.cloud_done
                                      : Icons.cloud_off,
                                  color: connected
                                      ? AppTheme.primaryGreen
                                      : AppTheme.errorRed,
                                ),
                              ),
                              const SizedBox(width: 12),
                              const Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'Connect trading account',
                                      style: TextStyle(
                                        fontSize: 16,
                                        fontWeight: FontWeight.bold,
                                        color: AppTheme.textPrimary,
                                      ),
                                    ),
                                    SizedBox(height: 3),
                                    Text(
                                      'Exness Trader API',
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: AppTheme.textSecondary,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              Container(
                                width: 10,
                                height: 10,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: connected
                                      ? AppTheme.primaryGreen
                                      : AppTheme.errorRed,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 18),
                          const Text(
                            'Broker',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: AppTheme.textSecondary,
                            ),
                          ),
                          const SizedBox(height: 6),
                          DropdownButtonFormField<String>(
                            value: _selectedBroker,
                            decoration: const InputDecoration(
                              prefixIcon: Icon(Icons.account_balance),
                            ),
                            items: const [
                              DropdownMenuItem(
                                value: 'Exness',
                                child: Text('Exness'),
                              ),
                            ],
                            onChanged: connected
                                ? null
                                : (value) {
                                    if (value != null) {
                                      setState(() => _selectedBroker = value);
                                    }
                                  },
                          ),
                          const SizedBox(height: 14),
                          const Text(
                            'Trader API Gateway URL (provided by Exness)',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: AppTheme.textSecondary,
                            ),
                          ),
                          const SizedBox(height: 6),
                          TextField(
                            controller: _gatewayUrlController,
                            enabled: !connected && !loading,
                            keyboardType: TextInputType.url,
                            autocorrect: false,
                            enableSuggestions: false,
                            decoration: const InputDecoration(
                              hintText: 'https://api.exness.com (alternative: https://api.exness-api.com)',
                              prefixIcon: Icon(Icons.dns_outlined),
                            ),
                          ),
                          const SizedBox(height: 8),
                          const SizedBox(height: 14),
                          const Text(
                            'API Key',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: AppTheme.textSecondary,
                            ),
                          ),
                          const SizedBox(height: 6),
                          TextField(
                            controller: _apiKeyController,
                            enabled: !connected && !loading,
                            autocorrect: false,
                            enableSuggestions: false,
                            decoration: InputDecoration(
                              hintText: 'Put your API key for "Exness"',
                              prefixIcon: const Icon(Icons.vpn_key),
                              suffixIcon: IconButton(
                                tooltip: _obscureApiKey ? 'Show API Key' : 'Hide API Key',
                                onPressed: () => setState(() => _obscureApiKey = !_obscureApiKey),
                                icon: Icon(_obscureApiKey ? Icons.visibility_off : Icons.visibility),
                              ),
                            ),
                            obscureText: _obscureApiKey,
                          ),
                          const SizedBox(height: 14),
                          const Text(
                            'Private signing key',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: AppTheme.textSecondary,
                            ),
                          ),
                          const SizedBox(height: 6),
                          TextField(
                            controller: _privateKeyController,
                            enabled: !connected && !loading,
                            obscureText: _obscurePrivateKey,
                            autocorrect: false,
                            enableSuggestions: false,
                            decoration: InputDecoration(
                              hintText: '128 hexadecimal characters',
                              prefixIcon: const Icon(Icons.lock_outline),
                              suffixIcon: IconButton(
                                onPressed: () => setState(() =>
                                    _obscurePrivateKey = !_obscurePrivateKey),
                                icon: Icon(_obscurePrivateKey
                                    ? Icons.visibility_off
                                    : Icons.visibility),
                              ),
                            ),
                          ),
                          const SizedBox(height: 14),
                          const Text(
                            'Trading account ID',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: AppTheme.textSecondary,
                            ),
                          ),
                          const SizedBox(height: 6),
                          TextField(
                            controller: _accountIdController,
                            enabled: !connected && !loading,
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(
                              hintText: 'Enter your Exness trading account ID',
                              prefixIcon: Icon(Icons.numbers),
                            ),
                          ),
                          const SizedBox(height: 16),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              OutlinedButton.icon(
                                onPressed: loading || _credentialsBusy ? null : _saveCredentials,
                                icon: const Icon(Icons.save_outlined),
                                label: const Text('SAVE'),
                              ),
                              OutlinedButton.icon(
                                onPressed: loading || _credentialsBusy ? null : _importCredentials,
                                icon: const Icon(Icons.file_open_outlined),
                                label: const Text('IMPORT JSON'),
                              ),
                              OutlinedButton.icon(
                                onPressed: loading || _credentialsBusy ? null : _exportCredentials,
                                icon: const Icon(Icons.ios_share),
                                label: const Text('EXPORT JSON'),
                              ),
                            ],
                          ),
                          const SizedBox(height: 16),
                          SizedBox(
                            width: double.infinity,
                            child: connected
                                ? OutlinedButton.icon(
                                    onPressed: loading
                                        ? null
                                        : () => service.disconnect(),
                                    icon: const Icon(Icons.link_off),
                                    label: const Text('DISCONNECT'),
                                  )
                                : ElevatedButton.icon(
                                    onPressed: loading ? null : _connect,
                                    icon: loading
                                        ? const SizedBox(
                                            width: 18,
                                            height: 18,
                                            child: CircularProgressIndicator(
                                              strokeWidth: 2,
                                              color: Colors.black,
                                            ),
                                          )
                                        : const Icon(Icons.link,
                                            color: Color(0xFF003915)),
                                    label: const Text(
                                      'CONNECT',
                                      style: TextStyle(
                                          fontWeight: FontWeight.bold),
                                    ),
                                  ),
                          ),
                          if (!connected)
                            const Padding(
                              padding: EdgeInsets.only(top: 10),
                              child: Text(
                                'Your API credentials are stored locally using Android secure storage. The app uses signed, read-only requests in this first stage.',
                                style: TextStyle(
                                  fontSize: 11,
                                  color: AppTheme.textSecondary,
                                  height: 1.4,
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                  if (service.lastError.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppTheme.errorRed.withOpacity(0.10),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                            color: AppTheme.errorRed.withOpacity(0.35)),
                      ),
                      child: Text(
                        service.lastError,
                        style: const TextStyle(
                            color: AppTheme.errorRed, fontSize: 12),
                      ),
                    ),
                  ],
                  if (connected) ...[
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        const Expanded(
                          child: Text(
                            'Account overview',
                            style: TextStyle(
                              color: AppTheme.textPrimary,
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                        IconButton(
                          tooltip: 'Refresh account data',
                          onPressed: loading ? null : service.refresh,
                          icon: const Icon(Icons.refresh),
                        ),
                      ],
                    ),
                    Row(
                      children: [
                        _metric('Balance', '${service.balance}$currency',
                            Icons.account_balance_wallet_outlined),
                        const SizedBox(width: 10),
                        _metric('Equity', '${service.equity}$currency',
                            Icons.show_chart),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        _metric('Used margin', '${service.usedMargin}$currency',
                            Icons.pie_chart_outline),
                        const SizedBox(width: 10),
                        _metric('Open positions',
                            service.positions.length.toString(),
                            Icons.candlestick_chart),
                      ],
                    ),
                    const SizedBox(height: 18),
                    const Text(
                      'Open positions',
                      style: TextStyle(
                        color: AppTheme.textPrimary,
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 10),
                    if (service.positions.isEmpty)
                      Container(
                        padding: const EdgeInsets.all(22),
                        decoration: BoxDecoration(
                          color: AppTheme.surfaceHighlight,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: AppTheme.surfaceBorder),
                        ),
                        child: const Column(
                          children: [
                            Icon(Icons.inbox_outlined,
                                size: 34, color: AppTheme.textSecondary),
                            SizedBox(height: 8),
                            Text(
                              'No open positions',
                              style: TextStyle(
                                color: AppTheme.textSecondary,
                                fontSize: 13,
                              ),
                            ),
                          ],
                        ),
                      )
                    else
                      ...service.positions.map((position) => Card(
                            margin: const EdgeInsets.only(bottom: 9),
                            child: Padding(
                              padding: const EdgeInsets.all(13),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Expanded(
                                        child: Text(
                                          position.instrument,
                                          style: const TextStyle(
                                            color: AppTheme.textPrimary,
                                            fontWeight: FontWeight.bold,
                                            fontSize: 15,
                                          ),
                                        ),
                                      ),
                                      Text(
                                        position.direction,
                                        style: TextStyle(
                                          color: position.direction == 'BUY'
                                              ? AppTheme.primaryGreen
                                              : AppTheme.errorRed,
                                          fontWeight: FontWeight.bold,
                                          fontSize: 12,
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 8),
                                  Wrap(
                                    spacing: 16,
                                    runSpacing: 6,
                                    children: [
                                      _positionValue('Volume', position.volume),
                                      _positionValue('Open price',
                                          position.openPrice),
                                      _positionValue('Commission',
                                          position.commission),
                                      _positionValue('Swap', position.swap),
                                      _positionValue('ID', position.id),
                                    ],
                                  ),
                                  if (position.openedAt.isNotEmpty) ...[
                                    const SizedBox(height: 7),
                                    Text(
                                      position.openedAt,
                                      style: const TextStyle(
                                        color: AppTheme.textSecondary,
                                        fontSize: 10,
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          )),
                  ],
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _positionValue(String label, String value) {
    return Text(
      '$label: $value',
      style: const TextStyle(
        color: AppTheme.textSecondary,
        fontSize: 11,
      ),
    );
  }
}
