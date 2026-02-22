/**
 * Custom Webpack config for Angular 17 (Webpack 5).
 * - Turn off Node 'stream' polyfill to silence warnings from sax/lib/sax.js
 *   If you truly need stream, replace `false` with: require.resolve('stream-browserify')
 */
module.exports = {
  resolve: {
    fallback: {
      stream: false
    }
  }
};
