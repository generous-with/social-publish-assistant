const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

module.exports = context => {
  const load = file => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
  context.importScripts = (...files) => files.forEach(load);
  load('background.js');
};
