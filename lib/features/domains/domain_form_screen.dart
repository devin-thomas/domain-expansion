import 'dart:async';

import 'package:domain_expansion/core/database/app_database.dart';
import 'package:domain_expansion/core/formatting/formatters.dart';
import 'package:domain_expansion/core/models/domain_record.dart';
import 'package:domain_expansion/core/notifications/reminder_service.dart';
import 'package:domain_expansion/core/providers/providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class DomainFormScreen extends ConsumerStatefulWidget {
  const DomainFormScreen({super.key, this.domainId});
  final int? domainId;

  @override
  ConsumerState<DomainFormScreen> createState() => _DomainFormScreenState();
}

class _DomainFormScreenState extends ConsumerState<DomainFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _registrar = TextEditingController();
  final _dns = TextEditingController();
  final _registrationCost = TextEditingController();
  final _renewalCost = TextEditingController();
  final _notes = TextEditingController();
  OwnershipType _ownership = OwnershipType.owned;
  LifecycleState _lifecycle = LifecycleState.active;
  RenewalIntent _intent = RenewalIntent.renew;
  CurrencyCode _currency = CurrencyCode.usd;
  DateTime? _registrationDate;
  DateTime? _billingDate;
  DateTime? _expirationDate;
  DomainRecord? _existing;
  List<ReminderRecord> _reminders = const [];
  List<String> _registrarSuggestions = const [];
  List<String> _dnsSuggestions = const [];
  bool _loading = true;
  bool _saving = false;
  bool _submitted = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final database = ref.read(databaseProvider);
    final registrarSuggestions = await database.getSuggestions('registrar');
    final dnsSuggestions = await database.getSuggestions('dns_provider');
    if (widget.domainId == null) {
      _currency =
          CurrencyCode.tryFromCode(
            await database.getMetadataValue('default_currency') ?? '',
          ) ??
          CurrencyCode.usd;
    }
    if (widget.domainId != null) {
      final domain = await database.getDomain(widget.domainId!);
      if (domain != null) {
        _existing = domain;
        _name.text = domain.name;
        _registrar.text = domain.registrar ?? '';
        _dns.text = domain.dnsProvider ?? '';
        _registrationCost.text = _plainMoney(
          domain.registrationCostMinor,
          domain.currency,
        );
        _renewalCost.text = _plainMoney(
          domain.renewalCostMinor,
          domain.currency,
        );
        _notes.text = domain.notes ?? '';
        _ownership = domain.ownershipType;
        _lifecycle = domain.lifecycleState;
        _intent = domain.renewalIntent;
        _currency = domain.currency;
        _registrationDate = domain.registrationDate;
        _billingDate = domain.billingDate;
        _expirationDate = domain.expirationDate;
        if (domain.id != null) {
          _reminders = await database.getReminders(domain.id!);
        }
      }
    }
    if (!mounted) return;
    setState(() {
      _registrarSuggestions = registrarSuggestions;
      _dnsSuggestions = dnsSuggestions;
      _loading = false;
    });
  }

  String _plainMoney(int? minor, CurrencyCode currency) {
    if (minor == null) return '';
    final divisor = currency == CurrencyCode.jpy ? 1 : 100;
    return (minor / divisor).toStringAsFixed(
      currency == CurrencyCode.jpy ? 0 : 2,
    );
  }

  @override
  void dispose() {
    for (final controller in [
      _name,
      _registrar,
      _dns,
      _registrationCost,
      _renewalCost,
      _notes,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _cancel();
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
            onPressed: _cancel,
            icon: Icon(
              widget.domainId == null ? Icons.close : Icons.arrow_back,
            ),
            tooltip: widget.domainId == null ? 'Cancel' : 'Back to domain',
          ),
          title: Text(widget.domainId == null ? 'Add domain' : 'Edit domain'),
        ),
        body: GestureDetector(
          behavior: HitTestBehavior.translucent,
          onTap: () => FocusManager.instance.primaryFocus?.unfocus(),
          child: Form(
            key: _formKey,
            autovalidateMode: _submitted
                ? AutovalidateMode.onUserInteraction
                : AutovalidateMode.disabled,
            child: ListView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
              children: [
                _sectionTitle(
                  context,
                  'Identity',
                  'Start with the domain you want to keep an eye on.',
                ),
                TextFormField(
                  controller: _name,
                  decoration: const InputDecoration(
                    labelText: 'Domain name',
                    hintText: 'example.com',
                  ),
                  textCapitalization: TextCapitalization.none,
                  autocorrect: false,
                  validator: (value) => normalizeDomainName(value ?? '').isEmpty
                      ? 'Domain name is required.'
                      : null,
                ),
                const SizedBox(height: 24),
                _sectionTitle(
                  context,
                  'Relationship and state',
                  'Keep ownership separate from operational status.',
                ),
                Row(
                  children: [
                    Expanded(
                      child: DropdownButtonFormField<OwnershipType>(
                        initialValue: _ownership,
                        decoration: const InputDecoration(
                          labelText: 'Ownership',
                        ),
                        items: OwnershipType.values
                            .map(
                              (v) => DropdownMenuItem(
                                value: v,
                                child: Text(_label(v.name)),
                              ),
                            )
                            .toList(),
                        onChanged: (value) =>
                            setState(() => _ownership = value!),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: DropdownButtonFormField<LifecycleState>(
                        initialValue: _lifecycle,
                        decoration: const InputDecoration(
                          labelText: 'Lifecycle',
                        ),
                        items: LifecycleState.values
                            .map(
                              (v) => DropdownMenuItem(
                                value: v,
                                child: Text(_label(v.name)),
                              ),
                            )
                            .toList(),
                        onChanged: (value) =>
                            setState(() => _lifecycle = value!),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                SegmentedButton<RenewalIntent>(
                  segments: const [
                    ButtonSegment(
                      value: RenewalIntent.renew,
                      label: Text('Renew'),
                      icon: Icon(Icons.autorenew),
                    ),
                    ButtonSegment(
                      value: RenewalIntent.letExpire,
                      label: Text('Let expire'),
                      icon: Icon(Icons.event_busy),
                    ),
                  ],
                  selected: {_intent},
                  onSelectionChanged: (value) =>
                      setState(() => _intent = value.first),
                ),
                const SizedBox(height: 24),
                _sectionTitle(
                  context,
                  'Dates',
                  'Billing and expiration can differ. Either one is enough.',
                ),
                _DateTile(
                  label: 'Billing date',
                  value: _billingDate,
                  onPick: (date) => setState(() => _billingDate = date),
                ),
                _DateTile(
                  label: 'Expiration date',
                  value: _expirationDate,
                  onPick: (date) => setState(() => _expirationDate = date),
                ),
                if (_billingDate == null && _expirationDate == null)
                  const Padding(
                    padding: EdgeInsets.only(top: 4),
                    child: Text(
                      'Add at least one billing or expiration date.',
                      style: TextStyle(color: Colors.red),
                    ),
                  ),
                _DateTile(
                  label: 'Registration date',
                  value: _registrationDate,
                  onPick: (date) => setState(() => _registrationDate = date),
                ),
                const SizedBox(height: 24),
                _sectionTitle(
                  context,
                  'Costs',
                  'Amounts stay in the selected currency and are stored precisely.',
                ),
                DropdownButtonFormField<CurrencyCode>(
                  initialValue: _currency,
                  decoration: const InputDecoration(labelText: 'Currency'),
                  items: CurrencyCode.values
                      .map(
                        (v) => DropdownMenuItem(
                          value: v,
                          child: Text('${v.code} (${v.symbol})'),
                        ),
                      )
                      .toList(),
                  onChanged: _changeCurrency,
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: TextFormField(
                        controller: _registrationCost,
                        decoration: InputDecoration(
                          labelText: 'Registration cost (${_currency.symbol})',
                        ),
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                        validator: _validateMoney,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextFormField(
                        controller: _renewalCost,
                        decoration: InputDecoration(
                          labelText: 'Renewal cost (${_currency.symbol})',
                        ),
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                        validator: _validateMoney,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                _sectionTitle(
                  context,
                  'Registrar and DNS',
                  'Previously used providers appear as quick suggestions.',
                ),
                _SuggestionField(
                  controller: _registrar,
                  label: 'Registrar',
                  suggestions: _registrarSuggestions,
                ),
                const SizedBox(height: 12),
                _SuggestionField(
                  controller: _dns,
                  label: 'DNS provider',
                  suggestions: _dnsSuggestions,
                ),
                const SizedBox(height: 24),
                _sectionTitle(
                  context,
                  'Reminders',
                  'Default reminders are 30, 14, 7, and 1 day before the relevant date.',
                ),
                if (_reminders.isEmpty)
                  const Card(
                    child: ListTile(
                      leading: Icon(Icons.notifications_none),
                      title: Text(
                        'Default reminders will be added when saved.',
                      ),
                    ),
                  )
                else
                  ..._reminders.map(
                    (reminder) => SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text('${reminder.daysBefore} days before'),
                      subtitle: Text(
                        reminder.targetType == 'default'
                            ? 'Follows renewal intent'
                            : _label(reminder.targetType),
                      ),
                      value: reminder.isEnabled,
                      onChanged: (enabled) => setState(
                        () => _reminders = [
                          for (final item in _reminders)
                            item.id == reminder.id
                                ? ReminderRecord(
                                    id: item.id,
                                    domainId: item.domainId,
                                    daysBefore: item.daysBefore,
                                    targetType: item.targetType,
                                    isEnabled: enabled,
                                    createdAt: item.createdAt,
                                    updatedAt: item.updatedAt,
                                  )
                                : item,
                        ],
                      ),
                    ),
                  ),
                const SizedBox(height: 24),
                _sectionTitle(
                  context,
                  'Notes',
                  'Keep the context you will want when renewal season arrives.',
                ),
                TextFormField(
                  controller: _notes,
                  decoration: const InputDecoration(labelText: 'Notes'),
                  minLines: 3,
                  maxLines: 6,
                ),
                const SizedBox(height: 28),
                FilledButton.icon(
                  onPressed: _saving ? null : _save,
                  icon: _saving
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.check),
                  label: Text(
                    widget.domainId == null ? 'Add domain' : 'Save changes',
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _cancel() {
    FocusManager.instance.primaryFocus?.unfocus();
    context.go(
      widget.domainId == null ? '/domains' : '/domains/${widget.domainId}',
    );
  }

  Widget _sectionTitle(
    BuildContext context,
    String title,
    String description,
  ) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 3),
        Text(description, style: Theme.of(context).textTheme.bodySmall),
      ],
    ),
  );

  String _label(String value) => value
      .replaceAll('_', ' ')
      .replaceAllMapped(
        RegExp(r'([a-z])([A-Z])'),
        (match) => '${match.group(1)} ${match.group(2)}',
      )
      .split(' ')
      .map(
        (part) => part.isEmpty
            ? part
            : '${part[0].toUpperCase()}${part.substring(1)}',
      )
      .join(' ');

  String? _validateMoney(String? value) {
    if (value == null || value.trim().isEmpty) return null;
    return parseMoneyToMinor(value, _currency) == null
        ? 'Enter a valid non-negative amount.'
        : null;
  }

  Future<void> _changeCurrency(CurrencyCode? next) async {
    if (next == null || next == _currency) return;
    final hasCosts =
        _registrationCost.text.trim().isNotEmpty ||
        _renewalCost.text.trim().isNotEmpty;
    if (hasCosts) {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Change currency?'),
          content: const Text(
            'Saved cost values cannot be converted and will be cleared.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Change and clear'),
            ),
          ],
        ),
      );
      if (confirmed != true) return;
      _registrationCost.clear();
      _renewalCost.clear();
    }
    setState(() => _currency = next);
  }

  Future<void> _save() async {
    FocusManager.instance.primaryFocus?.unfocus();
    setState(() => _submitted = true);
    if (!_formKey.currentState!.validate()) return;
    if (_billingDate == null && _expirationDate == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Add a billing or expiration date.')),
      );
      return;
    }
    setState(() => _saving = true);
    final now = DateTime.now();
    final record = DomainRecord(
      id: _existing?.id,
      name: _name.text,
      ownershipType: _ownership,
      lifecycleState: _lifecycle,
      renewalIntent: _intent,
      registrar: _registrar.text,
      dnsProvider: _dns.text,
      registrationDate: _registrationDate,
      billingDate: _billingDate,
      expirationDate: _expirationDate,
      registrationCostMinor: parseMoneyToMinor(
        _registrationCost.text,
        _currency,
      ),
      renewalCostMinor: parseMoneyToMinor(_renewalCost.text, _currency),
      currency: _currency,
      notes: _notes.text,
      isArchived: _existing?.isArchived ?? false,
      createdAt: _existing?.createdAt ?? now,
      updatedAt: now,
    );
    try {
      final database = ref.read(databaseProvider);
      final before = await database.getDomains(includeArchived: true);
      final id = await database.saveDomain(record);
      for (final reminder in _reminders) {
        if (reminder.id != null) {
          await database.setReminderEnabled(reminder.id!, reminder.isEnabled);
        }
      }
      final saved = (await database.getDomain(id))!;
      final reminders = await database.getReminders(id);
      await database.setMetadataValue('onboarding_completed', '1');
      invalidateDomainData(ref, id);
      final reminderService = ref.read(reminderServiceProvider);
      unawaited(
        _refreshRemindersInBackground(
          reminderService,
          database,
          saved,
          reminders,
          isNew: _existing == null,
        ),
      );
      if (!mounted) return;
      if (_existing == null && before.isEmpty) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Expanded')));
      }
      context.go('/domains/$id');
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not save domain: $error')),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _refreshRemindersInBackground(
    ReminderService reminderService,
    AppDatabase database,
    DomainRecord domain,
    List<ReminderRecord> reminders, {
    required bool isNew,
  }) async {
    try {
      await reminderService.configureFromDatabase(database);
      if (isNew) {
        await reminderService.scheduleDomain(domain, reminders);
      } else {
        await reminderService.rescheduleDomain(domain, reminders);
      }
    } catch (error, stackTrace) {
      debugPrint('Could not refresh domain reminders: $error\n$stackTrace');
    }
  }
}

class _SuggestionField extends StatelessWidget {
  const _SuggestionField({
    required this.controller,
    required this.label,
    required this.suggestions,
  });
  final TextEditingController controller;
  final String label;
  final List<String> suggestions;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      TextFormField(
        controller: controller,
        decoration: InputDecoration(labelText: label),
      ),
      if (suggestions.isNotEmpty)
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: suggestions
                .take(6)
                .map(
                  (value) => Padding(
                    padding: const EdgeInsets.only(right: 6, top: 7),
                    child: ActionChip(
                      label: Text(value),
                      onPressed: () => controller.text = value,
                    ),
                  ),
                )
                .toList(),
          ),
        ),
    ],
  );
}

