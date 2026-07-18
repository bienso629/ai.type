import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:fl_chart/fl_chart.dart';
import '../theme/app_colors.dart';
import '../services/api_service.dart';

class HomeTab extends StatefulWidget {
  const HomeTab({super.key});

  @override
  State<HomeTab> createState() => _HomeTabState();
}

class _HomeTabState extends State<HomeTab> {
  bool _isLoading = true;
  List<dynamic> collections = [];
  List<dynamic> videoProjects = [];
  
  int totalArticles = 0;
  int activeDomains = 0;
  int avgArticles = 0;
  
  Map<String, dynamic> totalArticlesStatus = {'text': 'Tăng trưởng tốt', 'color': Colors.blue, 'icon': FontAwesomeIcons.arrowTrendUp};
  Map<String, dynamic> activeDomainsStatus = {'text': 'Cần tối ưu thêm', 'color': Colors.red, 'icon': FontAwesomeIcons.arrowTrendDown};
  Map<String, dynamic> avgArticlesStatus = {'text': 'Đạt mục tiêu', 'color': Colors.green, 'icon': FontAwesomeIcons.arrowTrendUp};

  int _selectedYear = DateTime.now().year;
  List<int> _yearsList = [DateTime.now().year - 3, DateTime.now().year - 2, DateTime.now().year - 1, DateTime.now().year];

  List<double> _monthlyTotals = List.filled(12, 0);
  List<double> _monthlyActiveDomains = List.filled(12, 0);
  List<double> _monthlyAvg = List.filled(12, 0);

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final statsResult = await ApiService.getStatistics(_selectedYear);
      print('API Statistics: ');
      print(statsResult);
      
      final collectionsResult = await ApiService.getCollections();
      print('API Collections: ');
      print(collectionsResult);

      if (collectionsResult != null && collectionsResult['success'] == true) {
        collections = collectionsResult['data']?.map((col) {
          int count = col['count'] ?? 0;
          if (count == 0 && col['uuid'] != null && col['uuid'] is List) {
            count = (col['uuid'] as List).length;
          }
          return {
            '_id': col['_id'],
            'title': col['title'] ?? 'Unnamed',
            'count': count,
            'updatedAt': col['updatedAt'] ?? 'Unknown',
            'icon': FontAwesomeIcons.folder,
          };
        }).toList() ?? [];
      }

