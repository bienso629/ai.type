const stringsToTest = [
    '{"error": {"message" "Invalid"}}',
    '{"error": "Invalid request"}',
    '{"detail" "Not Found"}',
    '{"error":{"message" "abc"}}',
    '{"error":{"type":"invalid_request_error","message" "abc"}}',
    '{"message": "Endpoint not found"}',
];

for (const text of stringsToTest) {
    try {
        JSON.parse(text);
    } catch(e) {
        console.log(`Text: ${text}`);
        console.log(`Error: ${e.message}`);
    }
}