class _DateTile extends StatelessWidget {
  const _DateTile({
    required this.label,
    required this.value,
    required this.onPick,
  });
  final String label;
  final DateTime? value;
  final ValueChanged<DateTime?> onPick;

  @override
  Widget build(BuildContext context) => ListTile(
    contentPadding: EdgeInsets.zero,
    title: Text(label),
    subtitle: Text(formatDate(value)),
    trailing: Wrap(
      children: [
        if (value != null)
          IconButton(
            onPressed: () => onPick(null),
            icon: const Icon(Icons.clear),
            tooltip: 'Clear $label',
          ),
        IconButton(
          onPressed: () async {
            final selected = await showDatePicker(
              context: context,
              initialDate: _datePickerInitialDate(value),
              firstDate: DateTime(2000),
              lastDate: DateTime(2200),
            );
            if (selected != null) onPick(selected);
          },
          icon: const Icon(Icons.calendar_month),
          tooltip: 'Choose $label',
        ),
      ],
    ),
  );
}

DateTime _datePickerInitialDate(DateTime? value) {
  final firstDate = DateTime(2000);
  final lastDate = DateTime(2200);
  final candidate = value ?? DateTime.now().add(const Duration(days: 30));
  if (candidate.isBefore(firstDate)) return firstDate;
  if (candidate.isAfter(lastDate)) return lastDate;
  return candidate;
}
