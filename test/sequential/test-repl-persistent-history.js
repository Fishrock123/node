'use strict';

// Flags: --expose-internals

const common = require('../common')
const stream = require('stream');
const REPL = require('internal/repl');
const assert = require('assert')
const fs = require('fs')
const util = require('util')

common.refreshTmpDir();

// mock os.homedir()
require('os').homedir = function() {
  return common.tmpDir;
}

const UP = { name: 'up' };
const ENTER = { name: 'enter' };

class ArrayStream extends stream.Stream {
  run(data, ctx) {
    this._iter = data[Symbol.iterator]()
    this._ctx = ctx
    this.consume()
  }
  consume() {
    const self = this;

    function doAction() {
      if (self.paused = true) return
      const next = self._iter.next()
      if (next.done) {
        self.emit('keypress', '', { meta: true, name: 'd' });
        self.emit('done')
        return
      }
      const action = next.value

      if (typeof action === 'function') {
        action.call(self._ctx, doAction.bind(this));
      } else if (typeof action === 'object') {
        self.emit('keypress', '', action);
        doAction()
      } else {
        self.emit('data', action + '\n');
        doAction()
      }
    }
    doAction()
  }
  resume() { this.paused = false; if (this._iter) this.consume() }
  write() {}
  pause() { this.paused = true }
}
ArrayStream.prototype.readable = true;

// const input = new stream.Readable({
//   read() {
//     if (!queue.length) repl.emit
//
//     this.push(queue.pop())
//   }
// });

const prompt = '> '

const replDisabled = '\nPersistent history support disabled. Set the NODE_REPL_HISTORY environment\nvariable to a valid, user-writable path to enable.\n'
const convertMsg = '\nConverting old JSON repl history to line-separated history.\nThe new repl history file can be found at ' + common.tmpDir + '/.node_repl_history.\n'

runTest(
  { NODE_REPL_HISTORY: '' },
  [UP],
  [prompt, replDisabled, prompt]
)
runTest(
  { NODE_REPL_HISTORY: '',
    NODE_REPL_HISTORY_FILE: common.testDir + '/fixtures/old-repl-history-file.json' },
  [UP],
  [prompt, replDisabled, prompt]
)
runTest(
  { NODE_REPL_HISTORY: common.testDir + '/fixtures/.node_repl_history' },
  [UP],
  [prompt, prompt + '\'you look fabulous today\'', prompt]
)
runTest(
  { NODE_REPL_HISTORY: common.testDir + '/fixtures/.node_repl_history',
    NODE_REPL_HISTORY_FILE: common.testDir + '/fixtures/old-repl-history-file.json' },
  [UP],
  [prompt, prompt + '\'you look fabulous today\'', prompt]
)
runTest(
  { NODE_REPL_HISTORY: common.testDir + '/fixtures/.node_repl_history',
    NODE_REPL_HISTORY_FILE: '' },
  [UP],
  [prompt, prompt + '\'you look fabulous today\'', prompt]
)
runTest(
  {},
  [UP],
  [prompt]
)
runTest(
  { NODE_REPL_HISTORY_FILE: common.testDir + '/fixtures/old-repl-history-file.json' },
  [UP, ENTER, '\'42\'', function(cb) {
    setTimeout(cb, 50)
  }],
  [prompt, convertMsg, prompt, prompt + '\'=^.^=\'', '\'=^.^=\'\n', prompt,
   '\'', '4', '2', '\'', '\'42\'\n', prompt],
  function ensureFixtureHistory() {
    console.log('hi')
    // XXX(Fishrock123) make sure nothing weird happened to our fixture.
    // Sometimes this test used to erase it and I'm not sure why.
    const history = fs.readFileSync(common.testDir +
                                    '/fixtures/.node_repl_history', 'utf8');
    assert.strictEqual(history,
                       '\'you look fabulous today\'\n\'Stay Fresh~\'\n');
  }
)
runTest(
  {},
  [function(cb) {
    setTimeout(cb, 1000)
  }, UP, UP],
  [prompt, prompt + '\'=^.^=\'', prompt + '\'42\'']
)

function runTest(env, test, expected, after) {
  const _expected = expected.slice(0)[Symbol.iterator]()

  REPL.createInternalRepl(env, {
    input: new ArrayStream()/*new stream.Readable({
      read() {
        const next = _expected.next()
        if (next.done) {
          this.emit('keypress', '', { meta: true, name: 'd' });
          return
        }
        const action = next.value

        if (typeof action === 'function') {
          action.call(ctx, doAction.bind(this));
          this.push('')
        } else if (typeof action === 'object') {
          this.emit('keypress', '', action);
          this.push('')
        } else {
          this.emit('data', action + '\n');
          this.push('')
        }
      }
    })*/,
    output: new stream.Writable({
      write(chunk, _, next) {
        const output = chunk.toString()

        // ignore escapes and blank lines
        if (output.charCodeAt(0) === 27 || /^[\r\n]+$/.test(output))
          return next();

        const expectedOutput = expected.shift()
        if (output !== expectedOutput) {
          console.error('ERROR: ' + util.inspect(self.actual, { depth: 0 }) + ' !== ' +
                        util.inspect(self.expected, { depth: 0 }))
          // console.log('env:', env)
          // console.log('test:', test)
        }

        // console.log(output)

        // assert.strictEqual(output, expectedOutput);
        next();
      }
    }),
    prompt: prompt,
    useColors: false,
    terminal: true
  }, function(err, repl) {
    if (err) throw err

    repl.outputStream.on('end', trace)
    repl.outputStream.on('finish', trace)
    repl.outputStream.on('close', trace)

    repl.inputStream.on('end', trace)
    repl.inputStream.on('finish', trace)
    repl.inputStream.on('close', trace)

    function trace() {
      try {
        throw new Error('tracing...')
      } catch (err) {
        console.log(err.stack)
      }
    }

    repl.on('close', function() {
      console.log('!!!')
    })

    if (after) repl.on('close', after)
    repl.inputStream.run(test, repl)
    repl.inputStream.on('done', function() {
      if (expected.length !== 0)
        console.error('ERROR: ' + expected.length + ' !== 0')
      // assert.strictEqual(expected.length, 0)
    })
  })
}
