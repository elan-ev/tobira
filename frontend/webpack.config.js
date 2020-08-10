const HtmlWebpackPlugin = require('html-webpack-plugin');
const RelayCompilerWebpackPlugin = require('relay-compiler-webpack-plugin');
const path = require('path');
const { APP_PATH, OUT_PATH } = require('./constants');

module.exports = (_env, argv) => ({
  entry: APP_PATH,

  output: {
    filename: 'bundle.js',
    path: OUT_PATH,
    publicPath: '/'
  },

  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.json']
  },

  module: {
    rules: [{
      test: /\.(ts|js)x?$/,
      loader: 'babel-loader',
      ... argv.mode === 'development' && { exclude: /node_modules/ }
    }],
  },

  plugins: [
    new HtmlWebpackPlugin({ inject: true, template: path.join(APP_PATH, 'index.html') }),
    new RelayCompilerWebpackPlugin({
      ...require('./relay.config'),
      languagePlugin: require('relay-compiler-language-typescript').default,
    }),
  ],

  devtool: 'source-map',
});
