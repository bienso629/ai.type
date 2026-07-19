import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import '../services/api_service.dart';

class NotificationPopup extends StatefulWidget {
  const NotificationPopup({super.key});

  @override
  State<NotificationPopup> createState() => _NotificationPopupState();
}

class _NotificationPopupState extends State<NotificationPopup> {
  List<dynamic> _notifications = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _fetchNotifications();
  }

  Future<void> _fetchNotifications() async {
    try {
      final res = await ApiService.getNotifications();
      if (res != null && res['success'] == true && res['data'] != null && res['data']['notifications'] != null) {
        if (mounted) {
          setState(() {
            _notifications = res['data']['notifications'];
            _isLoading = false;
          });
        }
      } else {
        if (mounted) {
          setState(() {
            _isLoading = false;
          });
        }
      }
    } catch (e) {
      print('Error fetching notifications: $e');
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => Navigator.of(context).pop(), // dismiss when tapping outside
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: Align(
          alignment: Alignment.topRight,
          child: GestureDetector(
            onTap: () {}, // prevent dismissing when tapping inside
            child: Container(
              width: 260,
              margin: const EdgeInsets.only(top: 70, right: 16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: const Color(0xFF00897B),
                  width: 3.5,
                ),
              ),
              child: Material(
                color: Colors.transparent,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 20.0),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 4.0),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: const [
                            Text(
                              'Thông báo!',
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.w500,
                                color: Colors.black87,
                              ),
                            ),
                            FaIcon(
                              FontAwesomeIcons.envelope,
                              size: 20,
                              color: Colors.black87,
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      const Divider(height: 1, thickness: 1, color: Color(0xFFEEEEEE)),
                      
                      // Notification Items
                      if (_isLoading)
                        const Padding(
                          padding: EdgeInsets.all(20.0),
                          child: Center(child: CircularProgressIndicator()),
                        )
                      else if (_notifications.isEmpty)
                        const Padding(
                          padding: EdgeInsets.all(20.0),
                          child: Center(child: Text('Không có thông báo mới', style: TextStyle(color: Colors.grey))),
                        )
                      else
                        Flexible(
                          child: ListView.separated(
                            shrinkWrap: true,
                            padding: EdgeInsets.zero,
                            itemCount: _notifications.length,
                            separatorBuilder: (context, index) => const Divider(height: 1, thickness: 1, color: Color(0xFFEEEEEE)),
                            itemBuilder: (context, index) {
                              final item = _notifications[index];
                              
                              String avatarUrl = 'assets/images/web.png';
                              if (item['user'] != null && item['user']['picture'] != null) {
                                avatarUrl = item['user']['picture'].toString().replaceAll('&#x2F;', '/');
                                if (avatarUrl.startsWith('/')) {
                                  avatarUrl = 'https://type.vn$avatarUrl';
                                }
                              }
                              
                              // Parse time from datetimeISO if available
                              String timeText = '';
                              if (item['datetimeISO'] != null) {
                                try {
                                  final dt = DateTime.parse(item['datetimeISO']);
                                  timeText = '${dt.month}/${dt.day}, ${dt.hour}:${dt.minute.toString().padLeft(2, '0')}';
                                } catch (_) {}
                              }
                              if (timeText.isEmpty) timeText = 'Gần đây';
                              
                              bool isRead = item['read'] == true || item['read'] == 1;

                              return _buildNotificationItem(timeText, avatarUrl, !isRead);
                            },
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildNotificationItem(String time, String avatarUrl, bool isUnread) {
    bool isNetwork = avatarUrl.startsWith('http');
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 12),
      child: Row(
        children: [
          CircleAvatar(
            radius: 16,
            backgroundColor: Colors.grey.shade100,
            backgroundImage: isNetwork ? NetworkImage(avatarUrl) as ImageProvider : AssetImage(avatarUrl),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              time,
              style: const TextStyle(
                fontSize: 14,
                color: Color(0xFF78909C), // Blue-grey text matching the UI
              ),
            ),
          ),
          if (isUnread)
            Container(
              width: 8,
              height: 8,
              decoration: const BoxDecoration(
                color: Colors.red,
                shape: BoxShape.circle,
              ),
            ),
        ],
      ),
    );
  }
}