      if (statsResult != null && statsResult['success'] == true) {
        final nodes = statsResult['data'] ?? [];
        Map<String, dynamic> domainStats = nodes.length > 3 && nodes[3] != null ? nodes[3] : {};
        
        _monthlyTotals = List.filled(12, 0);
        _monthlyActiveDomains = List.filled(12, 0);
        _monthlyAvg = List.filled(12, 0);
        
        int total = 0;
        Set<String> activeDoms = {};
        
        for (var entry in domainStats.entries) {
          var domainData = entry.value;
          bool hasArticles = false;
          if (domainData is Map) {
            for (int m = 1; m <= 12; m++) {
              int val = domainData[m.toString()] ?? domainData[m] ?? 0;
              if (val > 0) {
                _monthlyTotals[m - 1] += val;
                total += val;
                hasArticles = true;
              }
            }
          }
          if (hasArticles) activeDoms.add(entry.key);
        }

        for (int m = 1; m <= 12; m++) {
          int activeCount = 0;
          for (var entry in domainStats.entries) {
            var domainData = entry.value;
            if (domainData is Map) {
              int val = domainData[m.toString()] ?? domainData[m] ?? 0;
              if (val > 0) activeCount++;
            }
          }
          _monthlyActiveDomains[m - 1] = activeCount.toDouble();
          _monthlyAvg[m - 1] = activeCount > 0 ? (_monthlyTotals[m - 1] / activeCount).roundToDouble() : 0;
        }

        totalArticles = total;
        activeDomains = activeDoms.length;
        avgArticles = activeDomains > 0 ? (total / activeDomains).round() : 0;

        int currentPeriodTotal = _monthlyTotals[11].toInt();
        int previousPeriodTotal = _monthlyTotals[10].toInt();

        if (currentPeriodTotal >= previousPeriodTotal) {
          totalArticlesStatus = {'text': 'Tăng trưởng tốt', 'color': Colors.blue[600], 'icon': FontAwesomeIcons.arrowTrendUp};
        } else {
          totalArticlesStatus = {'text': 'Tăng trưởng yếu', 'color': Colors.red[600], 'icon': FontAwesomeIcons.arrowTrendDown};
        }

        if (activeDomains > 0) {
          activeDomainsStatus = {'text': 'Hoạt động tốt', 'color': Colors.green[600], 'icon': FontAwesomeIcons.arrowTrendUp};
        } else {
          activeDomainsStatus = {'text': 'Hoạt động yếu', 'color': Colors.red[600], 'icon': FontAwesomeIcons.arrowTrendDown};
        }

        int avgTargetPerMonth = 20;
        if (avgArticles >= avgTargetPerMonth) {
          avgArticlesStatus = {'text': 'Đạt mục tiêu', 'color': Colors.green[600], 'icon': FontAwesomeIcons.arrowTrendUp};
        } else {
          avgArticlesStatus = {'text': 'Chưa đạt mục tiêu', 'color': Colors.red[600], 'icon': FontAwesomeIcons.arrowTrendDown};
        }
      }
    } catch (e) {
      print('Error loading data: \$e');
    }

    setState(() => _isLoading = false);
  }

  Widget _buildSparkline(List<double> data, Color color) {
    if (data.isEmpty) return const SizedBox();
    double maxY = data.reduce((a, b) => a > b ? a : b);
    if (maxY == 0) maxY = 10;
    
    return LineChart(
      LineChartData(
        gridData: FlGridData(show: false),
        titlesData: FlTitlesData(show: false),
        borderData: FlBorderData(show: false),
        minX: 0,
        maxX: 11,
        minY: 0,
        maxY: maxY * 1.5,
        lineBarsData: [
          LineChartBarData(
            spots: List.generate(12, (index) => FlSpot(index.toDouble(), data[index])),
            isCurved: true,
            color: color,
            barWidth: 2,
            isStrokeCapRound: true,
            dotData: FlDotData(show: false),
            belowBarData: BarAreaData(
              show: true,
              gradient: LinearGradient(
                colors: [
                  color.withOpacity(0.4),
                  color.withOpacity(0.0),
                ],
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMainChart() {
    double maxY = _monthlyTotals.reduce((a, b) => a > b ? a : b);
    if (maxY == 0) maxY = 10;

    return Container(
      height: 300,
      padding: const EdgeInsets.only(right: 16, left: 0, top: 16, bottom: 0),
      child: LineChart(
        LineChartData(
          gridData: FlGridData(
            show: true,
            drawVerticalLine: false,
            horizontalInterval: maxY / 5 > 0 ? maxY / 5 : 1,
            getDrawingHorizontalLine: (value) {
              return FlLine(
                color: Colors.grey.withOpacity(0.2),
                strokeWidth: 1,
              );
            },
          ),
          titlesData: FlTitlesData(
            show: true,
            rightTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
            topTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
            bottomTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                reservedSize: 30,
                interval: 1,
                getTitlesWidget: (value, meta) {
                  if (value % 1 == 0 && value >= 0 && value <= 11) {
                    return SideTitleWidget(
                      meta: meta,
                      child: Text('T\${value.toInt() + 1}', style: const TextStyle(color: AppColors.textSecondary, fontSize: 10)),
                    );
                  }
                  return const SizedBox();
                },
              ),
            ),
            leftTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                interval: maxY / 5 > 0 ? maxY / 5 : 1,
                getTitlesWidget: (value, meta) {
                  if (value == 0) return const SizedBox();
                  String text = value >= 1000 ? '\${(value / 1000).toStringAsFixed(1)}k' : value.toInt().toString();
                  return Text(text, style: const TextStyle(color: AppColors.textSecondary, fontSize: 10), textAlign: TextAlign.right);
                },
                reservedSize: 36,
              ),
            ),
          ),
          borderData: FlBorderData(show: false),
          minX: 0,
          maxX: 11,
          minY: 0,
          maxY: maxY * 1.2,
          lineBarsData: [
            LineChartBarData(
              spots: List.generate(12, (index) => FlSpot(index.toDouble(), _monthlyTotals[index])),
              isCurved: true,
              color: AppColors.primary,
              barWidth: 3,
              isStrokeCapRound: true,
              dotData: FlDotData(show: true, getDotPainter: (spot, percent, barData, index) => FlDotCirclePainter(radius: 4, color: Colors.white, strokeWidth: 2, strokeColor: AppColors.primary)),
              belowBarData: BarAreaData(
                show: true,
                gradient: LinearGradient(
                  colors: [
                    AppColors.primary.withOpacity(0.4),
                    AppColors.primary.withOpacity(0.05),
                  ],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatCard(String title, int value, Map<String, dynamic> status, List<double> chartData, Color chartColor) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.grey.withOpacity(0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: AppColors.textSecondary)),
                const SizedBox(height: 8),
                Text(value.toString(), style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: AppColors.textPrimary)),
                const SizedBox(height: 8),
                Row(
                  children: [
                    FaIcon(status['icon'], size: 12, color: status['color']),
                    const SizedBox(width: 4),
                    Flexible(
                      child: Text(status['text'], style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: status['color']), overflow: TextOverflow.ellipsis),
                    ),
                  ],
                ),
              ],
            ),
          ),
          SizedBox(
            height: 60,
            width: double.infinity,
            child: _buildSparkline(chartData, chartColor),
          ),
        ],
      ),
    );
  }

  Widget _buildCollectionCard(dynamic icon, String title, int count, String date, Color color) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.grey.withOpacity(0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontWeight: FontWeight.w600,
              fontSize: 16,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Flexible(
                child: Row(
                  children: [
                    FaIcon(FontAwesomeIcons.clock, size: 12, color: AppColors.textSecondary),
                    const SizedBox(width: 4),
                    const Flexible(
                      child: Text(
                        'Vài ngày trước',
                        style: TextStyle(color: AppColors.textSecondary, fontSize: 11),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.blue.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  '\$count bài viết',
                  style: const TextStyle(color: Colors.blue, fontSize: 11, fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    return SingleChildScrollView(
      physics: const BouncingScrollPhysics(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Main Chart Section
          Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Text('Số lượng bài viết tạo ra trong \$_selectedYear', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                      decoration: BoxDecoration(
                        border: Border.all(color: Colors.grey.withOpacity(0.3)),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: DropdownButtonHideUnderline(
                        child: DropdownButton<int>(
                          value: _selectedYear,
                          isDense: true,
                          icon: const Padding(
                            padding: EdgeInsets.only(left: 8),
                            child: FaIcon(FontAwesomeIcons.chevronDown, size: 12, color: AppColors.textSecondary),
                          ),
                          items: _yearsList.map((int year) {
                            return DropdownMenuItem<int>(
                              value: year,
                              child: Text(year.toString(), style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
                            );
                          }).toList(),
                          onChanged: (int? newValue) {
                            if (newValue != null) {
                              setState(() {
                                _selectedYear = newValue;
                                _loadData();
                              });
                            }
                          },
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                Container(
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: Colors.grey.withOpacity(0.2)),
                  ),
                  child: _buildMainChart(),
                ),
              ],
            ),
          ),

          // Stat Cards
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Column(
              children: [
                _buildStatCard('Tổng số bài viết', totalArticles, totalArticlesStatus, _monthlyTotals, Colors.blue),
                const SizedBox(height: 16),
                _buildStatCard('Domain hoạt động', activeDomains, activeDomainsStatus, _monthlyActiveDomains, Colors.red),
                const SizedBox(height: 16),
                _buildStatCard('Trung bình bài / Domain', avgArticles, avgArticlesStatus, _monthlyAvg, Colors.green),
              ],
            ),
          ),

          const SizedBox(height: 32),
          
          // Collections Section
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('\${collections.length} Danh sách Collection', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
                const SizedBox(height: 16),
                if (collections.isEmpty)
                  Center(
                    child: Padding(
                      padding: const EdgeInsets.all(40),
                      child: Column(
                        children: [
                          const FaIcon(FontAwesomeIcons.folderOpen, size: 64, color: AppColors.textSecondary),
                          const SizedBox(height: 16),
                          const Text('Bạn chưa có collection nào', style: TextStyle(fontSize: 16, color: AppColors.textSecondary)),
                        ],
                      ),
                    ),
                  )
                else
                    GridView.builder(
                      padding: EdgeInsets.zero,
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 1,
                        crossAxisSpacing: 16,
                        mainAxisSpacing: 16,
                        childAspectRatio: 3.5,
                      ),
                      itemCount: collections.length,
                      itemBuilder: (context, index) {
                        final col = collections[index];
                        return _buildCollectionCard(col['icon'], col['title'], col['count'], col['updatedAt'], AppColors.primary);
                      },
                    ),
                ],
              ),
            ),
            
            const SizedBox(height: 32),
            
            // Video Projects Section
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('\${videoProjects.length} Dự án Video đang xây dựng', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
                  const SizedBox(height: 16),
                  if (videoProjects.isEmpty)
                    const Text('Bạn chưa có dự án video nào.', style: TextStyle(color: AppColors.textSecondary, fontSize: 14))
                  else
                    ListView.separated(
                      padding: EdgeInsets.zero,
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      itemCount: videoProjects.length,
                      separatorBuilder: (context, index) => const SizedBox(height: 16),
                      itemBuilder: (context, index) {
                        final proj = videoProjects[index];
                        return Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: AppColors.surface,
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: Colors.grey.withOpacity(0.2)),
                          ),
                          child: Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.all(10),
                                decoration: BoxDecoration(
                                  color: Colors.purple.withOpacity(0.1),
                                  shape: BoxShape.circle,
                                ),
                                child: const FaIcon(FontAwesomeIcons.video, size: 16, color: Colors.purple),
                              ),
                              const SizedBox(width: 16),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(proj['title'] ?? 'Unnamed Project', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
                                    const SizedBox(height: 4),
                                    Text('ID: \${proj["uuid"]}', style: const TextStyle(color: AppColors.textSecondary, fontSize: 11, fontFamily: 'monospace')),
                                  ],
                                ),
                              ),
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                decoration: BoxDecoration(
                                  color: Colors.amber.withOpacity(0.1),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: const Text('Đang xử lý', style: TextStyle(color: Colors.amber, fontSize: 12, fontWeight: FontWeight.w600)),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
                ],
              ),
            ),
            
            const SizedBox(height: 32),
          ],
        ),
      );
  }
}
