import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'dart:convert';
import '../theme/app_colors.dart';

class DictionaryScreen extends StatefulWidget {
  const DictionaryScreen({Key? key}) : super(key: key);

  @override
  State<DictionaryScreen> createState() => _DictionaryScreenState();
}

class _DictionaryScreenState extends State<DictionaryScreen> {
  final TextEditingController _searchController = TextEditingController();
  
  List<dynamic> _allWords = [];
  List<dynamic> _words = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    try {
      final String response = await rootBundle.loadString('assets/data/synonym.json');
      final data = await json.decode(response);
      setState(() {
        _allWords = data;
        _words = List.from(_allWords);
        _isLoading = false;
      });
    } catch (e) {
      print('Error loading dictionary: $e');
      setState(() {
        _isLoading = false;
      });
    }
  }

  void _filterWords(String query) {
    if (query.isEmpty) {
      setState(() => _words = List.from(_allWords));
    } else {
      setState(() {
        _words = _allWords.where((w) {
          final word = w['word']?.toString().toLowerCase() ?? '';
          return word.contains(query.toLowerCase());
        }).toList();
      });
    }
  }

  void _showWordDetails(BuildContext context, dynamic item) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (context) {
        final word = item['word']?.toString() ?? '';
        final mean = item['mean']?.toString() ?? '';
        String synonym = item['synonym']?.toString() ?? '';
        if (synonym.startsWith(': ')) synonym = synonym.substring(2);
        String unsynonym = item['unsynonym']?.toString() ?? '';
        if (unsynonym.startsWith(': ')) unsynonym = unsynonym.substring(2);
        
        final sentenceSynonym = item['sentence_with_synonym'] as List<dynamic>? ?? [];
        final sentenceUnsynonym = item['sentence_with_unsynonym'] as List<dynamic>? ?? [];

        return SafeArea(
          child: Padding(
            padding: EdgeInsets.only(
              bottom: MediaQuery.of(context).viewInsets.bottom,
            ),
            child: Container(
              constraints: BoxConstraints(
                maxHeight: MediaQuery.of(context).size.height * 0.85,
              ),
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      margin: const EdgeInsets.only(bottom: 24),
                      decoration: BoxDecoration(
                        color: Colors.grey[300],
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  Text(
                    word,
                    style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Colors.black87),
                  ),
                  const SizedBox(height: 16),
                  Expanded(
                    child: SingleChildScrollView(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (mean.isNotEmpty) ...[
                            const Text('Ý nghĩa', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Color(0xFF10B981))),
                            const SizedBox(height: 8),
                            Text(mean, style: const TextStyle(fontSize: 15, height: 1.4, color: Colors.black87)),
                            const SizedBox(height: 20),
                          ],
                          if (synonym.isNotEmpty) ...[
                            const Text('Từ đồng nghĩa', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Color(0xFF10B981))),
                            const SizedBox(height: 8),
                            Text(synonym, style: const TextStyle(fontSize: 15, height: 1.4, color: Colors.black87)),
                            const SizedBox(height: 12),
                          ],
                          if (sentenceSynonym.isNotEmpty) ...[
                            const Text('Câu ví dụ (đồng nghĩa)', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.black54)),
                            const SizedBox(height: 8),
                            ...sentenceSynonym.map((s) => Padding(
                              padding: const EdgeInsets.only(bottom: 6),
                              child: Text('• $s', style: const TextStyle(fontSize: 14, height: 1.4, color: Colors.black54, fontStyle: FontStyle.italic)),
                            )),
                            const SizedBox(height: 20),
                          ],
                          if (unsynonym.isNotEmpty) ...[
                            const Text('Từ trái nghĩa', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.redAccent)),
                            const SizedBox(height: 8),
                            Text(unsynonym, style: const TextStyle(fontSize: 15, height: 1.4, color: Colors.black87)),
                            const SizedBox(height: 12),
                          ],
                          if (sentenceUnsynonym.isNotEmpty) ...[
                            const Text('Câu ví dụ (trái nghĩa)', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.black54)),
                            const SizedBox(height: 8),
                            ...sentenceUnsynonym.map((s) => Padding(
                              padding: const EdgeInsets.only(bottom: 6),
                              child: Text('• $s', style: const TextStyle(fontSize: 14, height: 1.4, color: Colors.black54, fontStyle: FontStyle.italic)),
                            )),
                            const SizedBox(height: 20),
                          ],
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildWordItem(dynamic item) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item['word']?.toString() ?? '',
                      style: const TextStyle(fontSize: 16, color: Colors.black87, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      item['synonym']?.toString() ?? '',
                      style: const TextStyle(fontSize: 14, color: Colors.black54),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              SizedBox(
                height: 32,
                child: ElevatedButton(
                  onPressed: () => _showWordDetails(context, item),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF10B981), // Emerald green from screenshot
                    foregroundColor: Colors.white,
                    elevation: 0,
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                  child: const Text('Tra cứu', style: TextStyle(fontSize: 12)),
                ),
              ),
            ],
          ),
        ),
        const Divider(height: 1, color: Colors.black12),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: const Text('Từ điển', style: TextStyle(color: Colors.black87, fontWeight: FontWeight.bold, fontSize: 18)),
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        iconTheme: const IconThemeData(color: Colors.black87),

      ),
      body: Column(
        children: [
          // Filter Bar (WP Post style)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: Colors.black12)),
            ),
            child: Container(
              height: 46,
              decoration: BoxDecoration(
                border: Border.all(color: Colors.grey.withOpacity(0.3)),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 12),
                    child: Icon(Icons.search, color: Colors.grey, size: 22),
                  ),
                  Expanded(
                    child: TextField(
                      controller: _searchController,
                      onChanged: _filterWords,
                      decoration: const InputDecoration(
                        hintText: 'Tìm kiếm từ...',
                        hintStyle: TextStyle(color: Colors.grey, fontSize: 15),
                        border: InputBorder.none,
                        enabledBorder: InputBorder.none,
                        focusedBorder: InputBorder.none,
                        isDense: true,
                        contentPadding: EdgeInsets.zero,
                      ),
                      style: const TextStyle(fontSize: 15),
                    ),
                  ),
                ],
              ),
            ),
          ),
          


          // List
          Expanded(
            child: _isLoading 
                ? const Center(child: CircularProgressIndicator())
                : ListView.builder(
                    padding: EdgeInsets.zero,
                    itemCount: _words.length,
                    itemBuilder: (context, index) {
                      return _buildWordItem(_words[index]);
                    },
                  ),
          ),
          

        ],
      ),
    );
  }
}
