import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
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
  int allDomainsLength = 0;
  int avgArticles = 0;
  int _evalMonthToDisplay = 1;
  
  Map<String, dynamic> totalArticlesStatus = {'text': 'Tăng trưởng tốt', 'color': Colors.blue, 'icon': FontAwesomeIcons.arrowTrendUp};
  Map<String, dynamic> activeDomainsStatus = {'text': 'Cần tối ưu thêm', 'color': Colors.red, 'icon': FontAwesomeIcons.arrowTrendDown};
  Map<String, dynamic> avgArticlesStatus = {'text': 'Đạt mục tiêu', 'color': Colors.green, 'icon': FontAwesomeIcons.arrowTrendUp};

  int _selectedYear = DateTime.now().year;
  List<int> _yearsList = [DateTime.now().year - 3, DateTime.now().year - 2, DateTime.now().year - 1, DateTime.now().year];

  List<double> _monthlyTotals = List.filled(12, 0);
  List<double> _monthlyActiveDomains = List.filled(12, 0);
  List<double> _monthlyAvg = List.filled(12, 0);
  List<double> _domainActuals = [];
  List<double> _domainTargets = [];
  Map<String, List<double>> _domainMonthlyTotals = {};

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData({bool forceRefresh = false}) async {
    if (!forceRefresh) setState(() => _isLoading = true);
    try {
      final prefs = await SharedPreferences.getInstance();
      final activeInfoStr = prefs.getString('active_info');
      if (activeInfoStr == null) return;
      
      final activeInfo = jsonDecode(activeInfoStr);
      final uid = activeInfo['user']['id'] ?? activeInfo['user']['_id'] ?? 'default';
      final cacheKey = 'dashboard_cache_${uid}_$_selectedYear';

      dynamic statsResult;
      dynamic collectionsResult;
      dynamic domainsResult;

      bool fetchedFromNetwork = false;

      if (!forceRefresh) {
        final cachedData = prefs.getString(cacheKey);
        if (cachedData != null) {
          final data = jsonDecode(cachedData);
          statsResult = data['statsResult'];
          collectionsResult = data['collectionsResult'];
          domainsResult = data['domainsResult'];
        }
      }

      if (statsResult == null) {
        statsResult = await ApiService.getStatistics(_selectedYear);
        collectionsResult = await ApiService.getCollections();
        domainsResult = await ApiService.getAllDomains();
        fetchedFromNetwork = true;
      }

      if (fetchedFromNetwork) {
        final cacheData = {
          'statsResult': statsResult,
          'collectionsResult': collectionsResult,
          'domainsResult': domainsResult,
        };
        await prefs.setString(cacheKey, jsonEncode(cacheData));
      }
      if (collectionsResult != null && collectionsResult['success'] == true) {
        collections = collectionsResult['data']?.map((col) {
          int count = 0;
          if (col['count'] != null) {
            count = col['count'] is String ? int.tryParse(col['count']) ?? 0 : col['count'];
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

      if (domainsResult != null && domainsResult['success'] == true) {
        allDomainsLength = (domainsResult['data'] as List?)?.length ?? 0;
      }

      if (statsResult != null && statsResult['success'] == true) {
        final nodes = statsResult['data'] ?? [];
        Map<String, dynamic> domainStats = nodes.length > 3 && nodes[3] != null ? nodes[3] : {};
        
        _monthlyTotals = List.filled(12, 0);
        _monthlyActiveDomains = List.filled(12, 0);
        _monthlyAvg = List.filled(12, 0);
        _domainMonthlyTotals.clear();
        
        int total = 0;
        Set<String> activeDoms = {};
        
        for (var entry in domainStats.entries) {
          var domainData = entry.value;
          bool hasArticles = false;
          List<double> thisDomainTotals = List.filled(12, 0);
          if (domainData is Map) {
            for (int m = 1; m <= 12; m++) {
              int val = domainData[m.toString()] ?? domainData[m] ?? 0;
              thisDomainTotals[m - 1] = val.toDouble();
              if (val > 0) {
                _monthlyTotals[m - 1] += val;
                total += val;
                hasArticles = true;
              }
            }
          }
          if (hasArticles) {
            activeDoms.add(entry.key);
            _domainMonthlyTotals[entry.key] = thisDomainTotals;
          }
        }

        // Sort domains by total articles (descending) to match Angular's color assignment
        var sortedEntries = _domainMonthlyTotals.entries.toList()..sort((a, b) {
          double totalA = a.value.fold(0.0, (sum, val) => sum + val);
          double totalB = b.value.fold(0.0, (sum, val) => sum + val);
          return totalB.compareTo(totalA);
        });
        _domainMonthlyTotals = Map.fromEntries(sortedEntries);

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
        }

        int lastActiveMonth = 11;
        while (lastActiveMonth >= 0 && _monthlyTotals[lastActiveMonth] == 0) {
          lastActiveMonth--;
        }

        int currentPeriodTotal = 0;
        int previousPeriodTotal = 0;

        if (lastActiveMonth > 0) {
          currentPeriodTotal = _monthlyTotals[lastActiveMonth].toInt();
          previousPeriodTotal = _monthlyTotals[lastActiveMonth - 1].toInt();
        } else if (lastActiveMonth == 0) {
          currentPeriodTotal = _monthlyTotals[0].toInt();
          previousPeriodTotal = 0;
        }

        for (int i = 0; i < 12; i++) {
          int activeCount = _monthlyActiveDomains[i].toInt();
          int mTotal = _monthlyTotals[i].toInt();
          int mAvg = activeCount > 0 ? (mTotal / activeCount).round() : 0;
          _monthlyAvg[i] = mAvg.toDouble();
        }

        totalArticles = total;
        activeDomains = activeDoms.length;
        
        int evalMonth = lastActiveMonth >= 0 ? lastActiveMonth + 1 : 1;
        int totalDomainsCount = allDomainsLength > 0 ? allDomainsLength : (activeDomains > 0 ? activeDomains : 1);
        avgArticles = (currentPeriodTotal / totalDomainsCount).round();

        // Populate domain stats for the 3rd chart
        List<String> domainsToChart = [];
        if (domainsResult != null && domainsResult['success'] == true) {
          for (var d in domainsResult['data']) {
            domainsToChart.add(d['domain'] ?? d.toString());
          }
        } else {
          domainsToChart = activeDoms.toList();
        }

        _domainActuals.clear();
        _domainTargets.clear();
        for (var dom in domainsToChart) {
          int actual = 0;
          if (domainStats.containsKey(dom) && domainStats[dom] is Map) {
            actual = domainStats[dom][evalMonth.toString()] ?? domainStats[dom][evalMonth] ?? 0;
          }
          _domainActuals.add(actual.toDouble());
          _domainTargets.add(20.0); // Hardcoded target
        }

        // Save evalMonth for UI
        _evalMonthToDisplay = evalMonth;

        if (currentPeriodTotal >= previousPeriodTotal) {
          totalArticlesStatus = {'text': 'Tăng trưởng tốt', 'color': Colors.blue[600], 'icon': FontAwesomeIcons.arrowTrendUp};
        } else {
          totalArticlesStatus = {'text': 'Tăng trưởng yếu', 'color': Colors.red[600], 'icon': FontAwesomeIcons.arrowTrendDown};
        }

        int totalDomainsCountForStatus = collections.length;
        if (activeDomains > totalDomainsCountForStatus / 2) {
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
            belowBarData: BarAreaData(show: false),
          ),
        ],
      ),
    );
  }

  Widget _buildDomainSparkline(List<double> actuals, List<double> targets, Color actualColor, Color targetColor) {
    if (actuals.isEmpty || targets.isEmpty) return const SizedBox();
    
    double maxY1 = actuals.reduce((a, b) => a > b ? a : b);
    double maxY2 = targets.reduce((a, b) => a > b ? a : b);
    double maxY = maxY1 > maxY2 ? maxY1 : maxY2;
    if (maxY == 0) maxY = 10;
    
    return LineChart(
      LineChartData(
        gridData: FlGridData(show: false),
        titlesData: FlTitlesData(show: false),
        borderData: FlBorderData(show: false),
        minX: 0,
        maxX: (actuals.length > 1 ? actuals.length - 1 : 1).toDouble(),
        minY: 0,
        maxY: maxY * 1.5,
        lineBarsData: [
          LineChartBarData(
            spots: List.generate(targets.length, (index) => FlSpot(index.toDouble(), targets[index])),
            isCurved: true,
            color: targetColor,
            barWidth: 2,
            isStrokeCapRound: true,
            dashArray: [4, 4],
            dotData: FlDotData(show: false),
            belowBarData: BarAreaData(show: false),
          ),
          LineChartBarData(
            spots: List.generate(actuals.length, (index) => FlSpot(index.toDouble(), actuals[index])),
            isCurved: true,
            color: actualColor,
            barWidth: 2,
            isStrokeCapRound: true,
            dotData: FlDotData(show: false),
            belowBarData: BarAreaData(show: false),
          ),
        ],
      ),
    );
  }

  List<Color> _chartColors = [
    const Color(0xFF008FFB), const Color(0xFF00E396), const Color(0xFFFEB019), 
    const Color(0xFFFF4560), const Color(0xFF775DD0), const Color(0xFF3F51B5), 
    const Color(0xFF546E7A), const Color(0xFFD4526E), const Color(0xFF8D5B4C),
  ];

  List<LineChartBarData> _buildChartLines() {
    if (_domainMonthlyTotals.isEmpty) {
      return [
        LineChartBarData(
          spots: List.generate(12, (index) => FlSpot(index.toDouble(), _monthlyTotals[index])),
          isCurved: true,
          preventCurveOverShooting: true,
          color: AppColors.primary,
          barWidth: 3,
          isStrokeCapRound: true,
          dotData: FlDotData(show: false),
        )
      ];
    }

    List<LineChartBarData> lines = [];
    int colorIndex = 0;
    
    _domainMonthlyTotals.forEach((domain, totals) {
      final color = _chartColors[colorIndex % _chartColors.length];
      colorIndex++;
      
      lines.add(
        LineChartBarData(
          spots: List.generate(12, (index) => FlSpot(index.toDouble(), totals[index])),
          isCurved: true,
          preventCurveOverShooting: true,
          color: color,
          barWidth: 3,
          isStrokeCapRound: true,
          dotData: FlDotData(show: false),
          belowBarData: BarAreaData(
            show: true,
            gradient: LinearGradient(
              colors: [color.withOpacity(0.2), color.withOpacity(0.0)],
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
            ),
          ),
        )
      );
    });
    
    return lines;
  }

  Widget _buildLegend() {
    if (_domainMonthlyTotals.isEmpty) return const SizedBox();
    
    int colorIndex = 0;
    List<Widget> legendItems = [];
    
    _domainMonthlyTotals.forEach((domain, totals) {
      final color = _chartColors[colorIndex % _chartColors.length];
      colorIndex++;
      
      legendItems.add(
        Padding(
          padding: const EdgeInsets.only(right: 16, bottom: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(width: 12, height: 12, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
              const SizedBox(width: 6),
              Text(domain, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
            ],
          ),
        )
      );
    });
    
    return Wrap(
      alignment: WrapAlignment.center,
      children: legendItems,
    );
  }

  Widget _buildMainChart() {
    double maxY = _monthlyTotals.reduce((a, b) => a > b ? a : b);
    if (maxY == 0) maxY = 10;

    return Column(
      children: [
        Container(
          height: 300,
          padding: const EdgeInsets.only(right: 16, left: 0, top: 16, bottom: 0),
          child: LineChart(
            LineChartData(
          gridData: FlGridData(show: false),
          titlesData: FlTitlesData(
            show: true,
            rightTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
            topTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
            leftTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
            bottomTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                reservedSize: 30,
                interval: 1,
                getTitlesWidget: (value, meta) {
                  if (value % 1 == 0 && value >= 0 && value <= 11) {
                    return SideTitleWidget(
                      meta: meta,
                      child: Text('T${value.toInt() + 1}', style: const TextStyle(color: AppColors.textSecondary, fontSize: 10)),
                    );
                  }
                  return const SizedBox();
                },
              ),
            ),
          ),
          borderData: FlBorderData(show: false),
          minX: 0,
          maxX: 11,
          minY: 0,
          maxY: maxY * 1.2,
          lineBarsData: _buildChartLines(),
        ),
      ),
      ), // This closes Container
      const SizedBox(height: 16),
      _buildLegend(),
      ],
    );
  }

  Widget _buildStatCard(String title, int value, Map<String, dynamic> status, List<double> chartData, Color chartColor, {bool isDomainChart = false}) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.grey.withOpacity(0.2)),
      ),
      child: Padding(
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
            const SizedBox(height: 16),
            SizedBox(
              height: 40,
              width: double.infinity,
              child: isDomainChart 
                  ? _buildDomainSparkline(_domainActuals, _domainTargets, chartColor, const Color(0xFF94A3B8))
                  : _buildSparkline(chartData, chartColor),
            ),
          ],
        ),
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
                  '$count bài viết',
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

    return RefreshIndicator(
      onRefresh: () => _loadData(forceRefresh: true),
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(20.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Main Chart Section
            Padding(
              padding: const EdgeInsets.only(bottom: 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Số lượng bài viết tạo ra', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 24),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: AppColors.surface,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: Colors.grey.withOpacity(0.2)),
                    ),
                    child: Column(
                      children: [
                        Align(
                          alignment: Alignment.centerRight,
                          child: Container(
                            height: 46,
                            padding: const EdgeInsets.symmetric(horizontal: 12),
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
                        ),
                        const SizedBox(height: 16),
                        _buildMainChart(),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            // Stat Cards
            Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: Column(
                children: [
                  _buildStatCard('Tổng số bài viết', totalArticles, totalArticlesStatus, _monthlyTotals, Colors.blue),
                  const SizedBox(height: 16),
                  _buildStatCard('Domain hoạt động', activeDomains, activeDomainsStatus, _monthlyActiveDomains, Colors.red),
                  const SizedBox(height: 16),
                  _buildStatCard("Trung bình bài tháng ${_evalMonthToDisplay < 10 ? '0$_evalMonthToDisplay' : _evalMonthToDisplay} / Domain", avgArticles, avgArticlesStatus, _monthlyAvg, Colors.green, isDomainChart: true),
                ],
              ),
            ),

            const SizedBox(height: 32),
            
            // Collections Section
            Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${collections.length} Danh sách Collection', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
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
              padding: const EdgeInsets.only(bottom: 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${videoProjects.length} Dự án Video đang xây dựng', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
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
                                    Text('ID: ${proj["uuid"]}', style: const TextStyle(color: AppColors.textSecondary, fontSize: 11, fontFamily: 'monospace')),
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
      ),
    );
  }
}
