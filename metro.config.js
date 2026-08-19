const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.watchFolders = [
  path.resolve(__dirname, 'src'),
];

console.error('METRO_WATCHFOLDERS', JSON.stringify(config.watchFolders));

module.exports = config;
