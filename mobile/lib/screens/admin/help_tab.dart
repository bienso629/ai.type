import 'package:flutter/material.dart';
import '../../theme/app_colors.dart';
import 'package:url_launcher/url_launcher.dart';

class HelpTab extends StatelessWidget {
  const HelpTab({super.key});

  Future<void> _launchUrl(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Ứng dụng cần tải',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: AppColors.primary,
            ),
          ),
          const SizedBox(height: 16),
          const Divider(),
          const SizedBox(height: 16),
          _buildLinkRow('Tải ffmpeg cho Mac OS:', 'https://evermeet.cx/ffmpeg'),
          const SizedBox(height: 12),
          _buildLinkRow('Auto, hoặc cho Windows / Linux:', 'https://github.com/BtbN/FFmpeg-Builds/releases'),
          const SizedBox(height: 12),
          _buildLinkRow('Tải yt-dlp cho các OS:', 'https://github.com/yt-dlp/yt-dlp/releases'),
          const SizedBox(height: 12),
          _buildLinkRow('Tải Chrome (win) tại:', 'https://commondatastorage.googleapis.com/chromium-browser-snapshots/index.html?prefix=Win'),
        ],
      ),
    );
  }

  Widget _buildLinkRow(String label, String url) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 15, color: AppColors.textPrimary)),
        const SizedBox(height: 4),
        InkWell(
          onTap: () => _launchUrl(url),
          child: Text(
            url,
            style: const TextStyle(fontSize: 14, color: Colors.blue, decoration: TextDecoration.underline),
          ),
        ),
      ],
    );
  }
}
