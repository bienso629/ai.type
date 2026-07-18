import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

class HomeTab extends StatefulWidget {
  const HomeTab({super.key});

  @override
  State<HomeTab> createState() => _HomeTabState();
}

class _HomeTabState extends State<HomeTab> {
  bool isLoading = true;
  List<Map<String, dynamic>> collections = [];
  List<Map<String, dynamic>> videoProjects = [];
  int totalVideoProjects = 0;

  // Stats
  Map<String, dynamic> statistics = {};
  int totalArticles = 0;
  int activeDomains = 0;
  int avgArticles = 0;
  
  Map<String, dynamic> totalArticlesStatus = {'text': 'Tăng trưởng tốt', 'color': Colors.blue, 'icon': Icons.trending_up};
  Map<String, dynamic> activeDomainsStatus = {'text': 'Cần tối ưu thêm', 'color': Colors.red, 'icon': Icons.trending_down};
  Map<String, dynamic> avgArticlesStatus = {'text': 'Đạt mục tiêu', 'color': Colors.green, 'icon': Icons.trending_up};

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    // Simulate network delay
    await Future.delayed(const Duration(milliseconds: 800));

    // 1. Mock Collections (Ported from collection())
    final mockCollections = [
      {'_id': '1', 'title': 'Mô hình AI', 'count': 5, 'updatedAt': '1 day ago', 'icon': Icons.psychology},
      {'_id': '2', 'title': 'Coder đại chiến', 'count': 0, 'updatedAt': '1 day ago', 'icon': Icons.code},
      {'_id': '3', 'title': 'Dựng video bằng AI', 'count': 3, 'updatedAt': '2 days ago', 'icon': Icons.video_camera_back},
      {'_id': '4', 'title': 'Viết kịch bản', 'count': 12, 'updatedAt': '2 weeks ago', 'icon': Icons.edit_document},
    ];

    collections = mockCollections.map((col) {
      col['count'] = col['count'] ?? 0;
      return col;
    }).toList();

    // 2. Mock Video Projects (Ported from video projects processing)
    final mockProjects = [
      {
        'uuid': '46NLPydmM-',
        'title': 'Tiếng hát giữa nghĩa trang...',
        'clips': []
      },
      {
        'uuid': 'bUfH5CxTgwC',
        'title': 'Mổ xẻ bản cập nhật mới nhất...',
        'clips': [
          {'localFilePath': 'audio1.mp3'},
          {'audioFileName': 'audio2.mp3'}
        ]
      },
      {
        'uuid': '8WxnQCa_nm',
        'title': 'Sự khác biệt giữa zero-shot...',
        'clips': [
          {'localFilePath': 'audio1.mp3'},
          {'localFilePath': null}
        ]
      },
    ];

    final allProjects = mockProjects.where((p) => p['uuid'] != null && p['title'] != null).toList().reversed.map((p) {
      String statusLabel = 'BẢN NHÁP';
      Color statusColor = AppColors.primary;
      Color statusBg = AppColors.primary.withOpacity(0.1);

      List clips = p['clips'] as List;
      if (clips.isEmpty) {
        statusLabel = 'TRỐNG';
        statusColor = Colors.grey[600]!;
        statusBg = Colors.grey[200]!;
      } else {
        bool hasAudio = clips.any((c) => c['localFilePath'] != null || c['audioFileName'] != null);
        bool allAudio = clips.every((c) => c['localFilePath'] != null || c['audioFileName'] != null);
        
        if (allAudio) {
          statusLabel = 'SẴN SÀNG';
          statusColor = Colors.green[600]!;
          statusBg = Colors.green[100]!;
        } else if (hasAudio) {
          statusLabel = 'ĐANG XỬ LÝ';
          statusColor = Colors.amber[700]!;
          statusBg = Colors.amber[100]!;
        }
      }
      
      return {
        ...p,
        'statusLabel': statusLabel,
        'statusColor': statusColor,
        'statusBg': statusBg,
        'sceneCount': clips.length
      };
    }).toList();
    
    totalVideoProjects = allProjects.length;
    videoProjects = allProjects.take(12).toList();

    // 3. Mock Statistics and Logic (Ported from updateChart())
    Map<String, dynamic> domainStatsData = {
      'ai.type.vn': {1: 10, 2: 15, 3: 0, 4: 5},
      'coder.vn': {1: 0, 2: 0, 3: 20, 4: 25},
    };
    
    int total = 0;
    Set<String> activeDoms = {};
    List<int> monthlyTotals = List.filled(12, 0);
    List<int> targetMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    
    domainStatsData.forEach((d, data) {
      bool hasArticlesInPeriod = false;
      for (int m = 1; m <= 12; m++) {
        if (data[m] != null) {
          monthlyTotals[m - 1] += data[m] as int;
          if (targetMonths.contains(m)) {
            total += data[m] as int;
            hasArticlesInPeriod = true;
          }
        }
      }
      if (hasArticlesInPeriod) activeDoms.add(d);
    });

    int currentPeriodTotal = monthlyTotals[3]; // Simulated Month 4
    int previousPeriodTotal = monthlyTotals[2]; // Simulated Month 3
    
    totalArticles = total;
    activeDomains = activeDoms.length;
    int totalDomainsCount = 2; // fake allDomains.length
    
    avgArticles = (total / totalDomainsCount).round();

