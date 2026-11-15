/**
 * 服务端性能日志打印器（defer 加载，不阻塞首屏解析）
 * 读取 __OPEN_PAGE_SERVER_PERF__ 脚本标签中的服务端渲染性能数据并打印到控制台。
 * window.__MAIN_APP_OPEN_PAGE_PERF__ 由第二个内联脚本初始化，此文件 defer 执行时已就绪。
 */
(function () {
  var thresholdMs = (window.__MAIN_APP_OPEN_PAGE_PERF__ && window.__MAIN_APP_OPEN_PAGE_PERF__.thresholdMs) || 20;

  function toPrintable(entries) {
    return entries
      .filter(function (entry) {
        return entry.important || Number(entry.durationMs || 0) >= thresholdMs;
      })
      .map(function (entry) {
        var clone = {};
        Object.keys(entry).forEach(function (key) {
          if (key !== 'important' && key !== '__important') {
            clone[key] = entry[key];
          }
        });
        return clone;
      });
  }

  try {
    var serverPerfNode = document.getElementById('__OPEN_PAGE_SERVER_PERF__');
    var serverEntries = serverPerfNode && serverPerfNode.textContent
      ? JSON.parse(serverPerfNode.textContent)
      : [];
    if (window.__MAIN_APP_OPEN_PAGE_PERF__) {
      window.__MAIN_APP_OPEN_PAGE_PERF__.serverEntries = serverEntries;
    }
    var rows = toPrintable(serverEntries);
    if (rows.length > 0) {
      console.groupCollapsed(
        '[OpenPagePerf] 服务端 RootLayout 链路 (' + rows.length + '/' + serverEntries.length + ', >= ' + thresholdMs + 'ms)'
      );
      console.table(rows);
      console.groupEnd();
    }
  } catch (e) {
    console.error('[OpenPagePerf] Failed to print server timings:', e);
  }
})();
