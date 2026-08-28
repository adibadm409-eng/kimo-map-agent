const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.watchFolders = [
  path.resolve(__dirname, 'src'),
];

config.resolver.blockList = [
  /\/python-agent\/.*/,
  /\/audit\/.*/,
  /\/docs\/.*/,
  /\/memory\/.*/,
];

config.resolver.blacklistRE = [
  /\/python-agent\/.*/,
];

if (config.resolver && Array.isArray(config.resolver.excludeNodeModules)) {
  config.resolver.excludeNodeModules = [
    /python-agent\/.*/,
  ];
}

if (config.watcher) {
  config.watcher.watchman = { deferStates: ['hg.update'] };
  config.watcher.unstable_lazySha1 = true;
}

module.exports = config;
