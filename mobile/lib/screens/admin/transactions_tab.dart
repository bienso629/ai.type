import 'package:flutter/material.dart';
import '../../theme/app_colors.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart';
import 'package:flutter/services.dart' as import_services;

class TransactionsTab extends StatefulWidget {
  final ValueNotifier<String> searchQuery;
  
  const TransactionsTab({super.key, required this.searchQuery});

  @override
  State<TransactionsTab> createState() => _TransactionsTabState();
}

class _TransactionsTabState extends State<TransactionsTab> with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;
  
  bool _isLoading = true;
  List<dynamic> _transactions = [];

  @override
  void initState() {
    super.initState();
    _loadData();
    widget.searchQuery.addListener(_onSearchQueryChanged);
  }

  void _onSearchQueryChanged() {
    _loadData(widget.searchQuery.value);
  }

  @override
  void dispose() {
    widget.searchQuery.removeListener(_onSearchQueryChanged);
    super.dispose();
  }

  Future<void> _loadData([String? query]) async {
    if (!mounted) return;
    setState(() => _isLoading = true);
    final data = await ApiService.getTransactions(query);
    if (mounted) {
      setState(() {
        _transactions = data;
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_transactions.isEmpty) {
      return const Center(
        child: Text('Không có lịch sử giao dịch', style: TextStyle(color: AppColors.textSecondary)),
      );
    }

    final currencyFormatter = NumberFormat.currency(locale: 'vi_VN', symbol: 'đ');

    return RefreshIndicator(
      onRefresh: () => _loadData(widget.searchQuery.value),
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        itemCount: _transactions.length,
        itemBuilder: (ctx, idx) {
          final tx = _transactions[idx];
          final txId = tx['transactionId'] ?? 'Unknown';
          final email = tx['username'] ?? 'Unknown Email';
          final appId = tx['appId'] ?? 'ai.typing';
          final version = tx['appVersion'] ?? '1.2.3';
          final months = tx['months']?.toString() ?? '0';
          final content = tx['content'] ?? '';
          final amount = num.tryParse(tx['amount']?.toString() ?? '0') ?? 0;
          final createdAtStr = tx['createdAt'];
          String dateStr = '';
          if (createdAtStr != null) {
            final d = DateTime.tryParse(createdAtStr);
            if (d != null) {
              dateStr = '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year} ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
            }
          }

          return GestureDetector(
            onLongPress: () {
              final copyText = '''Mã GD: $txId\nKhách hàng: $email\nApp: $appId v$version\nGia hạn: $months tháng\nSố tiền: ${currencyFormatter.format(amount)}\nThời gian: $dateStr\nNội dung: $content'''.trim();
              import_services.Clipboard.setData(import_services.ClipboardData(text: copyText));
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Đã copy thông tin giao dịch!')));
            },
            child: Container(
              margin: const EdgeInsets.only(bottom: 16),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(8),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.05),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  )
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Header
                  Center(
                    child: Text(
                      'HOÁ ĐƠN GIAO DỊCH',
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.grey.shade800, letterSpacing: 1.2),
                    ),
                  ),
                  const SizedBox(height: 12),
                  const DashedDivider(),
                  const SizedBox(height: 12),
                  
                  // Transaction ID and Date
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Mã GD:', style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
                      Text(txId, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Thời gian:', style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
                      Text(dateStr, style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 13)),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Khách hàng:', style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
                      Text(email, style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.primary, fontSize: 13)),
                    ],
                  ),
                  
                  const SizedBox(height: 12),
                  const DashedDivider(),
                  const SizedBox(height: 12),
                  
                  // Details
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Gói dịch vụ:', style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
                      Text('$appId v$version', style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 13)),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Gia hạn:', style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
                      Text('$months tháng', style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 13)),
                    ],
                  ),
                  if (content.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Nội dung:', style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Text(content, textAlign: TextAlign.right, style: const TextStyle(fontStyle: FontStyle.italic, fontSize: 13)),
                        ),
                      ],
                    ),
                  ],
                  
                  const SizedBox(height: 12),
                  const DashedDivider(),
                  const SizedBox(height: 12),
                  
                  // Total
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('TỔNG TIỀN:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                      Text(currencyFormatter.format(amount), style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18, color: Colors.green)),
                    ],
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class DashedDivider extends StatelessWidget {
  const DashedDivider({super.key});

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (BuildContext context, BoxConstraints constraints) {
        final boxWidth = constraints.constrainWidth();
        const dashWidth = 5.0;
        const dashHeight = 1.0;
        final dashCount = (boxWidth / (2 * dashWidth)).floor();
        return Flex(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          direction: Axis.horizontal,
          children: List.generate(dashCount, (_) {
            return SizedBox(
              width: dashWidth,
              height: dashHeight,
              child: const DecoratedBox(
                decoration: BoxDecoration(color: Colors.grey),
              ),
            );
          }),
        );
      },
    );
  }
}
