var webpack = require('webpack');
var CopyWebpackPlugin =  require('copy-webpack-plugin');

module.exports = {
  mode: 'development',

  entry: './src/index.tsx',

  output: {
    publicPath: './build/',
    filename: 'bundle.js',
    path: __dirname + '/build'
  },

  devtool: 'source-map',

  target: 'web',

  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.json', '.css'],
  },

  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      },
      {
        test: /\.(png|jp(e*)g|svg|gif)$/,
        use: [
          {
            loader: 'file-loader',
            options: {
              name: 'images/[hash]-[name].[ext]',
            },
          },
        ],
      },
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      }
    ]
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify('development'),
    }),
    new CopyWebpackPlugin([
      { from: '/Users/tedshaffer/Documents/Projects/chatsworth/frontend/build/bundle.js', to: '/Users/tedshaffer/Documents/Projects/chatsworth/backend/public/build' },
      { from: '/Users/tedshaffer/Documents/Projects/chatsworth/frontend/build/bundle.js.map', to: '/Users/tedshaffer/Documents/Projects/chatsworth/backend/public/build' },
    ]),

    // Custom plugin to log rebuild completion time
    new webpack.ProgressPlugin((percentage, message) => {
      if (percentage === 1) {
        console.log(`\x1b[32m[Webpack Build Complete]\x1b[0m ${new Date().toLocaleString()}`);
      }
    }),
  ]
};
