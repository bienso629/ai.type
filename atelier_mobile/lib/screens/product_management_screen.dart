import 'package:flutter/material.dart';
import '../core/theme.dart';

class ProductManagementScreen extends StatefulWidget {
  const ProductManagementScreen({super.key});

  @override
  State<ProductManagementScreen> createState() => _ProductManagementScreenState();
}

class _ProductManagementScreenState extends State<ProductManagementScreen> {
  int _currentIndex = 2; // Products tab

  final List<Map<String, dynamic>> _products = [
    {
      'title': 'Vase Artisanale',
      'category': 'Ceramics Collection',
      'price': '\$120',
      'status': 'IN STOCK',
      'imageUrl': 'https://lh3.googleusercontent.com/aida-public/AB6AXuDL54Fk7pgrniQgtisZtBjskjYT7rbQEXB_dDduBOXsCqiOBXyljr61FrkPxdKKLS4KatMtrKeFrQsR29_H7o0nHyAmbH0ZQho4CAVaMfQzQNnOz5lCo4z7x1brJd12IkUBlx3ajCue9XHCzyGZy60oI5l_XTiyw3EcNVtzEon2ox-L1yphbJURj3HxqwF5td6wG3gYq6lRaSgnob-F1eiRQ5ZomPyJKVhwNS4Fh3zccO7kqohZeWlsfogQX4r86LtvKNszyY-jgss',
      'statusTextColor': Colors.black87,
      'statusBgColor': Colors.white.withOpacity(0.9),
    },
    {
      'title': 'Linen Bound Journal',
      'category': 'Stationery',
      'price': '\$45',
      'status': 'LOW STOCK',
      'imageUrl': 'https://lh3.googleusercontent.com/aida-public/AB6AXuAVCRX-Wpf_TpDu29xaaR70rMOghmJTBeegQXEUvCdVrkQnDFtOhDMWyjCAAmL4-kxqdSsiN6eeMvkdNp10J8k-oirUHznkIBfGARutHZCVIjioFpr1OtjMIbxuBaQyoY5AWKgOPHmg-C83s8A2hDLLa84Ue-bMOcY06zNz2PmuAdujhYF-C_qSlSw1fCzh8kI6wBkF469fn63QujaCO5dl5lCWk4PWxakhCFAR7_NoDVc2zCe3mlp1q_ETW2vVqqYs4sE32yKwdHM',
      'statusTextColor': const Color(0xFF785a1a), // on-secondary-container
      'statusBgColor': const Color(0xFFfed488).withOpacity(0.9), // secondary-container
    },
    {
      'title': 'Untitled Object',
      'category': 'Uncategorized',
      'price': '--',
      'status': 'DRAFT',
      'imageUrl': '',
      'statusTextColor': const Color(0xFF93000a), // on-error-container
      'statusBgColor': const Color(0xFFffdad6).withOpacity(0.9), // error-container
    },
  ];

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        backgroundColor: AppTheme.background,
        elevation: 0,
        title: Text(
          'Atelier',
          style: theme.textTheme.headlineMedium?.copyWith(
            fontWeight: FontWeight.bold,
            color: AppTheme.primary,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_none, color: AppTheme.primary),
            onPressed: () {},
          ),
          Padding(
            padding: const EdgeInsets.only(right: 16.0),
            child: CircleAvatar(
              radius: 16,
              backgroundImage: const NetworkImage(
                'https://lh3.googleusercontent.com/aida-public/AB6AXuDz7uKmaf-FAeDfpsTho5hPaE-jEt6B5grBIiHURTYIskr6rUwXhRVvcfVl5d3n9dMk125eaq5MvAlAoNVKoyUA1xC5GFRLuqMVasV8cCJLotfIYIqrf5HnBC8oUbkabUx1hObH_Blb5VyKuFpRARrNhpICZMUImmHKYbIGqEUmrjGb69aakwskNnFYaOlUP8PFrtmmt73gVIpSUmXK6FY3JpcI5GZ2qKIwAgo5WV8Ea7qqSNnVpnSwRANKvQ61ZZA5q9nUyKdcaw0',
              ),
              backgroundColor: Colors.grey[200],
            ),
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1.0),
          child: Container(
            color: Colors.grey[300],
            height: 1.0,
          ),
        ),
      ),
      body: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 32.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header Section
              Wrap(
                alignment: WrapAlignment.spaceBetween,
                crossAxisAlignment: WrapCrossAlignment.end,
                spacing: 24.0,
                runSpacing: 24.0,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Quản lý Sản phẩm',
                        style: theme.textTheme.headlineMedium?.copyWith(
                          color: AppTheme.primary,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Curate and manage your collection with precision.\nAn editorial view of your digital inventory.',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: Colors.grey[600],
                        ),
                      ),
                    ],
                  ),
                  
                  // Controls
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      _buildOutlinedButton('Filter', Icons.filter_list),
                      const SizedBox(width: 8),
                      _buildOutlinedButton('Sort', Icons.sort),
                      const SizedBox(width: 8),
                      _buildFilledButton('New Item', Icons.add),
                    ],
                  ),
                ],
              ),
              
              const SizedBox(height: 32),
              
              // Product Grid
              LayoutBuilder(
                builder: (context, constraints) {
                  int crossAxisCount = 1;
                  if (constraints.maxWidth > 600) crossAxisCount = 2;
                  if (constraints.maxWidth > 900) crossAxisCount = 3;

                  return GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: crossAxisCount,
                      childAspectRatio: 0.75, // Adjust aspect ratio for image and text
                      crossAxisSpacing: 32,
                      mainAxisSpacing: 32,
                    ),
                    itemCount: _products.length,
                    itemBuilder: (context, index) {
                      return _buildProductCard(_products[index], theme);
                    },
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildOutlinedButton(String label, IconData icon) {
    return OutlinedButton.icon(
      onPressed: () {},
      icon: Icon(icon, size: 18, color: AppTheme.primary),
      label: Text(
        label,
        style: const TextStyle(color: AppTheme.primary, fontWeight: FontWeight.w500),
      ),
      style: OutlinedButton.styleFrom(
        side: BorderSide(color: Colors.grey[300]!),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(4),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      ),
    );
  }

  Widget _buildFilledButton(String label, IconData icon) {
    return ElevatedButton.icon(
      onPressed: () {},
      icon: Icon(icon, size: 18, color: Colors.white),
      label: Text(
        label,
        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w500),
      ),
      style: ElevatedButton.styleFrom(
        backgroundColor: AppTheme.primary,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(4),
        ),
        elevation: 0,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      ),
    );
  }

  Widget _buildProductCard(Map<String, dynamic> product, ThemeData theme) {
    final bool hasImage = product['imageUrl'].toString().isNotEmpty;

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 32,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(8),
          hoverColor: Colors.grey[50],
          onTap: () {},
          child: Padding(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Image Container
                Expanded(
                  child: Container(
                    width: double.infinity,
                    decoration: BoxDecoration(
                      color: Colors.grey[200],
                      borderRadius: BorderRadius.circular(4),
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        if (hasImage)
                          Image.network(
                            product['imageUrl'],
                            fit: BoxFit.cover,
                          )
                        else
                          const Center(
                            child: Icon(
                              Icons.image_not_supported_outlined,
                              size: 48,
                              color: Colors.grey,
                            ),
                          ),
                        Positioned(
                          top: 12,
                          left: 12,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: product['statusBgColor'],
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              product['status'],
                              style: theme.textTheme.labelSmall?.copyWith(
                                color: product['statusTextColor'],
                                fontWeight: FontWeight.bold,
                                letterSpacing: 1.2,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                
                // Info Section
                Container(
                  padding: const EdgeInsets.only(top: 8.0),
                  decoration: BoxDecoration(
                    border: Border(
                      top: BorderSide(
                        color: Colors.grey[300]!,
                        width: 1,
                      ),
                    ),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              product['title'],
                              style: theme.textTheme.titleMedium?.copyWith(
                                color: !hasImage ? AppTheme.primary.withOpacity(0.5) : AppTheme.primary,
                                fontWeight: FontWeight.w500,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            const SizedBox(height: 4),
                            Text(
                              product['category'],
                              style: theme.textTheme.bodyMedium?.copyWith(
                                color: Colors.grey[600],
                              ),
                            ),
                          ],
                        ),
                      ),
                      Text(
                        product['price'],
                        style: theme.textTheme.titleMedium?.copyWith(
                          color: !hasImage ? AppTheme.primary.withOpacity(0.5) : AppTheme.primary,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