    if (currentPeriodTotal >= previousPeriodTotal) {
      totalArticlesStatus = {'text': 'Tăng trưởng tốt', 'color': Colors.blue[600], 'icon': Icons.trending_up};
    } else {
      totalArticlesStatus = {'text': 'Tăng trưởng yếu', 'color': Colors.red[600], 'icon': Icons.trending_down};
    }

    int totalDomainsCountForStatus = mockCollections.length;
    if (activeDomains > totalDomainsCountForStatus / 2) {
      activeDomainsStatus = {'text': 'Hoạt động tốt', 'color': Colors.green[600], 'icon': Icons.trending_up};
    } else {
      activeDomainsStatus = {'text': 'Hoạt động yếu', 'color': Colors.red[600], 'icon': Icons.trending_down};
    }

    int avgTargetPerMonth = 20;
    if (avgArticles >= avgTargetPerMonth) {
      avgArticlesStatus = {'text': 'Đạt mục tiêu', 'color': Colors.green[600], 'icon': Icons.trending_up};
    } else {
      avgArticlesStatus = {'text': 'Chưa đạt mục tiêu', 'color': Colors.red[600], 'icon': Icons.trending_down};
    }

    setState(() {
      isLoading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (isLoading) {
      return const Center(child: CircularProgressIndicator(color: AppColors.primary));
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 1. Render Statistics from Angular Logic
          const Text(
            'Thống kê tổng quan',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.textPrimary),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: _buildStatCard('Tổng bài viết', totalArticles.toString(), totalArticlesStatus)),
              const SizedBox(width: 12),
              Expanded(child: _buildStatCard('Domain Active', activeDomains.toString(), activeDomainsStatus)),
              const SizedBox(width: 12),
              Expanded(child: _buildStatCard('TB Bài/Domain', avgArticles.toString(), avgArticlesStatus)),
            ],
          ),
          const SizedBox(height: 32),

          // 2. Render Collections
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '${collections.length} tệp của bạn',
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.textPrimary),
              ),
              TextButton(
                onPressed: () {},
                child: const Text('Xem tất cả', style: TextStyle(color: AppColors.primary)),
              ),
            ],
          ),
          const SizedBox(height: 12),
          GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: 2,
            crossAxisSpacing: 16,
            mainAxisSpacing: 16,
            childAspectRatio: 1.4,
            children: collections.map((col) {
              return _buildFileCard(
                col['title'], 
                col['updatedAt'], 
                '${col['count']} BẢN GHI', 
                col['icon']
              );
            }).toList(),
          ),
          const SizedBox(height: 32),
          
          // 3. Render Video Projects from Angular Logic
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Kịch bản video',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.textPrimary),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.primary.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text('$totalVideoProjects đang xây dựng', style: const TextStyle(color: AppColors.primary, fontSize: 12, fontWeight: FontWeight.bold)),
              ),
            ],
          ),
          const SizedBox(height: 16),
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: videoProjects.length,
            separatorBuilder: (context, index) => const SizedBox(height: 16),
            itemBuilder: (context, index) {
              final proj = videoProjects[index];
              return _buildScriptCard(
                proj['title'],
                proj['uuid'],
                proj['sceneCount'],
                proj['statusLabel'],
                proj['statusColor'],
                proj['statusBg']
              );
            },
          ),
          const SizedBox(height: 80),
        ],
      ),
    );
  }

  Widget _buildStatCard(String title, String value, Map<String, dynamic> status) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.accent.withOpacity(0.5)),
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.02), blurRadius: 8, offset: const Offset(0, 2)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontSize: 11, color: AppColors.textSecondary, fontWeight: FontWeight.w600)),
          const SizedBox(height: 4),
          Text(value, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.textPrimary)),
          const SizedBox(height: 6),
          Row(
            children: [
              Icon(status['icon'], size: 12, color: status['color']),
              const SizedBox(width: 4),
              Expanded(
                child: Text(
                  status['text'],
                  style: TextStyle(fontSize: 9, color: status['color'], fontWeight: FontWeight.w600),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              )
            ],
          )
        ],
      ),
    );
  }

  Widget _buildFileCard(String title, String time, String records, IconData icon) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.accent.withOpacity(0.5)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.03),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Icon(icon, size: 20, color: AppColors.primary),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                    color: AppColors.textPrimary,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                time,
                style: const TextStyle(fontSize: 11, color: AppColors.textSecondary),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.accent.withOpacity(0.5),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  records,
                  style: const TextStyle(
                    fontSize: 10,
                    color: AppColors.textPrimary,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildScriptCard(String title, String id, int scenes, String statusLabel, Color statusColor, Color statusBg) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.accent.withOpacity(0.5)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.03),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontWeight: FontWeight.w700,
              fontSize: 15,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'ID: $id',
            style: const TextStyle(
              fontFamily: 'monospace',
              fontSize: 12,
              color: AppColors.textSecondary,
            ),
          ),
          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: AppColors.background,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(Icons.videocam_outlined, size: 16, color: AppColors.textSecondary),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '$scenes cảnh quay',
                    style: const TextStyle(fontSize: 13, color: AppColors.textSecondary, fontWeight: FontWeight.w500),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: statusBg,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  statusLabel,
                  style: TextStyle(
                    fontSize: 11,
                    color: statusColor,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
